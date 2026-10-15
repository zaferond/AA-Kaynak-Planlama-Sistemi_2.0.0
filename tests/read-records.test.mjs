import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import {
  readRecordMap,
  readCompositeMap,
  readNumericSnapshot,
  revisionRecordKey,
} from "../backend/read-records.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { hashPassword } from "../backend/auth.mjs";

test("streaming and ordinary-query adapters build identical maps including zero and own reserved keys", async () => {
  const input = [
    ["__proto__", 0],
    ["constructor", 0.25],
    ["toString", 2],
    ["Türkçe", 3],
  ];
  const scan = {
    scan: async (sql, values, consume) => {
      assert.equal(sql, "fixed query");
      assert.deepEqual(values, []);
      for (const row of input) consume(row);
      return { rowCount: input.length };
    },
    query: () => {
      throw Error("ordinary query must not be used");
    },
  };
  const ordinary = {
    query: async (sql) => {
      assert.equal(sql, "fixed query");
      return {
        rows: input.map(([key, amount]) => ({
          amount,
          key,
          ignored: "unused",
        })),
      };
    },
  };
  const expected = Object.fromEntries(input);
  for (const c of [scan, ordinary]) {
    const result = await readRecordMap(
      c,
      "fixed query",
      ["key", "amount"],
      ([key]) => key,
    );
    assert.deepEqual(result, expected);
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(Object.hasOwn(result, "__proto__"), true);
  }
  assert.deepEqual(
    await readRecordMap(
      { scan: async () => ({ rowCount: 0 }) },
      "empty",
      ["key", "value"],
      ([key]) => key,
    ),
    {},
  );
});

test("all revision prefixes and deletion tombstones decode identically on both read paths", async () => {
  const input = [
    ["allocation", "t|p|2026-09", 4],
    ["allocation", "@risk:gone", "5"],
    ["allocation", "@actual:r|p|2026-09", 6],
    ["allocation", "@worked:r|2026-09", 7],
    ["allocation", "@calendar:shared", 8],
    ["allocation", "@person:r|2026-09-02|leave", 9],
    ["project", "constructor", 10],
    ["resource", "r", 11],
    ["team", "t", 12],
  ];
  const expected = {
    "allocation:t|p|2026-09": 4,
    "risk:gone": 5,
    "actual:r|p|2026-09": 6,
    "workedHours:r|2026-09": 7,
    "calendar:shared": 8,
    "personDay:r|2026-09-02|leave": 9,
    "project:constructor": 10,
    "resource:r": 11,
    "team:t": 12,
  };
  for (const c of [
    {
      scan: async (_sql, _values, consume) => {
        input.forEach(consume);
        return { rowCount: input.length };
      },
    },
    {
      query: async () => ({
        rows: input.map(([kind, record_id, revision]) => ({
          kind,
          record_id,
          revision,
        })),
      }),
    },
  ])
    assert.deepEqual(
      await readRecordMap(
        c,
        "fixed",
        ["kind", "record_id", "revision"],
        revisionRecordKey,
        Number,
      ),
      expected,
    );
});

test("failed or incomplete scans cannot produce an accepted partial snapshot", async () => {
  for (const scan of [
    async (_sql, _values, consume) => {
      consume(["first", 1]);
      throw Error("interrupted");
    },
    async (_sql, _values, consume) => {
      consume(["first", 1]);
      return { rowCount: 2 };
    },
    async () => ({ rows: [{ key: "first", value: 1 }], rowCount: 1 }),
  ])
    await assert.rejects(
      readRecordMap({ scan }, "fixed", ["key", "value"], ([key]) => key),
    );
  const c = {
    scan: async (_sql, _values, consume) => {
      consume(["first", 1]);
      return { rowCount: 1 };
    },
  };
  await assert.rejects(
    readRecordMap(c, "fixed", ["key", "value"], () => {
      throw Error("mapping failed");
    }),
    /mapping failed/,
  );
});

test("Store snapshots match ordinary SQL rows for all numeric maps, calendar metadata and tombstones", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-read-records-"));
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
  await store.bootstrapUser({
    _id: "read-admin",
    username: "read.admin",
    name: "Test",
    role: "admin",
    leaders: [],
    active: true,
    revision: 1,
    version: 1,
    password: await hashPassword("Read-test-only-284!"),
  });
  const user = await store.findUser({ id: "read-admin" });
  const team = (await store.read()).data.teams.find((item) => item.lead);
  const key = team.id + "|p|2026-01",
    deleted = team.id + "|p|2026-02";
  await store.mutate(user, (data, active) => {
    applyChanges(data, active, [
      {
        kind: "project",
        id: "p",
        revision: 0,
        value: {
          id: "p",
          name: "Türkçe proje",
          start: "2026-01",
          end: "2030-12",
          phases: { "2026-01": "Analiz" },
        },
      },
      {
        kind: "resource",
        id: "r",
        revision: 0,
        value: {
          id: "r",
          name: "Çalışan",
          note: "Private",
          versions: [
            {
              effective: "2026-01",
              team: team.id,
              lead: team.lead,
              status: "Aktif Çalışan",
              included: true,
              start: "2026-01-01",
              end: "",
              amount: 1,
            },
          ],
        },
      },
      { kind: "allocation", id: key, value: 0, revision: 0 },
      { kind: "allocation", id: deleted, value: 0.5, revision: 0 },
      { kind: "workedHours", id: "r|2026-01", value: 180, revision: 0 },
      {
        kind: "actual",
        id: "r|p|2026-01",
        value: { unit: "percent", value: 20 },
        revision: 0,
      },
      {
        kind: "personDay",
        id: "r|2026-01-05|leave",
        value: { type: "leave", hours: 2, label: "Private leave" },
        revision: 0,
      },
    ]);
    data.legacyArchive = {
      teams: [],
      allocations: { archived: 0.25 },
      resourceTeams: {},
    };
  });
  await store.mutate(user, (data, active) =>
    applyChanges(data, active, [
      { kind: "allocation", id: deleted, operation: "delete", revision: 1 },
    ]),
  );
  let scans = 0;
  const raw = store.db.raw;
  t.mock.method(store.db, "raw", function (sql, values, consume) {
    if (consume) scans++;
    return raw.call(this, sql, values, consume);
  });
  await store.transaction(async (c) => {
    const streamed = await store.read(c);
    assert.equal(scans, 5);
    const rows = await store.read({ query: c.query });
    assert.deepEqual(streamed, rows);
    // Exercise the ordinary-column fallback on the same SQL rows, without
    // claiming this is an actual MSSQL server integration test.
    const provider = store.provider;
    try {
      store.provider = "mssql";
      assert.deepEqual(await store.read({ query: c.query }), streamed);
      let batches = 0;
      const batch = {
        ...c,
        scanMany: async (queries, consumers) => {
          batches++;
          assert.equal(queries.length, 5);
          const results = [];
          for (let i = 0; i < queries.length; i++)
            results.push(await c.scan(queries[i], [], consumers[i]));
          return results;
        },
      };
      const batched = await store.read(batch);
      assert.equal(batches, 1);
      assert.deepEqual(batched, streamed);
      assert.equal(JSON.stringify(batched), JSON.stringify(streamed));
      await store.read(batch, user);
      assert.equal(batches, 1, "authenticated view must keep its scoped reads");
    } finally {
      store.provider = provider;
    }
    assert.equal(streamed.data.allocations[key], 0);
    assert.equal(Object.hasOwn(streamed.data.allocations, deleted), false);
    assert.equal(streamed.data.revisions["allocation:" + deleted], 2);
    assert(streamed.data.actualPercentEntries["r|p|2026-01"] > 0);
    assert.equal(streamed.data.actualWorkedHours["r|2026-01"], 180);
  }, true);
});

test("composite map SQL uses validated identifiers and keeps MSSQL column decoding equivalent", async () => {
  const specs = [
    [
      "allocations",
      ["team_id", "project_id", "month"],
      "amount",
      ["constructor", "p", "2026-01", 0],
    ],
    [
      "actual_allocations",
      ["resource_id", "project_id", "month"],
      "amount",
      ["r", "p", "2026-01", 0.25],
    ],
    [
      "actual_worked_hours",
      ["resource_id", "month"],
      "hours",
      ["r", "2026-01", 144],
    ],
    [
      "actual_percent_entries",
      ["resource_id", "project_id", "month"],
      "percent",
      ["r", "p", "2026-01", 20],
    ],
  ];
  for (const [name, keys, valueColumn, values] of specs) {
    const key = values.slice(0, -1).join("|"),
      value = values.at(-1);
    const sqlite = {
      scan: async (sql, params, consume) => {
        assert(sql.includes("||'|'||"));
        assert(sql.includes("AS [record_key]"));
        assert(sql.endsWith("FROM [kp_" + name + "]"));
        assert.deepEqual(params, []);
        consume([key, value]);
        return { rowCount: 1 };
      },
    };
    const mssql = {
      query: async (sql) => {
        assert.equal(
          sql,
          "SELECT " +
            [...keys, valueColumn]
              .map((column) => "[" + column + "]")
              .join(",") +
            " FROM [kp_" +
            name +
            "]",
        );
        return {
          rows: [
            Object.fromEntries(
              [...keys, valueColumn].map((column, i) => [column, values[i]]),
            ),
          ],
        };
      },
    };
    assert.deepEqual(
      await readCompositeMap(sqlite, "sqljs", name, valueColumn),
      { [key]: value },
    );
    assert.deepEqual(
      await readCompositeMap(mssql, "mssql", name, valueColumn),
      { [key]: value },
    );
  }
  const unused = {
    query: () => {
      throw Error("must not query");
    },
  };
  for (const [provider, name, valueColumn] of [
    ["sqljs", "constructor", "amount"],
    ["sqljs", "allocations];DROP TABLE x", "amount"],
    ["sqljs", "allocations", "amount];DROP TABLE x"],
    ["unknown", "allocations", "amount"],
    ["sqljs", "resources", "id"],
  ])
    await assert.rejects(readCompositeMap(unused, provider, name, valueColumn));
});

test("numeric snapshot rejects incomplete row counts and never falls back to a partial map", async () => {
  for (const results of [
    [],
    Array(5).fill({ rowCount: 1 }),
    Array(5).fill({ rowCount: 0 }),
  ]) {
    await assert.rejects(
      readNumericSnapshot(
        {
          scanMany: async (queries, consumers) => {
            assert.equal(queries.length, 5);
            consumers[0](["t", "p", "2026-01", 0]);
            return results;
          },
        },
        "mssql",
      ),
    );
  }
  await assert.rejects(
    readNumericSnapshot({ scanMany: async () => [] }, "sqljs"),
  );
  await assert.rejects(readNumericSnapshot({}, "mssql"));
});
