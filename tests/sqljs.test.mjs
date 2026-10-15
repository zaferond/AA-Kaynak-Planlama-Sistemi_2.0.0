import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { SqlJsAdapter } from "../backend/adapters/sqljs.mjs";
import { integrationSuite } from "./integration-suite.mjs";
import { schemaVersion } from "../backend/migration-catalog.mjs";
test("unknown applied migration versions are refused without modifying an existing database", async () => {
  const dir = await fs.mkdtemp(path.resolve("tests/local-unknown-schema-"));
  const file = path.join(dir, "synthetic.sqlite");
  const env = { NODE_ENV: "test", DB_PROVIDER: "sqljs", SQLJS_FILE: file };
  let store = new Store({ env });
  try {
    await store.connect();
    await store.transaction((c) =>
      c.query("INSERT INTO kp_schema_migrations(version) VALUES(@p0)", [999]),
    );
    await store.close();
    const before = await fs.readFile(file);
    store = new Store({ env });
    await assert.rejects(store.connect(), /Desteklenmeyen.*şema sürümü/);
    assert.deepEqual(await fs.readFile(file), before);
    await assert.rejects(fs.stat(file + ".lock"), /ENOENT/);
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("sql.js: a lock left by a terminated process is recovered", async () => {
  const dir = await fs.mkdtemp(path.resolve("tests/local-stale-lock-"));
  const file = path.join(dir, "test.sqlite"),
    adapter = new SqlJsAdapter(file);
  try {
    await fs.writeFile(file + ".lock", "99999999");
    await adapter.open();
    assert.equal((await adapter.query("SELECT 1 AS ok")).rows[0].ok, 1);
  } finally {
    if (adapter.db) await adapter.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("sql.js: HTTP CRUD, SQL constraints, permissions, rollback, restart and single-process locking", async () => {
  const dir = await fs.mkdtemp(path.resolve("tests/local-test-"));
  const env = {
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "test.sqlite"),
  };
  let store = new Store({ env });
  try {
    await integrationSuite(store);
    const second = new Store({ env });
    await assert.rejects(() => second.connect(), /kilit|kullanımda/);
    await store.close();
    store = new Store({ env });
    await store.connect();
    assert.equal((await store.read()).data.resources.length, 1);
    assert.equal((await store.read()).data.projects.length, 0);
    // A failed disk write must also roll back the in-memory state, not just report an error.
    const previous = await store.generation(),
      rename = fs.rename;
    fs.rename = async () => {
      throw Object.assign(Error("simulated disk error"), { code: "EIO" });
    };
    try {
      await assert.rejects(
        () =>
          store.transaction((c) =>
            c.query(
              "UPDATE kp_settings SET generation=generation+1 WHERE id=1",
            ),
          ),
        /simulated/,
      );
    } finally {
      fs.rename = rename;
    }
    assert.equal(await store.generation(), previous);
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("sql.js: person allocations are folded into team allocations once", async () => {
  const dir = await fs.mkdtemp(path.resolve("tests/local-migration-"));
  const file = path.join(dir, "test.sqlite");
  const adapter = new SqlJsAdapter(file);
  try {
    await adapter.open();
    await adapter.transaction(async (c) => {
      await c.batch(
        await fs.readFile("backend/migrations/001_sqljs.sql", "utf8"),
      );
      await c.batch(
        await fs.readFile("backend/migrations/002_sqljs.sql", "utf8"),
      );
      await c.batch(`
        INSERT INTO kp_settings VALUES(1,4,NULL);
        INSERT INTO kp_teams VALUES('t','Takım',NULL,0,1);
        INSERT INTO kp_projects VALUES('p','Proje','2026-01','2026-12');
        INSERT INTO kp_resources VALUES('a','Ali','',NULL);
        INSERT INTO kp_resources VALUES('b','Ayşe','',NULL);
        INSERT INTO kp_resource_versions VALUES('a','2026-01','t',NULL,'Aktif Çalışan',1,NULL,NULL,1);
        INSERT INTO kp_resource_versions VALUES('b','2026-01','t',NULL,'Gear Up',1,NULL,NULL,1);
        INSERT INTO kp_person_allocations VALUES('a','p','2026-09',0.5);
        INSERT INTO kp_person_allocations VALUES('b','p','2026-09',0.25);
      `);
    });
    await adapter.close();
    const store = new Store({
      env: { DB_PROVIDER: "sqljs", SQLJS_FILE: file },
    });
    try {
      await store.connect();
      assert.equal((await store.read()).data.allocations["t|p|2026-09"], 0.75);
      assert.equal(
        (
          await store.db.query(
            "SELECT COUNT(*) AS n FROM kp_person_allocations",
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await store.db.query(
            "SELECT MAX(version) AS v FROM kp_schema_migrations",
          )
        ).rows[0].v,
        schemaVersion,
      );
      await store.close();
      await store.connect();
      assert.equal((await store.read()).data.allocations["t|p|2026-09"], 0.75);
    } finally {
      await store.close();
    }
  } finally {
    if (adapter.db) await adapter.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("sql.js: existing actual entries keep their hours when the baseline changes to 180", async () => {
  const dir = await fs.mkdtemp(
    path.resolve("tests/local-actual-hours-migration-"),
  );
  const file = path.join(dir, "test.sqlite"),
    env = { DB_PROVIDER: "sqljs", SQLJS_FILE: file };
  let store = new Store({ env });
  try {
    await store.connect();
    await store.db.transaction(async (c) => {
      await c.batch(`
        INSERT INTO kp_projects(id,name,start_month,end_month) VALUES('p','Proje','2026-01','2026-12');
        INSERT INTO kp_resources(id,name,note,code) VALUES('r','Çalışan','',NULL),('r2','Diğer Çalışan','',NULL);
        INSERT INTO kp_actual_allocations(resource_id,project_id,month,amount) VALUES('r','p','2026-09',160.0/198),('r2','p','2026-09',99.0/198);
        INSERT INTO kp_actual_worked_hours(resource_id,month,hours) VALUES('r','2026-09',200);
        INSERT INTO kp_actual_percent_entries(resource_id,project_id,month,percent) VALUES('r','p','2026-09',80);
        DELETE FROM kp_schema_migrations WHERE version=12;
      `);
    });
    await store.close();
    store = new Store({ env });
    await store.connect();
    const data = (await store.read()).data;
    assert(Math.abs(data.actualAllocations["r|p|2026-09"] - 160 / 180) < 1e-10);
    assert(Math.abs(data.actualAllocations["r2|p|2026-09"] - 99 / 180) < 1e-10);
    assert.equal(data.actualPercentEntries["r|p|2026-09"], 80);
    assert.equal(data.actualWorkedHours["r|2026-09"], 200);
    assert.equal(
      (
        await store.db.query(
          "SELECT MAX(version) AS v FROM kp_schema_migrations",
        )
      ).rows[0].v,
      schemaVersion,
    );
    await store.close();
    store = new Store({ env });
    await store.connect();
    assert(
      Math.abs(
        (await store.read()).data.actualAllocations["r|p|2026-09"] - 160 / 180,
      ) < 1e-10,
    );
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
