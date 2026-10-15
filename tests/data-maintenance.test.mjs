import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Store } from "../backend/store.mjs";
import compatibleFingerprints from "../backend/compatible-migration-fingerprints.json" with { type: "json" };
import { hashPassword, verifyPassword } from "../backend/auth.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { SqlJsAdapter } from "../backend/adapters/sqljs.mjs";
import {
  readDatabase,
  writeBundle,
  verifyBundle,
  prepareRecovery,
} from "../scripts/maintenance-files.mjs";
import {
  auditRetention,
  retentionCutoff,
} from "../scripts/audit-retention.mjs";
import {
  cutoffDate,
  currentSchema,
  openSnapshot,
  sha256,
} from "../scripts/maintenance-snapshot.mjs";
import {
  validateMigrationCatalog,
  migrationSql,
} from "../backend/migration-catalog.mjs";

const fixedNow = new Date("2026-10-02T09:00:00.000Z");
const exec = promisify(execFile);
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-maintenance-test-"));
  const source = path.join(dir, "source.sqlite");
  const output = path.join(dir, "private-output");
  const store = new Store({
    env: { DB_PROVIDER: "sqljs", SQLJS_FILE: source },
  });
  let closed = false;
  t.after(async () => {
    if (!closed) await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await store.connect();
  const password = await hashPassword("Maintenance-fixture-only-782!");
  await store.bootstrapUser({
    _id: "root-admin",
    username: "maint-fixture",
    name: "Synthetic Admin",
    role: "admin",
    active: true,
    leaders: [],
    resourceId: "",
    version: 1,
    revision: 1,
    password,
  });
  const actor = await store.findUser({ id: "root-admin" });
  await store.mutate(actor, (d, u) =>
    applyChanges(d, u, [
      {
        kind: "project",
        id: "p",
        revision: 0,
        value: {
          id: "p",
          name: "Yedek Türkçe <>& projesi",
          start: "2026-01",
          end: "2026-12",
          phases: { "2026-01": "Test" },
          milestones: [],
        },
      },
    ]),
  );
  const dates = [
    "2021-10-02T08:59:59.999Z",
    "2021-10-02T09:00:00.000Z",
    "2026-10-01T09:00:00.000Z",
  ];
  const events = Array.from({ length: 257 }, (_, i) => ({
    id: randomUUID(),
    occurred_at: dates[i < 255 ? 0 : i === 255 ? 1 : 2],
    actor_id: "root-admin",
    actor_name: "Synthetic Admin",
    kind: "project",
    record_id: "p",
    record_name: "Türkçe & <not> " + i,
    action: "update",
    changes: JSON.stringify([
      { path: ["name"], before: "Eski", after: "Yeni\nTürkçe • " + i },
    ]),
  }));
  await store.transaction(async (c) => {
    await c.query("DELETE FROM kp_audit_events");
    await c.upsert("audit_events", events);
  });
  await store.createSession({
    _id: "synthetic-session-token",
    userId: actor._id,
    userVersion: actor.version,
    csrf: "synthetic-csrf",
    expiresAt: new Date("2120-01-01T00:00:00.000Z"),
  });
  const before = await fs.readFile(source);
  return {
    dir,
    source,
    output,
    store,
    actor,
    before,
    events,
    close: async () => {
      await store.close();
      closed = true;
    },
    backup: () => writeBundle({ bytes: before, output }),
  };
}
async function editManifest(dir, change) {
  const file = path.join(dir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(file, "utf8"));
  change(manifest);
  await fs.writeFile(file, JSON.stringify(manifest));
}
async function corruptSnapshot(bytes, schema, change) {
  const { db } = openSnapshot(bytes, schema);
  try {
    db.exec("PRAGMA query_only=OFF");
    await change(db);
    return Buffer.from(db.export());
  } finally {
    db.close();
  }
}
async function replaceBundleImage(directory, bytes, change = () => {}) {
  await fs.writeFile(path.join(directory, "database.sqlite"), bytes);
  await editManifest(directory, (manifest) => {
    manifest.sourceSha256 = sha256(bytes);
    manifest.files["database.sqlite"] = {
      sha256: sha256(bytes),
      bytes: bytes.length,
    };
    change(manifest);
  });
}
async function outputEntries(directory) {
  return fs.readdir(directory).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
}

test("backup catalog includes inline migrations; missing 3/12 fail creation and verification even with recomputed legacy checksums", async (t) => {
  const f = await fixture(t),
    schema = await currentSchema();
  assert(
    schema.requiredVersions.includes(3) && schema.requiredVersions.includes(12),
  );
  assert(!schema.requiredVersions.includes(2));
  assert.notEqual(schema.migrationsSha256, schema.legacyMigrationsSha256);
  await validateMigrationCatalog("sqljs");
  await validateMigrationCatalog("mssql");
  const good = await f.backup();
  for (const version of [3, 12]) {
    const bytes = await corruptSnapshot(f.before, schema, (db) =>
      db.exec("DELETE FROM kp_schema_migrations WHERE version=" + version),
    );
    const output = path.join(f.dir, "rejected-" + version);
    await assert.rejects(
      writeBundle({ bytes, output }),
      /migration geçmişi eksik/,
    );
    assert.deepEqual(await outputEntries(output), []);
    const forged = path.join(f.dir, "forged-" + version);
    await fs.cp(good.directory, forged, { recursive: true });
    await replaceBundleImage(forged, bytes, (m) => {
      m.migrationsSha256 = schema.legacyMigrationsSha256;
      m.tableCounts.kp_schema_migrations--;
    });
    await assert.rejects(verifyBundle(forged), /migration geçmişi eksik/);
  }
  assert.deepEqual(await fs.readFile(f.source), f.before);
});

test("backups reject missing credential columns and altered types, nullability, defaults, keys and constraints", async (t) => {
  const f = await fixture(t),
    schema = await currentSchema(),
    good = await f.backup();
  const missing = await corruptSnapshot(f.before, schema, (db) =>
    db.exec("ALTER TABLE kp_users DROP COLUMN password_hash"),
  );
  await assert.rejects(
    writeBundle({ bytes: missing, output: f.output }),
    /sütun/,
  );
  const forged = path.join(f.dir, "missing-column");
  await fs.cp(good.directory, forged, { recursive: true });
  await replaceBundleImage(forged, missing);
  await assert.rejects(verifyBundle(forged), /sütun/);
  const variants = [
    [
      "kp_users",
      (sql) => sql.replace("[name] TEXT NOT NULL", "[name] TEXT NULL"),
    ],
    [
      "kp_users",
      (sql) => sql.replace("[password_hash] TEXT", "[password_hash] BLOB"),
    ],
    [
      "kp_projects",
      (sql) =>
        sql.replace(
          "[sort_order] INTEGER CHECK",
          "[sort_order] INTEGER DEFAULT 1 CHECK",
        ),
    ],
    [
      "kp_allocations",
      (sql) =>
        sql.replace(
          "PRIMARY KEY ([team_id],[project_id],[month])",
          "PRIMARY KEY ([month],[project_id],[team_id])",
        ),
    ],
    ["kp_users", (sql) => sql.replace("UNIQUE ([username]),", "")],
    ["kp_project_risks", (sql) => sql.replace(/,\s*FOREIGN KEY[^\n]+/, "")],
    [
      "kp_users",
      (sql) =>
        sql.replace(
          "CHECK ([role] IN ('admin','manager','normal'))",
          "CHECK (1=1)",
        ),
    ],
  ];
  for (const [table, change] of variants) {
    const bytes = await corruptSnapshot(f.before, schema, (db) => {
      const sql = db.exec(
          `SELECT sql FROM sqlite_master WHERE name='${table}'`,
        )[0].values[0][0],
        altered = change(sql);
      assert.notEqual(altered, sql, "Fixture must really change " + table);
      // Build a valid, weaker schema; deleting sqlite_master text alone would
      // leave an orphan UNIQUE index and test integrity rather than the contract.
      db.exec("PRAGMA foreign_keys=OFF");
      db.exec(
        altered.replace(
          /^CREATE TABLE\s+(?:\[[^\]]+\]|"[^"]+"|\S+)\s*/,
          "CREATE TABLE [schema_test_table] ",
        ),
      );
      db.exec(
        `INSERT INTO schema_test_table SELECT * FROM ${table}; DROP TABLE ${table}; ALTER TABLE schema_test_table RENAME TO ${table};`,
      );
      assert.equal(db.exec("PRAGMA integrity_check")[0].values[0][0], "ok");
    });
    await assert.rejects(
      writeBundle({ bytes, output: f.output }),
      /şeması eşleşmiyor/,
    );
  }
  assert.deepEqual(await fs.readFile(f.source), f.before);
});

test("full backup creation, verification and recovery reject unusable password records without changing source bytes", async (t) => {
  const f = await fixture(t),
    schema = await currentSchema(),
    good = await f.backup();
  for (const [index, salt, hash] of [
    [0, "", ""],
    [1, "a".repeat(32), "b".repeat(127)],
    [2, "g".repeat(32), "b".repeat(128)],
    [3, "a".repeat(32), "z".repeat(128)],
  ]) {
    const bytes = await corruptSnapshot(f.before, schema, (db) => {
      const statement = db.prepare(
        "UPDATE kp_users SET password_salt=?,password_hash=?",
      );
      try {
        statement.run([salt, hash]);
      } finally {
        statement.free();
      }
    });
    const output = path.join(f.dir, "invalid-credentials-" + index);
    await assert.rejects(writeBundle({ bytes, output }), /parola kayıt biçimi/);
    assert.deepEqual(await outputEntries(output), []);
    const forged = path.join(f.dir, "forged-credentials-" + index);
    await fs.cp(good.directory, forged, { recursive: true });
    await replaceBundleImage(forged, bytes);
    await assert.rejects(verifyBundle(forged), /parola kayıt biçimi/);
    await assert.rejects(
      prepareRecovery({ backup: forged, output }),
      /parola kayıt biçimi/,
    );
  }
  assert.deepEqual(await fs.readFile(f.source), f.before);
});

test("approved catalog fingerprints apply only to the matching schema; arbitrary fingerprints are rejected", async (t) => {
  const f = await fixture(t),
    schema = await currentSchema(),
    good = await f.backup();
  for (const [index, entry] of compatibleFingerprints.entries()) {
    if (entry.provider !== "sqljs") continue;
    await replaceBundleImage(good.directory, f.before, (manifest) => {
      manifest.migrationsSha256 = entry.sha256;
    });
    if (entry.schemaVersion === schema.version) {
      assert(schema.compatibleMigrationsSha256.includes(entry.sha256));
      await verifyBundle(good.directory);
      await prepareRecovery({
        backup: good.directory,
        output: path.join(f.dir, "compatible-recovery-" + index),
      });
    } else {
      assert(!schema.compatibleMigrationsSha256.includes(entry.sha256));
      await assert.rejects(
        verifyBundle(good.directory),
        /şema kaynakları farklı/,
      );
    }
  }
  await replaceBundleImage(good.directory, f.before, (manifest) => {
    manifest.migrationsSha256 = "0".repeat(64);
  });
  await assert.rejects(verifyBundle(good.directory), /şema kaynakları farklı/);
  assert.deepEqual(await fs.readFile(f.source), f.before);
});

test("valid legacy fingerprint backups remain recoverable while new backups fingerprint migration code", async (t) => {
  const f = await fixture(t),
    schema = await currentSchema(),
    bundle = await f.backup();
  const manifest = JSON.parse(
    await fs.readFile(path.join(bundle.directory, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.migrationsSha256, schema.migrationsSha256);
  await editManifest(bundle.directory, (m) => {
    m.migrationsSha256 = schema.legacyMigrationsSha256;
  });
  const verified = await verifyBundle(bundle.directory);
  assert.deepEqual(verified.contents["database.sqlite"], f.before);
  const recovery = await prepareRecovery({
    backup: bundle.directory,
    output: f.output,
  });
  const reopened = new Store({
    env: {
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(recovery.directory, "database.sqlite"),
    },
  });
  try {
    await reopened.connect();
    const user = await reopened.findUser({ id: "root-admin" });
    assert(
      await verifyPassword("Maintenance-fixture-only-782!", user.password),
    );
    assert.deepEqual((await reopened.read()).data, (await f.store.read()).data);
  } finally {
    await reopened.close();
  }
  assert.deepEqual(await fs.readFile(f.source), f.before);
});

test("a complete but unreadable application model is rejected without modifying the source", async (t) => {
  const f = await fixture(t),
    schema = await currentSchema();
  const bytes = await corruptSnapshot(f.before, schema, (db) =>
    db.exec("UPDATE kp_settings SET calendar_days='not JSON' WHERE id=1"),
  );
  // SQLite, columns and constraints are valid; the real Store projection must fail.
  const { db } = openSnapshot(bytes, schema);
  db.close();
  await assert.rejects(
    writeBundle({ bytes, output: f.output }),
    /uygulama modeli/,
  );
  assert.deepEqual(await outputEntries(f.output), []);
  assert.deepEqual(await fs.readFile(f.source), f.before);
});

test("a real v2 upgrade with the optional legacy table passes backup and restore validation", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-backup-v2-")),
    source = path.join(dir, "legacy.sqlite");
  const adapter = new SqlJsAdapter(source);
  const store = new Store({
    env: { DB_PROVIDER: "sqljs", SQLJS_FILE: source },
  });
  t.after(async () => {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await adapter.open();
  try {
    await adapter.transaction(async (c) => {
      await c.batch(await migrationSql("sqljs", 1));
      await c.batch(await migrationSql("sqljs", 2));
    });
  } finally {
    await adapter.close();
  }
  await store.connect();
  const before = await fs.readFile(source),
    output = path.join(dir, "private");
  const bundle = await writeBundle({ bytes: before, output });
  const { contents, manifest } = await verifyBundle(bundle.directory);
  assert.equal(manifest.tableCounts.kp_person_allocations, 0);
  assert.deepEqual(contents["database.sqlite"], before);
  assert.deepEqual(await fs.readFile(source), before);
});
function tableRows(bytes, schema) {
  const { db, summary } = openSnapshot(bytes, schema);
  try {
    return Object.fromEntries(
      Object.keys(summary.tableCounts).map((name) => [
        name,
        db.exec(`SELECT * FROM "${name}"`),
      ]),
    );
  } finally {
    db.close();
  }
}

test("full backup preserves accounts, history, revisions and all tables while the portal owns its file", async (t) => {
  const f = await fixture(t);
  const bundle = await f.backup();
  const { manifest, contents } = await verifyBundle(bundle.directory);
  assert.equal(manifest.format, "aa-full-backup-v1");
  assert.equal(manifest.auditCount, 257);
  assert.equal(manifest.tableCounts.kp_users, 1);
  assert.equal(manifest.tableCounts.kp_sessions, 1);
  assert.deepEqual(contents["database.sqlite"], f.before);
  assert.deepEqual(await fs.readFile(f.source), f.before);
  assert(!JSON.stringify(manifest).includes("synthetic-session-token"));
  assert(!JSON.stringify(manifest).includes(f.actor.password.hash));
  if (process.platform !== "win32") {
    assert.equal((await fs.stat(bundle.directory)).mode & 0o777, 0o700);
    for (const name of ["database.sqlite", "audit.ndjson", "manifest.json"])
      assert.equal(
        (await fs.stat(path.join(bundle.directory, name))).mode & 0o777,
        0o600,
      );
  }
  const next = await f.backup();
  assert.notEqual(next.directory, bundle.directory);
  assert.deepEqual(
    await fs.readFile(path.join(bundle.directory, "database.sqlite")),
    f.before,
  );
});

test("recovery creates a separate copy with expired sessions and identical account/password/model/history data", async (t) => {
  const f = await fixture(t);
  const bundle = await f.backup();
  const recovery = await prepareRecovery({
    backup: bundle.directory,
    output: f.output,
  });
  const { contents, manifest } = await verifyBundle(recovery.directory);
  assert.equal(manifest.recovery.sessionsRemoved, 1);
  assert.equal(manifest.tableCounts.kp_sessions, 0);
  const schema = await currentSchema();
  const previous = tableRows(f.before, schema),
    restored = tableRows(contents["database.sqlite"], schema);
  for (const name of Object.keys(previous))
    if (name !== "kp_sessions")
      assert.deepEqual(restored[name], previous[name], name);
  const clone = new Store({
    env: {
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(recovery.directory, "database.sqlite"),
    },
  });
  try {
    await clone.connect();
    assert.deepEqual((await clone.read()).data, (await f.store.read()).data);
    const user = await clone.findUser({ id: "root-admin" });
    assert(
      await verifyPassword("Maintenance-fixture-only-782!", user.password),
    );
    assert.equal((await clone.auditLog(user)).total, 257);
    assert.equal(
      (await clone.db.query("SELECT COUNT(*) AS n FROM kp_sessions")).rows[0].n,
      0,
    );
  } finally {
    await clone.close();
  }
  assert.deepEqual(await fs.readFile(f.source), f.before);
  assert.deepEqual(
    await fs.readFile(path.join(bundle.directory, "database.sqlite")),
    f.before,
  );
});

test("audit archives select a UTC boundary exclusively, keep Unicode and do not delete history", async (t) => {
  const f = await fixture(t);
  const archive = await writeBundle({
    bytes: f.before,
    output: f.output,
    before: "2021-10-02T09:00:00.000Z",
    archiveOnly: true,
  });
  const { contents, manifest } = await verifyBundle(archive.directory);
  assert.equal(manifest.auditCount, 255);
  const lines = contents["audit.ndjson"]
    .toString("utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert(lines.every((r) => r.occurred_at < manifest.before));
  assert(lines.some((r) => r.changes[0].after.includes("Türkçe •")));
  await assert.rejects(
    prepareRecovery({ backup: archive.directory, output: f.output }),
    /tam veritabanı/,
  );
  const empty = await writeBundle({
    bytes: f.before,
    output: f.output,
    before: "2000-01-01T00:00:00.000Z",
    archiveOnly: true,
  });
  assert.equal((await verifyBundle(empty.directory)).manifest.auditCount, 0);
  assert.deepEqual(await fs.readFile(f.source), f.before);
});

test("backup verification rejects corruption, missing files, symlink payloads and mismatched metadata", async (t) => {
  const f = await fixture(t);
  let bundle = await f.backup();
  await fs.appendFile(path.join(bundle.directory, "database.sqlite"), "bad");
  await assert.rejects(verifyBundle(bundle.directory), /değiştirilmiş/);
  bundle = await f.backup();
  await fs.unlink(path.join(bundle.directory, "audit.ndjson"));
  await assert.rejects(verifyBundle(bundle.directory), /ENOENT/);
  bundle = await f.backup();
  await fs.unlink(path.join(bundle.directory, "database.sqlite"));
  await fs.symlink(f.source, path.join(bundle.directory, "database.sqlite"));
  await assert.rejects(verifyBundle(bundle.directory), /geçersiz/);
  bundle = await f.backup();
  await editManifest(bundle.directory, (m) => m.generation++);
  await assert.rejects(verifyBundle(bundle.directory), /aynı görüntüye/);
  bundle = await f.backup();
  await editManifest(bundle.directory, (m) => {
    m.files["../../source.sqlite"] = m.files["database.sqlite"];
  });
  await assert.rejects(verifyBundle(bundle.directory));
  bundle = await f.backup();
  await editManifest(
    bundle.directory,
    (m) => (m.migrationsSha256 = "0".repeat(64)),
  );
  await assert.rejects(verifyBundle(bundle.directory), /şema kaynakları/);
  assert.deepEqual(await fs.readFile(f.source), f.before);
});

test("invalid source/schema/history and public output fail without publishing a partial backup", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    writeBundle({ bytes: Buffer.from("Not a database"), output: f.output }),
    /SQLite/,
  );
  const { db } = openSnapshot(f.before, await currentSchema());
  let invalid;
  try {
    db.exec(
      "PRAGMA query_only=OFF; UPDATE kp_audit_events SET changes='invalid JSON';",
    );
    invalid = Buffer.from(db.export());
  } finally {
    db.close();
  }
  await assert.rejects(writeBundle({ bytes: invalid, output: f.output }));
  assert.deepEqual(await fs.readdir(f.output), []);
  const partial = openSnapshot(f.before, await currentSchema()).db;
  try {
    partial.exec(
      "PRAGMA query_only=OFF; DELETE FROM kp_schema_migrations WHERE version=1;",
    );
    await assert.rejects(
      writeBundle({ bytes: Buffer.from(partial.export()), output: f.output }),
      /migration geçmişi eksik/,
    );
  } finally {
    partial.close();
  }
  const siteDir = new URL(
    "../site/maintenance-test-" + randomUUID(),
    import.meta.url,
  );
  await assert.rejects(
    writeBundle({ bytes: f.before, output: fileURLToPath(siteDir) }),
    /site dizinine/,
  );
  await assert.rejects(fs.stat(siteDir), /ENOENT/);
  await assert.rejects(
    readDatabase(path.join(f.dir, "missing.sqlite")),
    /ENOENT/,
  );
  assert.deepEqual(await fs.readFile(f.source), f.before);
});

test("five calendar year retention cutoff keeps time and handles leap days and invalid dates", () => {
  assert.equal(retentionCutoff(fixedNow), "2021-10-02T09:00:00.000Z");
  assert.equal(
    retentionCutoff(new Date("2028-02-29T23:59:59.999Z")),
    "2023-02-28T23:59:59.999Z",
  );
  assert.equal(
    retentionCutoff(new Date("2026-01-01T00:00:00.000Z")),
    "2021-01-01T00:00:00.000Z",
  );
  assert.throws(() => retentionCutoff(new Date("bad")), /geçersiz/);
  assert.equal(cutoffDate("2024-02-29"), "2024-02-29T00:00:00.000Z");
  for (const invalid of [
    "2026-02-29",
    "2026-04-31",
    "2026-1-1",
    "x' OR 1=1",
    "2026-10-02T09:00:00Z",
  ])
    assert.throws(() => cutoffDate(invalid));
});

test("retention preview is read-only and apply requires a current full backup and stopped portal", async (t) => {
  const f = await fixture(t);
  const preview = await auditRetention({ source: f.source, now: fixedNow });
  assert.equal(preview.eligible, 255);
  assert.equal(preview.applied, false);
  assert.equal(preview.retentionYears, 5);
  assert.equal(preview.automaticPurge, false);
  await assert.rejects(
    auditRetention({ source: f.source, now: fixedNow, apply: true }),
    /tam yedek/,
  );
  const archive = await writeBundle({
    bytes: f.before,
    output: f.output,
    archiveOnly: true,
  });
  await assert.rejects(
    auditRetention({
      source: f.source,
      backup: archive.directory,
      now: fixedNow,
      apply: true,
    }),
    /Tam yedek/,
  );
  const bundle = await f.backup();
  await assert.rejects(
    auditRetention({
      source: f.source,
      backup: bundle.directory,
      now: fixedNow,
      apply: true,
    }),
    /kullanımda/,
  );
  await assert.rejects(
    auditRetention({
      source: path.join(bundle.directory, "database.sqlite"),
      backup: bundle.directory,
      now: fixedNow,
      apply: true,
    }),
    /kendisi temizlenemez/,
  );
  assert.deepEqual(await fs.readFile(f.source), f.before);
});

test("retention rejects an old backup without deleting any data", async (t) => {
  const f = await fixture(t);
  const bundle = await f.backup();
  await f.store.transaction((c) =>
    c.query("UPDATE kp_settings SET generation=generation+1 WHERE id=1"),
  );
  const current = await fs.readFile(f.source);
  await f.close();
  await assert.rejects(
    auditRetention({
      source: f.source,
      backup: bundle.directory,
      now: fixedNow,
      apply: true,
    }),
    /birebir görüntüsü/,
  );
  assert.deepEqual(await fs.readFile(f.source), current);
});

test("retention deletes only expired audit entries, records the maintenance and preserves all other tables", async (t) => {
  const f = await fixture(t);
  const bundle = await f.backup();
  await f.close();
  const result = await auditRetention({
    source: f.source,
    backup: bundle.directory,
    now: fixedNow,
    apply: true,
  });
  assert.equal(result.removed, 255);
  assert.equal(result.applied, true);
  const schema = await currentSchema();
  const before = tableRows(f.before, schema),
    after = tableRows(await fs.readFile(f.source), schema);
  for (const name of Object.keys(before))
    if (name !== "kp_audit_events")
      assert.deepEqual(after[name], before[name], name);
  const { db } = openSnapshot(await fs.readFile(f.source), schema);
  try {
    const rows = db.exec(
      "SELECT kind,occurred_at,changes FROM kp_audit_events ORDER BY occurred_at",
    )[0].values;
    assert.equal(rows.length, 3);
    assert.equal(rows[0][1], "2021-10-02T09:00:00.000Z");
    const event = rows.find(([kind]) => kind === "maintenance");
    assert(
      JSON.parse(event[2]).some(
        (c) => c.path[0] === "backupChecksum" && c.after === sha256(f.before),
      ),
    );
  } finally {
    db.close();
  }
  assert.deepEqual(
    await fs.readFile(path.join(bundle.directory, "database.sqlite")),
    f.before,
  );
  assert.equal((await verifyBundle(bundle.directory)).manifest.auditCount, 257);
});

test("retention rolls back deleted history if recording the maintenance fails", async (t) => {
  const f = await fixture(t);
  const bundle = await f.backup();
  await f.close();
  const upsert = SqlJsAdapter.prototype.upsert;
  SqlJsAdapter.prototype.upsert = async function (name, rows) {
    if (name === "audit_events") throw Error("Synthetic maintenance failure");
    return upsert.call(this, name, rows);
  };
  try {
    await assert.rejects(
      auditRetention({
        source: f.source,
        backup: bundle.directory,
        now: fixedNow,
        apply: true,
      }),
      /Synthetic maintenance failure/,
    );
  } finally {
    SqlJsAdapter.prototype.upsert = upsert;
  }
  assert.deepEqual(await fs.readFile(f.source), f.before);
  assert.equal((await verifyBundle(bundle.directory)).manifest.auditCount, 257);
});

test("maintenance CLI uses explicit files, defaults to a preview and rejects unknown commands/flags", async (t) => {
  const f = await fixture(t);
  const cli = fileURLToPath(
    new URL("../scripts/data-maintenance.mjs", import.meta.url),
  );
  const env = {
    ...process.env,
    DB_PROVIDER: "mssql",
    DB_SERVER: "invalid.example",
    SQLJS_FILE: path.join(f.dir, "DO-NOT-CREATE.sqlite"),
  };
  const result = await exec(
    process.execPath,
    [cli, "retention", "--source", f.source],
    { env },
  );
  assert.equal(JSON.parse(result.stdout).applied, false);
  const backed = await exec(
    process.execPath,
    [cli, "backup", "--source", f.source, "--output", f.output],
    { env },
  );
  const bundle = JSON.parse(backed.stdout).directory;
  const verified = await exec(
    process.execPath,
    [cli, "verify", "--backup", bundle],
    { env },
  );
  assert.equal(JSON.parse(verified.stdout).verified, true);
  for (const args of [
    ["purge"],
    ["backup", "--source", f.source],
    ["verify", "--backup", bundle, "--apply"],
    ["retention", "--source", f.source, "--before", "2099-01-01"],
  ])
    await assert.rejects(exec(process.execPath, [cli, ...args], { env }));
  assert.deepEqual(await fs.readFile(f.source), f.before);
  await assert.rejects(fs.stat(env.SQLJS_FILE), /ENOENT/);
});
