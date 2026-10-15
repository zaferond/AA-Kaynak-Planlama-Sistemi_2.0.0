import test from "node:test";
import assert from "node:assert/strict";
import sql from "mssql";
import { MssqlAdapter } from "../backend/adapters/mssql.mjs";

// The driver query is replaced before use; no connect(), network or database.
const adapter = () =>
  new MssqlAdapter({
    server: "synthetic.invalid",
    database: "batch_only_test",
    options: { encrypt: true },
  });

test("native metadata batches use one driver query and preserve rowsets, Unicode, zero and null", async (t) => {
  const db = adapter();
  const rows = [
    [{ id: 1, generation: 0 }],
    [{ name: "Türkçe 😀", manager_name: null }],
  ];
  let calls = 0;
  t.mock.method(sql.Request.prototype, "query", async function (text) {
    calls++;
    assert.equal(this.parent, db.pool);
    assert.equal(text, "SELECT * FROM kp_settings;\nSELECT * FROM kp_leaders");
    assert.deepEqual(this.parameters, {});
    return { recordset: rows[0], recordsets: rows, rowsAffected: [1, 1] };
  });
  assert.deepEqual(
    await db.readMany(db.pool, [
      "SELECT * FROM kp_settings",
      "SELECT * FROM kp_leaders",
    ]),
    rows.map((rows) => ({ rows, rowCount: rows.length })),
  );
  assert.equal(calls, 1);
  const ordinary = await db.request(
    db.pool,
    "SELECT * FROM kp_settings;\nSELECT * FROM kp_leaders",
  );
  assert.deepEqual(ordinary, { rows: rows[0], rowCount: 1 });
});

test("invalid or partial native metadata batches fail without accepting partial results", async (t) => {
  const db = adapter();
  let calls = 0,
    result;
  t.mock.method(sql.Request.prototype, "query", async () => {
    calls++;
    return result;
  });
  for (const queries of [
    [],
    Array(17).fill("SELECT 1"),
    [null],
    ["DELETE FROM kp_settings"],
    ["SELECT 1; DROP TABLE kp_settings"],
    ["SELECT \0"],
  ])
    await assert.rejects(db.readMany(db.pool, queries), /Invalid snapshot/);
  assert.equal(calls, 0);
  for (const recordsets of [undefined, [], [[]], [[], null], [[], [], []]]) {
    result = { recordset: [], recordsets, rowsAffected: [] };
    await assert.rejects(
      db.readMany(db.pool, ["SELECT 1", "SELECT 2"]),
      /incomplete/,
    );
  }
  const error = Error("synthetic driver failure");
  t.mock.method(sql.Request.prototype, "query", async () => {
    throw error;
  });
  await assert.rejects(db.readMany(db.pool, ["SELECT 1"]), (e) => e === error);
});

test("metadata reads retain the enclosing locked transaction owner", async (t) => {
  const db = adapter();
  let transactionOwner,
    committed = 0;
  t.mock.method(sql.Transaction.prototype, "begin", async function () {
    transactionOwner = this;
  });
  t.mock.method(sql.Transaction.prototype, "commit", async () => {
    committed++;
  });
  t.mock.method(sql.Request.prototype, "query", async function (text) {
    assert.equal(this.parent, transactionOwner);
    if (text.startsWith("DECLARE @r"))
      return { recordset: [], recordsets: [[]], rowsAffected: [] };
    assert.equal(text, "SELECT 1");
    return {
      recordset: [{ value: 0 }],
      recordsets: [[{ value: 0 }]],
      rowsAffected: [1],
    };
  });
  const result = await db.transaction((c) => c.queryMany(["SELECT 1"]), true);
  assert.deepEqual(result, [{ rows: [{ value: 0 }], rowCount: 1 }]);
  assert.equal(committed, 1);
});
