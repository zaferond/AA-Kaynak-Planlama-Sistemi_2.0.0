import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { validate } from "../backend/domain/index.mjs";
import { SqlJsAdapter } from "../backend/adapters/sqljs.mjs";
import {
  executeSqlMigration,
  validateMigrationCatalog,
} from "../backend/migration-catalog.mjs";

test("project code persists, updates and clears without changing other project fields", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-project-code-"));
  const store = new Store({
    env: {
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
    },
  });
  try {
    await store.connect();
    const project = {
      id: "code-project",
      name: "Synthetic project",
      responsibleName: "Synthetic owner",
      start: "2026-01",
      end: "2026-12",
      phases: { "2026-01": "Design" },
    };
    async function save(code) {
      await store.transaction(async (c) => {
        const { data } = await store.read(c);
        const next = validate({ ...data, projects: [{ ...project, code }] });
        await store.persist(data, next, c);
      });
    }
    await save(" AA-001 ");
    await store.close();
    await store.connect();
    assert.equal((await store.read()).data.projects[0].code, "AA-001");
    assert.equal(
      (await store.read()).data.projects[0].responsibleName,
      project.responsibleName,
    );
    assert.deepEqual(
      (await store.read()).data.projects[0].phases,
      project.phases,
    );
    await save("=AA<&>002");
    assert.equal((await store.read()).data.projects[0].code, "=AA<&>002");
    await assert.rejects(() => save("a".repeat(101)), /at most 100|too_big/i);
    assert.equal((await store.read()).data.projects[0].code, "=AA<&>002");
    await save("");
    assert.equal((await store.read()).data.projects[0].code || "", "");
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("migration 35 adds optional project code and preserves existing rows", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-code-migration-"));
  const db = new SqlJsAdapter(path.join(dir, "synthetic.sqlite"));
  try {
    await validateMigrationCatalog("sqljs");
    await validateMigrationCatalog("mssql");
    await db.open();
    await db.transaction(async (c) => {
      await c.batch(
        "CREATE TABLE kp_projects(id TEXT PRIMARY KEY,name TEXT); CREATE TABLE kp_schema_migrations(version INTEGER PRIMARY KEY); INSERT INTO kp_projects VALUES('p','Existing synthetic project');",
      );
      await executeSqlMigration(c, "sqljs", 35);
      const row = (await c.query("SELECT * FROM kp_projects")).rows[0];
      assert.deepEqual(row, {
        id: "p",
        name: "Existing synthetic project",
        project_code: null,
      });
      assert.deepEqual(
        (await c.query("SELECT version FROM kp_schema_migrations")).rows,
        [{ version: 35 }],
      );
    });
  } finally {
    await db.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
