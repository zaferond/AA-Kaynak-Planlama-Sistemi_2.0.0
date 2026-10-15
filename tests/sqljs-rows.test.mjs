import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SqlJsAdapter } from "../backend/adapters/sqljs.mjs";

async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-sqljs-rows-"));
  const adapter = new SqlJsAdapter(path.join(dir, "test.sqlite"));
  t.after(async () => {
    await adapter.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await adapter.open();
  return adapter;
}

test("SQL.js row decoding preserves parameters, Turkish text, nulls, numbers and blobs across many rows", async (t) => {
  const adapter = await setup(t);
  const text = "Çalışan İŞBAŞI 🧭 ".repeat(100);
  const result = await adapter.query(
    `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<128)
    SELECT i, @p0 AS text_value, @p1 AS blank, @p2 AS absent, @p3 AS integral, @p4 AS fractional, @p5 AS truth, x'0001ff' AS bytes FROM n`,
    [text, "", undefined, 0, -1.25, true],
  );
  assert.equal(result.rowCount, 128);
  for (const [index, row] of result.rows.entries()) {
    assert.deepEqual(row, {
      i: index + 1,
      text_value: text,
      blank: "",
      absent: null,
      integral: 0,
      fractional: -1.25,
      truth: 1,
      bytes: new Uint8Array([0, 1, 255]),
    });
    assert.equal(Object.getPrototypeOf(row), Object.prototype);
  }
  assert.deepEqual(await adapter.query("SELECT 1 AS n WHERE 0"), {
    rows: [],
    rowCount: 0,
  });
});

test("SQL.js caches column metadata per statement and adapts to new schemas, duplicate and prototype-like column aliases", async (t) => {
  const adapter = await setup(t);
  const prepare = adapter.db.prepare.bind(adapter.db);
  let metadataReads = 0;
  const spy = t.mock.method(adapter.db, "prepare", (...args) => {
    const statement = prepare(...args);
    const names = statement.getColumnNames.bind(statement);
    const object = statement.getAsObject.bind(statement);
    statement.getColumnNames = (...args) => {
      metadataReads++;
      return names(...args);
    };
    statement.getAsObject = (...args) => {
      metadataReads++;
      return object(...args);
    };
    return statement;
  });
  const result = await adapter.query(
    "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<100) SELECT i AS id FROM n",
  );
  assert.equal(result.rows.length, 100);
  assert.equal(metadataReads, 1);
  spy.mock.restore();
  await adapter.transaction(async (c) => {
    await c.query("CREATE TABLE example (id INTEGER)");
    await c.query("INSERT INTO example VALUES (@p0)", [1]);
    assert.deepEqual(await c.query("SELECT * FROM example"), {
      rows: [{ id: 1 }],
      rowCount: 1,
    });
    await c.query("ALTER TABLE example ADD COLUMN label TEXT");
    assert.deepEqual(await c.query("SELECT * FROM example"), {
      rows: [{ id: 1, label: null }],
      rowCount: 1,
    });
    assert.deepEqual(
      await c.query("UPDATE example SET label=@p0 WHERE id=99", ["none"]),
      { rows: [], rowCount: 0 },
    );
  });
  const [row] = (
    await adapter.query(
      'SELECT 1 AS id, 2 AS id, 3 AS "constructor", 4 AS "__proto__"',
    )
  ).rows;
  assert.equal(row.id, 2);
  assert.equal(row.constructor, 3);
  assert.equal(Object.hasOwn(row, "__proto__"), true);
  assert.equal(row.__proto__, 4);
  assert.equal(Object.getPrototypeOf(row), Object.prototype);
});

test("SQL.js frees the statement after a decoding error, rolls back the transaction and can read again", async (t) => {
  const adapter = await setup(t);
  await adapter.transaction((c) =>
    c.query("CREATE TABLE example (id INTEGER)"),
  );
  const prepare = adapter.db.prepare.bind(adapter.db);
  let freed = false;
  const spy = t.mock.method(adapter.db, "prepare", (sql, ...args) => {
    const statement = prepare(sql, ...args);
    if (sql.includes("SELECT id")) {
      const free = statement.free.bind(statement);
      statement.get = () => {
        throw Error("simulated decode failure");
      };
      statement.free = () => {
        freed = true;
        return free();
      };
    }
    return statement;
  });
  await assert.rejects(
    () =>
      adapter.transaction(async (c) => {
        await c.query("INSERT INTO example VALUES (1)");
        await c.query("SELECT id FROM example");
      }),
    /simulated decode failure/,
  );
  assert.equal(freed, true);
  spy.mock.restore();
  assert.deepEqual(await adapter.query("SELECT * FROM example"), {
    rows: [],
    rowCount: 0,
  });
});

test("SQL.js scan preserves ordered values and bound parameters without retaining row objects", async (t) => {
  const adapter = await setup(t);
  const arrays = [];
  const result = await adapter.scan(
    `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<128)
    SELECT i, @p0, @p1, @p2, @p3, @p4, x'0001ff' FROM n`,
    ["Türkçe 🧭", "", undefined, 0, 0.25],
    (values) => {
      arrays.push(values);
    },
  );
  assert.deepEqual(result, { rows: [], rowCount: 128 });
  for (const [i, values] of arrays.entries())
    assert.deepEqual(values, [
      i + 1,
      "Türkçe 🧭",
      "",
      null,
      0,
      0.25,
      new Uint8Array([0, 1, 255]),
    ]);
  assert.notEqual(arrays[0], arrays[1]);
  assert.notEqual(arrays[0][6], arrays[1][6]);
  let consumed = false;
  assert.deepEqual(
    await adapter.scan("SELECT 1 WHERE 0", [], () => {
      consumed = true;
    }),
    { rows: [], rowCount: 0 },
  );
  assert.equal(consumed, false);
  await assert.rejects(adapter.scan("SELECT 1", [], "invalid"), TypeError);
});

test("SQL.js scans skip column decoding and ordinary queries retain their object contract", async (t) => {
  const adapter = await setup(t);
  const prepare = adapter.db.prepare.bind(adapter.db);
  let metadataReads = 0;
  const spy = t.mock.method(adapter.db, "prepare", (...args) => {
    const statement = prepare(...args);
    const names = statement.getColumnNames.bind(statement);
    statement.getColumnNames = () => {
      metadataReads++;
      return names();
    };
    return statement;
  });
  const values = [];
  await adapter.transaction(async (c) => {
    await c.scan('SELECT 1 AS "__proto__", 2 AS id, 3 AS id', [], (row) => {
      values.push(row);
    });
    assert.equal(metadataReads, 0);
    assert.deepEqual(values, [[1, 2, 3]]);
    const normal = await c.query('SELECT 1 AS "__proto__", 2 AS id, 3 AS id');
    assert.equal(normal.rows[0].__proto__, 1);
    assert.equal(normal.rows[0].id, 3);
    assert.equal(Object.getPrototypeOf(normal.rows[0]), Object.prototype);
    assert.equal(metadataReads, 1);
  }, true);
  spy.mock.restore();
});

test("a failed scan frees its statement and rolls back writes before the next transaction", async (t) => {
  const adapter = await setup(t);
  await adapter.transaction((c) =>
    c.query("CREATE TABLE example (id INTEGER)"),
  );
  const prepare = adapter.db.prepare.bind(adapter.db);
  let freed = false;
  const spy = t.mock.method(adapter.db, "prepare", (sql, ...args) => {
    const statement = prepare(sql, ...args);
    if (sql === "SELECT id FROM example") {
      const free = statement.free.bind(statement);
      statement.free = () => {
        freed = true;
        return free();
      };
    }
    return statement;
  });
  await assert.rejects(
    adapter.transaction(async (c) => {
      await c.query("INSERT INTO example VALUES (1)");
      await c.scan("SELECT id FROM example", [], () => {
        throw Error("failed consumer");
      });
    }),
    /failed consumer/,
  );
  assert.equal(freed, true);
  spy.mock.restore();
  assert.deepEqual(await adapter.query("SELECT * FROM example"), {
    rows: [],
    rowCount: 0,
  });
  const next = [];
  await adapter.scan("SELECT 2", [], (row) => {
    next.push(row);
  });
  assert.deepEqual(next, [[2]]);
});
