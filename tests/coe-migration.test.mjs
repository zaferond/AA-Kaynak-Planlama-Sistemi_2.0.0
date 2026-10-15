import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SqlJsAdapter } from "../backend/adapters/sqljs.mjs";
import {
  migrationCatalog,
  migrationSql,
} from "../backend/migration-catalog.mjs";
import {
  assertSchemaContract,
  expectedSchemaContract,
} from "../scripts/schema-contract.mjs";

test("v35 to v36 preserves every resource-version value, FK and index; CoE persists after reopen", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-coe-migration-"));
  const file = path.join(dir, "synthetic.sqlite");
  const adapter = new SqlJsAdapter(file);
  try {
    await adapter.open();
    await adapter.transaction(async (c) => {
      for (const m of migrationCatalog.filter((m) => m.sql && m.version < 36)) {
        const sql = await migrationSql("sqljs", m.version);
        for (const batch of sql.split(/^GO\s*$/gim).filter((s) => s.trim()))
          await c.batch(batch);
      }
      await c.batch(
        "INSERT INTO kp_schema_migrations(version) VALUES(3),(12);",
      );
      await c.batch(
        "INSERT INTO kp_leaders(name) VALUES('Synthetic'); INSERT INTO kp_teams(id,name,leader_name,excel_capacity,catalog) VALUES('t','Synthetic team','Synthetic',0,0); INSERT INTO kp_resources(id,name,note) VALUES('r','Synthetic','Synthetic note');",
      );
      for (const [i, role] of [
        null,
        "leader",
        "productOwner",
        "member",
      ].entries()) {
        await c.query(
          "INSERT INTO kp_resource_versions(resource_id,effective_month,team_id,leader_name,status,included,start_month,end_month,amount,start_date,end_date,assignment_role) VALUES(@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8,@p9,@p10,@p11)",
          [
            "r",
            `2026-0${i + 1}`,
            "t",
            "Synthetic",
            "Aktif Çalışan",
            1,
            "2026-01",
            null,
            0.5,
            "2026-01-15",
            null,
            role,
          ],
        );
      }
    });
    const before = (
      await adapter.query(
        "SELECT * FROM kp_resource_versions ORDER BY effective_month",
      )
    ).rows;
    const diskBefore = await fs.readFile(file);
    await assert.rejects(
      () =>
        adapter.transaction(async (c) => {
          await c.batch(migrationSqlForTest);
          throw Error("Synthetic migration failure");
        }),
      /Synthetic migration failure/,
    );
    assert.deepEqual(await fs.readFile(file), diskBefore);
    assert.equal(
      (
        await adapter.query(
          "SELECT COUNT(*) AS n FROM kp_schema_migrations WHERE version=36",
        )
      ).rows[0].n,
      0,
    );
    await adapter.transaction((c) => c.batch(migrationSqlForTest));
    assert.deepEqual(
      (
        await adapter.query(
          "SELECT * FROM kp_resource_versions ORDER BY effective_month",
        )
      ).rows,
      before,
    );
    assert.deepEqual(
      (await adapter.query("PRAGMA foreign_key_check")).rows,
      [],
    );
    assert.equal(
      (
        await adapter.query(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='kp_versions_team_month_idx'",
        )
      ).rows[0].n,
      1,
    );
    await adapter.transaction((c) =>
      c.query(
        "UPDATE kp_resource_versions SET assignment_role='coe' WHERE effective_month='2026-04'",
      ),
    );
    await assert.rejects(
      () =>
        adapter.query(
          "UPDATE kp_resource_versions SET assignment_role='admin' WHERE effective_month='2026-04'",
        ),
      /CHECK/,
    );
    await assert.rejects(
      () =>
        adapter.query(
          "UPDATE kp_resource_versions SET team_id='missing' WHERE effective_month='2026-04'",
        ),
      /FOREIGN KEY/,
    );
    await adapter.transaction(async (c) =>
      c.batch(await migrationSql("sqljs", 37)),
    );
    assertSchemaContract(adapter.db, await expectedSchemaContract());
    await adapter.close();
    await adapter.open();
    assert.equal(
      (
        await adapter.query(
          "SELECT assignment_role FROM kp_resource_versions WHERE effective_month='2026-04'",
        )
      ).rows[0].assignment_role,
      "coe",
    );
  } finally {
    await adapter.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

const migrationSqlForTest = await migrationSql("sqljs", 36);
