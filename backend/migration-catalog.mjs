import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import compatibleFingerprints from "./compatible-migration-fingerprints.json" with { type: "json" };

// Preserve the historical execution order (24 precedes 23). Version 2 is
// optional legacy person allocation storage; fresh installations skip it.
export const migrationCatalog = Object.freeze(
  [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    22, 24, 23, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37,
  ].map((version) =>
    Object.freeze({
      version,
      required: version !== 2,
      sql: version !== 3 && version !== 12,
    }),
  ),
);
export const schemaVersion = Math.max(
  ...migrationCatalog.map((m) => m.version),
);
export const requiredVersions = Object.freeze(
  migrationCatalog
    .filter((m) => m.required)
    .map((m) => m.version)
    .sort((a, b) => a - b),
);
const dir = new URL("./migrations/", import.meta.url);
const filename = (version, provider) =>
  String(version).padStart(3, "0") + "_" + provider + ".sql";
function checkProvider(provider) {
  if (!["sqljs", "mssql"].includes(provider))
    throw Error("Bilinmeyen migration sağlayıcısı.");
}
export async function validateMigrationCatalog(provider) {
  checkProvider(provider);
  const actual = (await fs.readdir(dir))
    .filter((name) => new RegExp("^\\d{3}_" + provider + "\\.sql$").test(name))
    .sort();
  const expected = migrationCatalog
    .filter((m) => m.sql)
    .map((m) => filename(m.version, provider))
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw Error("Migration kataloğu ile SQL dosyaları eşleşmiyor.");
}
export async function migrationSql(provider, version) {
  checkProvider(provider);
  if (!migrationCatalog.some((m) => m.version === version && m.sql))
    throw Error("Migration SQL kaydı katalogda bulunamadı.");
  return fs.readFile(new URL(filename(version, provider), dir), "utf8");
}
export async function executeSqlMigration(c, provider, version) {
  await c.batch(await migrationSql(provider, version));
}
export function assertKnownMigrationVersions(applied) {
  if (
    applied.some(
      (v) =>
        !Number.isSafeInteger(v) ||
        !migrationCatalog.some((m) => m.version === v),
    )
  )
    throw Error("Desteklenmeyen veritabanı şema sürümü.");
}
export function assertMigrationHistory(applied) {
  assertKnownMigrationVersions(applied);
  const missing = requiredVersions.filter((v) => !applied.includes(v));
  if (missing.length)
    throw Error(
      "Veritabanının migration geçmişi eksik: " +
        missing.join(", ") +
        ". Otomatik onarım uygulanmadı.",
    );
}
export async function migrationFingerprint(provider) {
  await validateMigrationCatalog(provider);
  const legacy = createHash("sha256");
  for (const m of [...migrationCatalog]
    .filter((m) => m.sql)
    .sort((a, b) => a.version - b.version)) {
    legacy.update(filename(m.version, provider) + "\n");
    legacy.update(await migrationSql(provider, m.version));
  }
  const legacyMigrationsSha256 = legacy.digest("hex");
  const full = createHash("sha256")
    .update("aa-migration-catalog-v1\n")
    .update(legacyMigrationsSha256);
  // Includes inline transformations (3, 12, 20, 22, 26) and execution policy.
  for (const name of [
    "migration-catalog.mjs",
    "schema-migrations.mjs",
    "../shared/actual-units.ts",
    "../shared/catalog.json",
    "../shared/risk-system-seed.ts",
  ]) {
    full
      .update("\n" + name + "\n")
      .update(await fs.readFile(new URL(name, import.meta.url)));
  }
  return {
    migrationsSha256: full.digest("hex"),
    legacyMigrationsSha256,
    compatibleMigrationsSha256: compatibleFingerprints
      .filter(
        (entry) =>
          entry.provider === provider && entry.schemaVersion === schemaVersion,
      )
      .map((entry) => entry.sha256),
  };
}
