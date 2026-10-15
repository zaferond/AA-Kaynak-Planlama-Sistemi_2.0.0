import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { readCompositeMap } from "../backend/read-records.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { seedBenchmarkStore } from "../scripts/benchmark-fixture.mjs";

const password = hashPassword("Read-scope-test-only-284!");
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-planning-read-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "test.sqlite"),
    },
  });
  t.after(async () => {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await store.connect();
  await seedBenchmarkStore(store, 1000, {
    resources: 20,
    actuals: 200,
    percentages: 200,
    calendarDays: 20,
  });
  const teams = (await store.read()).data.teams;
  const team = teams.find((x) => x.lead),
    other = teams.find((x) => x.lead && x.lead !== team.lead);
  const users = {};
  for (const [id, role, leaders, resourceId] of [
    ["admin", "admin", [], ""],
    ["manager", "manager", [team.lead], ""],
    ["normal", "normal", [team.lead], "bench-r0"],
    ["unassigned", "manager", [], ""],
    ["no-owner", "normal", [], ""],
  ]) {
    await store.bootstrapUser({
      _id: id,
      username: "readscope." + id,
      name: "Synthetic " + id,
      role,
      leaders,
      resourceId,
      active: true,
      password: await password,
      revision: 1,
      version: 1,
    });
    users[id] = await store.findUser({ id });
  }
  const observations = [];
  const raw = store.db.raw;
  t.mock.method(store.db, "raw", function (sql, values, consume) {
    const result = raw.call(this, sql, values, consume);
    if (/^SELECT\b/.test(sql) && /FROM \[kp_allocations\]/.test(sql))
      observations.push({ sql, values, rows: result.rowCount });
    return result;
  });
  const reference = (user) =>
    store.transaction(async (c) => {
      const { data, generation } = await store.read(c);
      const active = await store.findUser({ id: user._id }, c);
      return store.projectView(data, generation, active, c);
    }, true);
  return { store, users, team, other, observations, reference };
}

test("planning read parameters keep SQL fixed and preserve zero/reserved IDs on both adapters", async () => {
  const ids = [
    "constructor",
    "__proto__",
    "x'); DROP TABLE kp_allocations;--",
    "constructor",
  ];
  for (const provider of ["sqljs", "mssql"]) {
    for (const streaming of [true, false]) {
      const check = (sql, params) => {
        assert(
          sql.endsWith(
            " WHERE [team_id] IN (@p0,@p1,@p2)" +
              (provider === "sqljs" ? " ORDER BY rowid" : ""),
          ),
        );
        assert.deepEqual(params, ids.slice(0, 3));
        assert(!sql.includes(ids[2]));
      };
      const c = streaming
        ? {
            scan: async (sql, params, consume) => {
              check(sql, params);
              consume(
                provider === "sqljs"
                  ? ["constructor|p|2026-01", 0]
                  : ["constructor", "p", "2026-01", 0],
              );
              return { rowCount: 1 };
            },
          }
        : {
            query: async (sql, params) => {
              check(sql, params);
              return {
                rows: [
                  provider === "sqljs"
                    ? { record_key: "constructor|p|2026-01", amount: 0 }
                    : {
                        team_id: "constructor",
                        project_id: "p",
                        month: "2026-01",
                        amount: 0,
                      },
                ],
              };
            },
          };
      assert.deepEqual(
        await readCompositeMap(c, provider, "allocations", "amount", ids),
        { "constructor|p|2026-01": 0 },
      );
    }
  }
});

test("empty planning scope reads no rows; large scopes fall back without truncation", async () => {
  for (const provider of ["sqljs", "mssql"]) {
    const scopes = [
      [],
      Array.from({ length: 900 }, (_, i) => "t" + i),
      Array.from({ length: 901 }, (_, i) => "t" + i),
    ];
    for (const ids of scopes) {
      const c = {
        scan: async (sql, params, consume) => {
          assert.equal(params.length, ids.length === 900 ? 900 : 0);
          if (!ids.length)
            assert(
              sql.endsWith(
                " WHERE 1=0" + (provider === "sqljs" ? " ORDER BY rowid" : ""),
              ),
            );
          else if (ids.length === 901) assert(!sql.includes("WHERE"));
          else assert(sql.includes("@p899)"));
          if (ids.length === 901) {
            consume(
              provider === "sqljs"
                ? ["t900|p|2026-01", 1]
                : ["t900", "p", "2026-01", 1],
            );
            return { rowCount: 1 };
          }
          return { rowCount: 0 };
        },
      };
      assert.deepEqual(
        await readCompositeMap(c, provider, "allocations", "amount", ids),
        ids.length === 901 ? { "t900|p|2026-01": 1 } : {},
      );
    }
  }
  const unused = {
    query: () => {
      throw Error("must not query");
    },
  };
  for (const [name, column, scope] of [
    ["actual_allocations", "amount", {}],
    ["allocations", "amount", "t"],
    ["allocations", "amount", [1]],
  ])
    await assert.rejects(
      readCompositeMap(unused, "sqljs", name, column, scope),
      /Invalid composite read scope/,
    );
});

test("authenticated scoped SQL views match full reads for all roles, transfers, early history and tombstones", async (t) => {
  const { store, users, team, other, observations, reference } = await setup(t);
  const { data } = await store.read();
  const resource = data.resources.find((r) => r.id === "bench-r0");
  const ownKey = Object.keys(data.allocations).find((k) =>
    k.startsWith(team.id + "|"),
  );
  const deleted = team.id + "|bench-p0|2029-12";
  // A deletion tombstone must originate from a real record, including zero.
  await store.mutate(users.admin, (d, active) =>
    applyChanges(d, active, [
      {
        kind: "allocation",
        id: deleted,
        value: 0,
        revision: d.revisions["allocation:" + deleted] || 0,
      },
    ]),
  );
  await store.mutate(users.admin, (d, active) =>
    applyChanges(d, active, [
      {
        kind: "resource",
        id: resource.id,
        revision: d.revisions["resource:" + resource.id] || 0,
        value: {
          ...resource,
          versions: [
            {
              ...resource.versions[0],
              effective: "2026-03",
              start: "2026-03-01",
            },
            {
              ...resource.versions[0],
              effective: "2026-06",
              team: other.id,
              lead: other.lead,
              status: "İşten Ayrıldı",
              end: "2026-06-30",
            },
          ],
        },
      },
      {
        kind: "allocation",
        id: ownKey,
        revision: d.revisions["allocation:" + ownKey],
        value: 0,
      },
      {
        kind: "allocation",
        id: deleted,
        revision: d.revisions["allocation:" + deleted] || 0,
        operation: "delete",
      },
    ]),
  );
  for (const user of Object.values(users)) {
    observations.length = 0;
    const actual = await store.view(user);
    const read = observations[0];
    const full = await reference(user);
    assert.deepEqual(actual, full);
    assert.deepEqual(
      Object.keys(actual.data.allocations),
      Object.keys(full.data.allocations),
    );
    assert.equal(read.rows, Object.keys(actual.data.allocations).length);
    assert.equal(read.sql.includes("WHERE"), user.role !== "admin");
    if (user.role === "normal" && user.leaders.length) assert(read.rows < 1000);
    if (user.role === "normal")
      assert.deepEqual(
        actual.data.actualAllocations,
        Object.fromEntries(
          Object.entries((await store.read()).data.actualAllocations).filter(
            ([k]) => k.startsWith(user.resourceId + "|") && !!user.resourceId,
          ),
        ),
      );
    if (user.role === "manager")
      assert.equal(actual.data.revisions["allocation:" + deleted], 2);
  }
  const normal = await store.view(users.normal);
  assert(
    Object.keys(normal.data.actualTeamTotals).length >
      Object.keys(normal.data.actualAllocations).length,
  );
  assert.equal(normal.data.allocations[ownKey], 0);
  assert.equal(Object.hasOwn(normal.data.allocations, deleted), false);
  assert(
    Object.keys(normal.data.actualAllocations).some((k) =>
      k.endsWith("2026-01"),
    ),
  );
  assert(
    Object.keys(normal.data.actualAllocations).some((k) =>
      k.endsWith("2026-07"),
    ),
  );
});

test("planning read uses the current persisted account and team leadership, never caller scope", async (t) => {
  const { store, users, team, other, observations, reference } = await setup(t);
  const spoofed = { ...users.manager, role: "admin", leaders: [other.lead] };
  assert.deepEqual(await store.view(spoofed), await reference(users.manager));
  await store.mutate(users.admin, (d, active) =>
    applyChanges(d, active, [
      {
        kind: "team",
        id: team.id,
        revision: d.revisions["team:" + team.id] || 0,
        value: { ...team, lead: other.lead },
      },
    ]),
  );
  assert.deepEqual(
    await store.view(users.manager),
    await reference(users.manager),
  );
  assert(
    Object.keys((await store.view(users.manager)).data.allocations).some((k) =>
      k.startsWith(team.id + "|"),
    ),
  );
  await store.transaction((c) =>
    c.query("DELETE FROM kp_user_leaders WHERE user_id=@p0", [
      users.manager._id,
    ]),
  );
  assert.deepEqual(
    await store.view(users.manager),
    await reference(users.manager),
  );
  assert.equal(
    Object.keys((await store.view(users.manager)).data.allocations).length,
    1000,
  );
  await store.transaction((c) =>
    c.query("UPDATE kp_users SET active=0 WHERE id=@p0", [users.manager._id]),
  );
  observations.length = 0;
  await assert.rejects(store.view(users.manager), (e) => e.status === 401);
  assert.equal(observations.length, 0);
});

test("manager mutations still read complete snapshots and retain other teams and deletion revisions", async (t) => {
  const { store, users, team, other, observations, reference } = await setup(t);
  const before = await store.read();
  const key = Object.keys(before.data.allocations).find((k) =>
    k.startsWith(team.id + "|"),
  );
  const hidden = Object.keys(before.data.allocations).find((k) =>
    k.startsWith(other.id + "|"),
  );
  observations.length = 0;
  const result = await store.mutate(
    users.manager,
    (d, active) => {
      assert.deepEqual(d.allocations, before.data.allocations);
      applyChanges(d, active, [
        {
          kind: "allocation",
          id: key,
          revision: d.revisions["allocation:" + key],
          operation: "delete",
        },
      ]);
    },
    { returnView: true },
  );
  assert(observations.length > 0);
  assert(
    observations.every(
      (row) => !row.sql.includes("WHERE") && row.values.length === 0,
    ),
  );
  assert.deepEqual(result, await reference(users.manager));
  const after = await store.read();
  assert.equal(after.generation, before.generation + 1);
  assert.equal(after.data.allocations[hidden], before.data.allocations[hidden]);
  assert.equal(
    after.data.revisions["allocation:" + hidden],
    before.data.revisions["allocation:" + hidden],
  );
  assert.equal(
    after.data.revisions["allocation:" + key],
    before.data.revisions["allocation:" + key] + 1,
  );
  assert.equal(Object.keys(after.data.allocations).length, 999);
});

test("legacy team IDs containing composite separators retain the full-read view semantics", async (t) => {
  const { store, users, team, other, observations, reference } = await setup(t);
  const legacyId = team.id + "|legacy";
  await store.transaction(async (c) => {
    await c.upsert("teams", [
      {
        id: legacyId,
        name: "Legacy",
        leader_name: other.lead,
        manager_name: "",
        excel_capacity: 0,
        catalog: false,
      },
    ]);
    await c.upsert("allocations", [
      {
        team_id: legacyId,
        project_id: "bench-p0",
        month: "2026-01",
        amount: 0.75,
      },
    ]);
  });
  observations.length = 0;
  const actual = await store.view(users.manager);
  assert(observations.every((row) => !row.sql.includes("WHERE")));
  assert.deepEqual(actual, await reference(users.manager));
  assert.equal(actual.data.allocations[legacyId + "|bench-p0|2026-01"], 0.75);
});

test("an assigned leadership without teams still sees all planning rows and ordinary-query fallback matches streaming", async (t) => {
  const { store, users, observations } = await setup(t);
  await store.transaction(async (c) => {
    await c.upsert("leaders", [{ name: "Empty leadership", manager_name: "" }]);
    await c.query("DELETE FROM kp_user_leaders WHERE user_id=@p0", [
      users.manager._id,
    ]);
    await c.upsert("user_leaders", [
      { user_id: users.manager._id, leader_name: "Empty leadership" },
    ]);
  });
  observations.length = 0;
  const view = await store.view(users.manager);
  assert.equal(Object.keys(view.data.allocations).length, 1000);
  assert.equal(observations[0].rows, 1000);
  assert(!observations[0].sql.includes(" WHERE 1=0"));
  await store.transaction(async (c) => {
    const active = view.user;
    const streamed = await store.read(c, active);
    assert.deepEqual(await store.read({ query: c.query }, active), streamed);
    // Empty normal scope uses portable SQL in this SQL.js adapter test.
    // Nonempty MSSQL predicates are checked separately against their dialect.
    const emptyActive = { ...active, role: "normal" };
    const emptyStreamed = await store.read(c, emptyActive);
    const provider = store.provider;
    try {
      store.provider = "mssql";
      assert.deepEqual(
        await store.read({ query: c.query }, emptyActive),
        emptyStreamed,
      );
    } finally {
      store.provider = provider;
    }
  }, true);
});

test("personal map scopes use bound owner IDs on both adapters and retain zero values", async () => {
  const ids = ["constructor", "r'); DROP TABLE kp_resources;--", "constructor"];
  for (const provider of ["sqljs", "mssql"])
    for (const [name, column, key] of [
      ["actual_worked_hours", "hours", "constructor|2026-01"],
      ["actual_percent_entries", "percent", "constructor|p|2026-01"],
    ]) {
      const c = {
        query: async (sql, params) => {
          assert.deepEqual(params, ids.slice(0, 2));
          assert(sql.includes(" WHERE [resource_id] IN (@p0,@p1)"));
          assert(!sql.includes(ids[1]));
          assert.equal(sql.endsWith(" ORDER BY rowid"), provider === "sqljs");
          return {
            rows: [
              provider === "sqljs"
                ? { record_key: key, [column]: 0 }
                : {
                    resource_id: "constructor",
                    project_id: "p",
                    month: "2026-01",
                    [column]: 0,
                  },
            ],
          };
        },
      };
      assert.deepEqual(await readCompositeMap(c, provider, name, column, ids), {
        [key]: 0,
      });
    }
});

test("empty, large and legacy personal scopes never truncate records or interpolate owner strings", async () => {
  for (const provider of ["sqljs", "mssql"])
    for (const ids of [
      [],
      Array.from({ length: 900 }, (_, i) => "r" + i),
      Array.from({ length: 901 }, (_, i) => "r" + i),
      ["r|legacy"],
    ]) {
      const full = ids.length > 900 || ids.some((id) => id.includes("|"));
      const c = {
        query: async (sql, params) => {
          assert.equal(params.length, full ? 0 : ids.length);
          assert.equal(sql.includes("WHERE"), !full);
          if (!ids.length) assert(sql.includes("WHERE 1=0"));
          if (ids.length === 900) assert(sql.includes("@p899)"));
          return {
            rows: full
              ? [
                  provider === "sqljs"
                    ? { record_key: "r900|2026-01", hours: 5 }
                    : { resource_id: "r900", month: "2026-01", hours: 5 },
                ]
              : [],
          };
        },
      };
      assert.deepEqual(
        await readCompositeMap(
          c,
          provider,
          "actual_worked_hours",
          "hours",
          ids,
        ),
        full ? { "r900|2026-01": 5 } : {},
      );
    }
});

test("personal SQL reads reduce rows while preserving transfers, owner exceptions, role scope and full mutation snapshots", async (t) => {
  const { store, users, team, other, reference } = await setup(t);
  const data = (await store.read()).data;
  const owner = data.resources.find((r) => r.id === users.normal.resourceId);
  await store.mutate(users.admin, (d, active) =>
    applyChanges(d, active, [
      ...data.resources.map((r) => ({
        kind: "workedHours",
        id: r.id + "|2026-01",
        value: 160,
        revision: 0,
      })),
      {
        kind: "workedHours",
        id: owner.id + "|2026-07",
        value: 160,
        revision: 0,
      },
      {
        kind: "resource",
        id: owner.id,
        revision: d.revisions["resource:" + owner.id] || 0,
        value: {
          ...owner,
          versions: [
            { ...owner.versions[0], effective: "2026-03", start: "2026-03-01" },
            {
              ...owner.versions[0],
              effective: "2026-06",
              team: other.id,
              lead: other.lead,
              status: "İşten Ayrıldı",
              end: "2026-06-30",
            },
          ],
        },
      },
    ]),
  );
  const reads = [],
    raw = store.db.raw;
  t.mock.method(store.db, "raw", function (sql, params, consume) {
    const result = raw.call(this, sql, params, consume);
    const name = /^SELECT\b/.test(sql)
      ? /FROM \[kp_(actual_percent_entries|actual_worked_hours|actual_allocations)\]/.exec(
          sql,
        )?.[1]
      : undefined;
    if (name) reads.push({ name, sql, rows: result.rowCount });
    return result;
  });
  for (const user of Object.values(users)) {
    reads.length = 0;
    const view = await store.view(user);
    const observed = [...reads];
    assert.deepEqual(view, await reference(user));
    const percent = observed.find((r) => r.name === "actual_percent_entries");
    const hours = observed.find((r) => r.name === "actual_worked_hours");
    assert.equal(
      observed.find((r) => r.name === "actual_allocations").rows,
      200,
    );
    if (user.role === "admin") {
      assert.equal(percent.rows, 200);
      assert.equal(hours.rows, 21);
    } else if (user.role === "normal" && user.resourceId) {
      assert.equal(percent.rows, 10);
      assert.equal(hours.rows, 2);
      assert.equal(view.data.actualWorkedHours[owner.id + "|2026-07"], 160);
    } else if (!user.leaders.length) {
      assert.equal(percent.rows, 0);
      assert.equal(hours.rows, 0);
    } else {
      assert(percent.rows < 200);
      assert.equal(
        view.data.actualWorkedHours[owner.id + "|2026-07"],
        undefined,
      );
    }
    assert.equal(percent.sql.includes("WHERE"), user.role !== "admin");
  }
  const before = await store.read(),
    key = Object.keys(before.data.actualAllocations).find((k) =>
      k.startsWith(owner.id + "|"),
    );
  reads.length = 0;
  await store.mutate(users.normal, (d, active) => {
    assert.equal(Object.keys(d.actualPercentEntries).length, 200);
    assert.equal(Object.keys(d.actualWorkedHours).length, 21);
    applyChanges(d, active, [
      {
        kind: "actual",
        id: key,
        value: 0.005,
        revision: d.revisions["actual:" + key],
      },
    ]);
  });
  assert(reads.every((r) => !r.sql.includes("WHERE")));
  const after = await store.read();
  for (const [k, v] of Object.entries(before.data.actualWorkedHours))
    assert.equal(after.data.actualWorkedHours[k], v);
  for (const [k, v] of Object.entries(before.data.actualPercentEntries))
    if (k !== key) assert.equal(after.data.actualPercentEntries[k], v);
});

test("legacy resource identities retain full personal reads with identical scoped output", async (t) => {
  const { store, users, reference } = await setup(t);
  await store.transaction((c) =>
    c.upsert("resources", [
      { id: "legacy|resource", name: "Synthetic legacy", note: "", code: "" },
    ]),
  );
  const reads = [],
    raw = store.db.raw;
  t.mock.method(store.db, "raw", function (sql, params, consume) {
    const result = raw.call(this, sql, params, consume);
    if (
      /^SELECT\b/.test(sql) &&
      /FROM \[kp_actual_(worked_hours|percent_entries)\]/.test(sql)
    )
      reads.push(sql);
    return result;
  });
  const view = await store.view(users.normal);
  assert.equal(reads.length, 2);
  assert(reads.every((sql) => !sql.includes("WHERE")));
  assert.deepEqual(view, await reference(users.normal));
});
