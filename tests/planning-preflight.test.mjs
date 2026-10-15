import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Store } from "../backend/store.mjs";
import {
  planningCommand,
  preparePlanningCommand,
} from "../backend/operations.mjs";
import { readPlanningPreflight } from "../backend/planning-preflight.mjs";
import { planningPreflightSuite } from "./planning-preflight-suite.mjs";

test("preflight is limited to owned valid single primitive cell commands; captured input cannot change during SQL awaits", () => {
  const ch = { kind: "allocation", id: "t|p|2026-01", revision: 0, value: 0 };
  for (const cmd of [
    () => {},
    planningCommand([ch, ch]),
    planningCommand([{ ...ch, id: "t|p|bad" }]),
    ...[-1, 10001, NaN, Infinity, "2", {}].map((value) =>
      planningCommand([{ ...ch, value }]),
    ),
  ])
    assert.equal(preparePlanningCommand(cmd), null);
  const input = [{ ...ch }],
    prepared = preparePlanningCommand(planningCommand(input));
  assert(prepared);
  input[0].kind = "project";
  input[0].value = {};
  const data = {
    teams: [],
    projects: [],
    resources: [],
    allocations: {},
    revisions: {},
  };
  prepared.stage(data, { _id: "u", role: "admin", leaders: [] });
  assert.equal(data.allocations[ch.id], 0);
  assert.equal(data.revisions["allocation:" + ch.id], 1);
  assert.throws(
    () => preparePlanningCommand(planningCommand(input)),
    (e) => e.status === 400,
  );
});
test("lookup SQL is fixed and bound, retains zeros/tombstones/returned identities and rejects incomplete results", async () => {
  const ids = ["constructor|p|2026-01", "x');DROP TABLE kp_teams;--|p|2026-01"],
    queries = [];
  for (const id of ids) {
    const d = await readPlanningPreflight(
      {
        query: async (sql, values) => {
          queries.push(sql);
          assert.deepEqual(values, [id.split("|")[0], "p", "2026-01", id]);
          assert(!sql.includes(id));
          return {
            rows: [
              {
                team_id: "returned ",
                leader_name: "Lead",
                project_id: "p",
                allocation_team_id: "returned ",
                allocation_project_id: "p",
                allocation_month: "2026-01",
                amount: 0,
                revision_id: "returned |p|2026-01",
                revision: 2,
              },
            ],
          };
        },
      },
      id,
    );
    assert.equal(d.allocations["returned |p|2026-01"], 0);
    assert.equal(d.revisions["allocation:returned |p|2026-01"], 2);
    assert.equal(d.allocations[id], undefined);
  }
  assert.equal(queries[0], queries[1]);
  const d = await readPlanningPreflight(
    { query: async () => ({ rows: [{ revision_id: ids[0], revision: 4 }] }) },
    ids[0],
  );
  assert.deepEqual(d.allocations, {});
  assert.equal(d.revisions["allocation:" + ids[0]], 4);
  for (const rows of [[], [{}, {}]])
    await assert.rejects(
      readPlanningPreflight({ query: async () => ({ rows }) }, ids[0]),
      /incomplete/,
    );
  await assert.rejects(
    readPlanningPreflight(
      {
        query: () => {
          throw Error("must not query");
        },
      },
      "invalid",
    ),
    /Invalid planning/,
  );
});
test("SQL.js: narrow single-cell rejection and accepted full reference remain equivalent", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-preflight-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
    },
  });
  try {
    await store.connect();
    await planningPreflightSuite(store, t);
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
