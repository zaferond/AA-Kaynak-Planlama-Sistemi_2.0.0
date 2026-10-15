import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { readRevisionMap } from "../backend/read-records.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { seedBenchmarkStore } from "../scripts/benchmark-fixture.mjs";

const password = hashPassword("Revision-scope-test-only-284!");
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-revision-read-"));
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
      username: "revision." + id,
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
  const observations = [],
    raw = store.db.raw;
  t.mock.method(store.db, "raw", function (sql, values, consume) {
    const result = raw.call(this, sql, values, consume);
    if (/^SELECT\b/.test(sql) && /FROM kp_revisions/.test(sql))
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

test("revision scope uses bound exact team IDs in streaming and ordinary queries, preserving special/zero revisions", async () => {
  const ids = [
    "constructor",
    "__proto__",
    "x'); DROP TABLE kp_revisions;--",
    "constructor",
  ];
  const input = [
    ["allocation", "constructor|p|2026-01", "0"],
    ["allocation", "@risk:deleted", 3],
    ["allocation", "@actual:r|p|2026-01", 4],
    ["allocation", "@worked:r|2026-01", 5],
    ["allocation", "@calendar:shared", 6],
    ["allocation", "@directory:shared", 9],
    ["allocation", "@person:r|2026-01-02|leave", 7],
    ["project", "p", 8],
  ];
  for (const provider of ["sqljs", "mssql"])
    for (const streaming of [true, false]) {
      const check = (sql, params) => {
        assert.deepEqual(params, ids.slice(0, 3));
        assert(!sql.includes(ids[2]));
        assert(sql.includes("IN (@p0,@p1,@p2)"));
        assert(sql.includes("[record_id] LIKE '@%'"));
        assert.equal(sql.endsWith(" ORDER BY rowid"), provider === "sqljs");
        assert(
          sql.includes(
            provider === "sqljs"
              ? "instr([record_id]||'|','|')"
              : "CHARINDEX('|',[record_id]+'|')",
          ),
        );
        if (provider === "mssql")
          assert(sql.includes("COLLATE Latin1_General_100_BIN2"));
      };
      const c = streaming
        ? {
            scan: async (sql, params, consume) => {
              check(sql, params);
              input.forEach(consume);
              return { rowCount: input.length };
            },
          }
        : {
            query: async (sql, params) => {
              check(sql, params);
              return {
                rows: input.map(([kind, record_id, revision]) => ({
                  kind,
                  record_id,
                  revision,
                })),
              };
            },
          };
      assert.deepEqual(await readRevisionMap(c, provider, ids), {
        "allocation:constructor|p|2026-01": 0,
        "risk:deleted": 3,
        "actual:r|p|2026-01": 4,
        "workedHours:r|2026-01": 5,
        "calendar:shared": 6,
        "directory:shared": 9,
        "personDay:r|2026-01-02|leave": 7,
        "project:p": 8,
      });
    }
});

test("revision scope has empty/full/900/901 and separator fallback without truncation; invalid scopes fail early", async () => {
  for (const provider of ["sqljs", "mssql"])
    for (const ids of [
      undefined,
      [],
      Array.from({ length: 900 }, (_, i) => "t" + i),
      Array.from({ length: 901 }, (_, i) => "t" + i),
      ["legacy|team"],
    ]) {
      const filtered =
        ids !== undefined &&
        ids.length <= 900 &&
        !ids.some((id) => id.includes("|"));
      await readRevisionMap(
        {
          scan: async (sql, params) => {
            assert.equal(sql.includes("WHERE"), filtered);
            assert.equal(params.length, filtered ? ids.length : 0);
            if (ids?.length === 900) assert(sql.includes("@p899"));
            return { rowCount: 0 };
          },
        },
        provider,
        ids,
      );
    }
  const c = {
    query: () => {
      throw Error("unexpected query");
    },
  };
  for (const scope of [null, "t", [1]])
    await assert.rejects(
      readRevisionMap(c, "sqljs", scope),
      /Invalid revision read scope/,
    );
  await assert.rejects(
    readRevisionMap(c, "unknown", []),
    /Invalid revision read provider/,
  );
  await assert.rejects(
    readRevisionMap(
      {
        scan: async (_sql, _p, consume) => {
          consume(["allocation", "@risk:x", 1]);
          return { rowCount: 2 };
        },
      },
      "sqljs",
      [],
    ),
  );
});

test("real SQL revision filtering treats wildcard/case/Unicode/reserved team IDs literally and retains row order", async (t) => {
  const { store } = await setup(t);
  await store.transaction(async (c) => {
    const entries = [
      ["A_%[", 0],
      ["a_%[", 1],
      ["A_other", 2],
      ["İstanbul", 3],
      ["__proto__", 4],
      ["constructor", 5],
    ];
    await c.upsert(
      "revisions",
      entries.map(([id, revision]) => ({
        kind: "allocation",
        record_id: id + "|p|2026-01",
        revision,
      })),
    );
    // Legacy bare tombstone IDs follow the same first-component scope rule.
    await c.upsert("revisions", [
      { kind: "allocation", record_id: "constructor", revision: 6 },
    ]);
    const scoped = await readRevisionMap(
      c,
      "sqljs",
      entries.filter((_, i) => i !== 1 && i !== 2).map(([id]) => id),
    );
    assert.deepEqual(
      Object.keys(scoped).filter((k) => k.startsWith("allocation:")),
      [
        "allocation:A_%[|p|2026-01",
        "allocation:İstanbul|p|2026-01",
        "allocation:__proto__|p|2026-01",
        "allocation:constructor|p|2026-01",
        "allocation:constructor",
      ],
    );
    assert.equal(scoped["allocation:A_%[|p|2026-01"], 0);
    assert.deepEqual(
      await readRevisionMap({ query: c.query }, "sqljs", [
        "A_%[",
        "İstanbul",
        "__proto__",
        "constructor",
      ]),
      scoped,
    );
  });
});

test("all authenticated roles match complete-read revision views, including transfers and deleted risk/actual/calendar records", async (t) => {
  const { store, users, team, other, observations, reference } = await setup(t);
  const data = (await store.read()).data,
    resource = data.resources.find((r) => r.id === "bench-r0");
  const deleted = team.id + "|bench-p0|2029-12";
  // A deletion tombstone must originate from a real record, including zero.
  await store.mutate(users.admin, (d, u) =>
    applyChanges(d, u, [
      {
        kind: "allocation",
        id: deleted,
        value: 0,
        revision: d.revisions["allocation:" + deleted] || 0,
      },
    ]),
  );
  await store.mutate(users.admin, (d, u) =>
    applyChanges(d, u, [
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
        id: deleted,
        revision: d.revisions["allocation:" + deleted] || 0,
        operation: "delete",
      },
    ]),
  );
  await store.transaction((c) =>
    c.upsert("revisions", [
      { kind: "allocation", record_id: "@risk:deleted-risk", revision: 7 },
      { kind: "allocation", record_id: "@calendar:shared", revision: 8 },
      {
        kind: "allocation",
        record_id: "@actual:bench-r0|gone-project|2026-01",
        revision: 9,
      },
      {
        kind: "allocation",
        record_id: "@actual:bench-r0|gone-project|2026-07",
        revision: 10,
      },
      {
        kind: "allocation",
        record_id: "@worked:bench-r0|2026-01",
        revision: 11,
      },
      {
        kind: "allocation",
        record_id: "@person:bench-r0|2026-01-02|leave",
        revision: 12,
      },
      {
        kind: "allocation",
        record_id: "@person:bench-r0|2026-07-02|training",
        revision: 13,
      },
    ]),
  );
  const fullCount = Object.keys((await store.read()).data.revisions).length;
  for (const user of Object.values(users)) {
    observations.length = 0;
    const actual = await store.view(user),
      read = observations[0],
      full = await reference(user);
    assert.deepEqual(actual, full);
    assert.equal(JSON.stringify(actual), JSON.stringify(full));
    assert.equal(read.sql.includes("WHERE"), user.role !== "admin");
    if (user.role === "admin") assert.equal(read.rows, fullCount);
    if (user.role === "normal") assert(read.rows < fullCount);
    if (user.role === "manager") assert.equal(read.rows, fullCount);
    assert.equal(actual.data.revisions["risk:deleted-risk"], 7);
    assert.equal(actual.data.revisions["calendar:shared"], 8);
    if (user.role === "normal")
      assert.equal(actual.data.revisions["allocation:" + deleted], undefined);
    if (user._id === "manager")
      assert.equal(actual.data.revisions["allocation:" + deleted], 2);
  }
  const normal = await store.view(users.normal);
  assert.equal(
    normal.data.revisions["actual:bench-r0|gone-project|2026-01"],
    9,
  );
  assert.equal(
    normal.data.revisions["actual:bench-r0|gone-project|2026-07"],
    10,
  );
  assert.equal(
    normal.data.revisions["personDay:bench-r0|2026-07-02|training"],
    13,
  );
});

test("revision read uses persisted leadership/account; inactive and spoofed users cannot bypass visibility", async (t) => {
  const { store, users, team, other, observations, reference } = await setup(t);
  assert.deepEqual(
    await store.view({
      ...users.manager,
      role: "admin",
      leaders: [other.lead],
    }),
    await reference(users.manager),
  );
  await store.mutate(users.admin, (d, u) =>
    applyChanges(d, u, [
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
  await store.transaction((c) =>
    c.query("DELETE FROM kp_user_leaders WHERE user_id=@p0", [
      users.manager._id,
    ]),
  );
  assert.deepEqual(
    await store.view(users.manager),
    await reference(users.manager),
  );
  await store.transaction((c) =>
    c.query("UPDATE kp_users SET active=0 WHERE id=@p0", [users.manager._id]),
  );
  observations.length = 0;
  await assert.rejects(store.view(users.manager), (e) => e.status === 401);
  assert.equal(observations.length, 0);
});

test("manager mutations retain complete revisions, hidden teams and conflict detection", async (t) => {
  const { store, users, team, other, observations, reference } = await setup(t);
  const before = await store.read(),
    key = Object.keys(before.data.allocations).find((k) =>
      k.startsWith(team.id + "|"),
    ),
    hidden = Object.keys(before.data.allocations).find((k) =>
      k.startsWith(other.id + "|"),
    );
  observations.length = 0;
  const result = await store.mutate(
    users.manager,
    (d, u) => {
      assert.deepEqual(d.revisions, before.data.revisions);
      applyChanges(d, u, [
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
  assert(
    observations.every(
      (x) => !x.sql.includes("WHERE") && x.values.length === 0,
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
  await assert.rejects(
    store.mutate(users.manager, (d, u) =>
      applyChanges(d, u, [
        {
          kind: "allocation",
          id: key,
          revision: before.data.revisions["allocation:" + key],
          value: 0.2,
        },
      ]),
    ),
    (e) => e.status === 409,
  );
  assert.deepEqual(await store.read(), after);
});

test("empty and legacy team scopes keep special revisions and full-read reference semantics", async (t) => {
  const { store, users, other, observations, reference } = await setup(t);
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
  const empty = await store.view(users.manager);
  assert(observations[0].sql.includes("WHERE"));
  assert(observations[0].values.length > 0);
  assert.deepEqual(empty, await reference(users.manager));
  await store.transaction((c) =>
    c.upsert("teams", [
      {
        id: "legacy|team",
        name: "Legacy",
        leader_name: other.lead,
        manager_name: "",
        excel_capacity: 0,
        catalog: false,
      },
    ]),
  );
  observations.length = 0;
  const legacy = await store.view(users.manager);
  assert(!observations[0].sql.includes("WHERE"));
  assert.deepEqual(legacy, await reference(users.manager));
});
