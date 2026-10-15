import { createHash } from "node:crypto";
import initSqlJs from "sql.js";
import { z } from "zod";
import { tables } from "../backend/tables.mjs";
import {
  assertMigrationHistory,
  migrationFingerprint,
  requiredVersions,
  schemaVersion,
} from "../backend/migration-catalog.mjs";
import {
  assertSchemaContract,
  expectedSchemaContract,
} from "./schema-contract.mjs";

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const SQL = await initSqlJs();
const auditValue = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export const auditRowSchema = z
  .object({
    id: z.string().min(1).max(36),
    occurred_at: z
      .string()
      .datetime()
      .refine((v) => new Date(v).toISOString() === v),
    actor_id: z.string().max(120),
    actor_name: z.string().max(150),
    kind: z.string().max(20),
    record_id: z.string().max(400),
    record_name: z.string().max(300),
    action: z.enum(["create", "update", "delete"]),
    changes: z.array(
      z
        .object({
          path: z.array(z.string()),
          before: auditValue,
          after: auditValue,
        })
        .strict(),
    ),
  })
  .strict();
export async function currentSchema() {
  return {
    version: schemaVersion,
    requiredVersions: [...requiredVersions],
    ...(await migrationFingerprint("sqljs")),
    contract: await expectedSchemaContract(),
  };
}
export function cutoffDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || ""))
    throw Error("--before gerçek bir YYYY-MM-DD tarihi olmalıdır.");
  const iso = value + "T00:00:00.000Z";
  if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString() !== iso)
    throw Error("--before gerçek bir YYYY-MM-DD tarihi olmalıdır.");
  return iso;
}
function scalar(db, query) {
  return db.exec(query)[0]?.values[0]?.[0];
}
function inspect(db, schema) {
  if (scalar(db, "PRAGMA integrity_check") !== "ok")
    throw Error("Veritabanı bütünlük kontrolü başarısız.");
  if (db.exec("PRAGMA foreign_key_check").some((r) => r.values.length))
    throw Error("Veritabanında geçersiz ilişkiler var.");
  const names =
    db
      .exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'kp_%' ORDER BY name",
      )[0]
      ?.values.map(([name]) => name) || [];
  const required = [
    "kp_schema_migrations",
    // v2's legacy table can exist after upgrades, but fresh installs skip v2.
    ...Object.keys(tables)
      .filter((name) => name !== "person_allocations")
      .map((name) => "kp_" + name),
  ];
  if (
    required.some((name) => !names.includes(name)) ||
    names.some((name) => !/^kp_[a-z0-9_]+$/.test(name))
  )
    throw Error(
      "Güncel uygulama tabloları bulunamadı; kaynak tam bir SQL.js veritabanı olmalıdır.",
    );
  const version = Number(
    scalar(db, "SELECT MAX(version) FROM kp_schema_migrations"),
  );
  if (version !== schema.version)
    throw Error(
      "Şema sürümü bu uygulamayla eşleşmiyor. Yedeğe uygun uygulama sürümünü kullanın.",
    );
  const applied = db
    .exec("SELECT version FROM kp_schema_migrations")[0]
    .values.map(([value]) => Number(value));
  assertMigrationHistory(applied);
  assertSchemaContract(db, schema.contract);
  const tableCounts = Object.fromEntries(
    names.map((name) => [
      name,
      Number(scalar(db, `SELECT COUNT(*) FROM "${name}"`)),
    ]),
  );
  const generation = Number(
    scalar(db, "SELECT generation FROM kp_settings WHERE id=1"),
  );
  if (!Number.isSafeInteger(generation) || generation < 0)
    throw Error("Veritabanı veri sürümü geçersiz.");
  return { schemaVersion: version, generation, tableCounts };
}
export function openSnapshot(bytes, schema) {
  if (
    !Buffer.from(bytes).subarray(0, 16).equals(Buffer.from("SQLite format 3\0"))
  )
    throw Error("Kaynak bir SQLite/SQL.js veritabanı değil.");
  // SQL.js may take ownership of its input. A private copy keeps callers' bytes immutable.
  const db = new SQL.Database(Uint8Array.from(bytes));
  try {
    db.exec("PRAGMA query_only=ON");
    return { db, summary: inspect(db, schema) };
  } catch (error) {
    db.close();
    throw error;
  }
}
export function auditRows(db, before = null) {
  const st = db.prepare(
    "SELECT * FROM kp_audit_events" +
      (before ? " WHERE occurred_at < ?" : "") +
      " ORDER BY occurred_at,id",
  );
  if (before) st.bind([before]);
  return (function* () {
    try {
      while (st.step()) {
        const row = st.getAsObject();
        const changes = JSON.parse(row.changes);
        if (
          !Array.isArray(changes) ||
          new Date(row.occurred_at).toISOString() !== row.occurred_at
        )
          throw Error("İşlem geçmişi kaydı geçersiz.");
        yield auditRowSchema.parse({ ...row, changes });
      }
    } finally {
      st.free();
    }
  })();
}
export function recoverySnapshot(bytes, schema) {
  const { db, summary } = openSnapshot(bytes, schema);
  try {
    // Only a new in-memory copy is changed. Never open/write the source database.
    db.exec("PRAGMA query_only=OFF; DELETE FROM kp_sessions;");
    return {
      bytes: Buffer.from(db.export()),
      sessionsRemoved: summary.tableCounts.kp_sessions,
    };
  } finally {
    db.close();
  }
}
