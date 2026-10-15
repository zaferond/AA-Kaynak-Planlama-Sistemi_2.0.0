import test from "node:test";
import assert from "node:assert/strict";
import { prepareSchema } from "../backend/schema-migrations.mjs";
import {
  assertMigrationHistory,
  requiredVersions,
  schemaVersion,
} from "../backend/migration-catalog.mjs";

test("SQL.js and MSSQL startup reject unknown migration history before any write", async () => {
  for (const provider of ["sqljs", "mssql"]) {
    for (const version of [0, schemaVersion + 1, 999]) {
      const commands = [];
      const connection = {
        async query(sql) {
          commands.push(sql);
          if (sql.includes("sqlite_master"))
            return { rows: [{ name: "kp_schema_migrations" }] };
          if (sql.includes("OBJECT_ID")) return { rows: [{ id: 1 }] };
          if (sql === "SELECT version FROM kp_schema_migrations")
            return { rows: [{ version: 1 }, { version }] };
          throw Error("Unexpected query: " + sql);
        },
        async batch() {
          throw Error("A migration write was attempted");
        },
      };
      await assert.rejects(
        () => prepareSchema(connection, { provider, auto: true }),
        /Desteklenmeyen/,
      );
      assert.equal(commands.length, 2);
      assert(commands.every((sql) => sql.startsWith("SELECT ")));
    }
  }
});

test("required migration history includes inline transformations and optional version 2 remains optional", () => {
  assert.doesNotThrow(() => assertMigrationHistory(requiredVersions));
  assert.doesNotThrow(() => assertMigrationHistory([...requiredVersions, 2]));
  for (const missing of [3, 12, 30])
    assert.throws(
      () =>
        assertMigrationHistory(requiredVersions.filter((v) => v !== missing)),
      /eksik/,
    );
});
