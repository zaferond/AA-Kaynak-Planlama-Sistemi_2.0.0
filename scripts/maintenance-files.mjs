import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { verifySnapshotModel } from "./snapshot-model.mjs";
import {
  openSnapshot,
  auditRows,
  sha256,
  currentSchema,
  recoverySnapshot,
  auditRowSchema,
} from "./maintenance-snapshot.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().nonnegative().safe();
const fileSchema = z.object({ sha256: digestSchema, bytes: integer }).strict();
const manifestSchema = z
  .object({
    format: z.enum(["aa-full-backup-v1", "aa-audit-archive-v1"]),
    createdAt: z.string().datetime(),
    sourceSha256: digestSchema,
    migrationsSha256: digestSchema,
    schemaVersion: integer,
    generation: integer,
    tableCounts: z.record(z.string().regex(/^kp_[a-z0-9_]+$/), integer),
    before: z.string().datetime().nullable(),
    auditCount: integer,
    files: z.record(z.enum(["database.sqlite", "audit.ndjson"]), fileSchema),
    recovery: z
      .object({ sessionsRemoved: integer, baseSourceSha256: digestSchema })
      .strict()
      .optional(),
  })
  .strict();

export async function readDatabase(source) {
  if (!source) throw Error("--source veritabanı dosyası zorunludur.");
  const file = path.resolve(source);
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw Error("Kaynak normal bir veritabanı dosyası olmalıdır.");
  // SQL.js commits by atomic rename. A single read sees one complete disk image.
  return fs.readFile(file);
}
async function outputDirectory(output) {
  if (!output) throw Error("--output özel yedek dizini zorunludur.");
  const folder = path.resolve(output);
  const publicSite = await fs
    .realpath(path.resolve(root, "site"))
    .catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return path.resolve(root, "site");
    });
  if (folder === publicSite || folder.startsWith(publicSite + path.sep))
    throw Error("Yedekler web üzerinden sunulan site dizinine yazılamaz.");
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  const real = await fs.realpath(folder);
  if (real === publicSite || real.startsWith(publicSite + path.sep))
    throw Error("Yedekler web üzerinden sunulan site dizinine yazılamaz.");
  if (!(await fs.stat(real)).isDirectory())
    throw Error("Çıktı bir dizin olmalıdır.");
  return real;
}
async function durableFile(file, bytes) {
  const handle = await fs.open(file, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export async function writeBundle({
  bytes,
  output,
  before = null,
  archiveOnly = false,
  recovery,
}) {
  const schema = await currentSchema();
  const { db, summary } = openSnapshot(bytes, schema);
  try {
    await verifySnapshotModel(db);
  } catch (error) {
    db.close();
    throw error;
  }
  let stage;
  try {
    const folder = await outputDirectory(output);
    stage = await fs.mkdtemp(path.join(folder, ".aa-pending-"));
    await fs.chmod(stage, 0o700);
    const files = {};
    if (!archiveOnly) {
      await durableFile(path.join(stage, "database.sqlite"), bytes);
      files["database.sqlite"] = { bytes: bytes.length, sha256: sha256(bytes) };
    }
    const audit = await fs.open(path.join(stage, "audit.ndjson"), "wx", 0o600);
    let count = 0;
    try {
      for (const row of auditRows(db, before)) {
        await audit.writeFile(JSON.stringify(row) + "\n");
        count++;
      }
      await audit.sync();
    } finally {
      await audit.close();
    }
    const auditBytes = await fs.readFile(path.join(stage, "audit.ndjson"));
    files["audit.ndjson"] = {
      bytes: auditBytes.length,
      sha256: sha256(auditBytes),
    };
    const manifest = manifestSchema.parse({
      format: archiveOnly ? "aa-audit-archive-v1" : "aa-full-backup-v1",
      createdAt: new Date().toISOString(),
      sourceSha256: sha256(bytes),
      migrationsSha256: schema.migrationsSha256,
      ...summary,
      before,
      auditCount: count,
      files,
      ...(recovery ? { recovery } : {}),
    });
    await durableFile(
      path.join(stage, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    await verifyBundle(stage);
    const target = path.join(
      folder,
      (archiveOnly ? "aa-audit-" : "aa-backup-") +
        manifest.createdAt.replace(/[-:.]/g, "") +
        "-" +
        randomUUID(),
    );
    await fs.rename(stage, target);
    stage = null;
    return { directory: target, manifest };
  } finally {
    db.close();
    if (stage) await fs.rm(stage, { recursive: true, force: true });
  }
}
async function payload(folder, name) {
  const file = path.join(folder, name);
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw Error("Yedek dosyası geçersiz: " + name);
  return fs.readFile(file);
}
export async function verifyBundle(folder) {
  if (!folder) throw Error("--backup yedek dizini zorunludur.");
  const manifest = manifestSchema.parse(
    JSON.parse(await payload(folder, "manifest.json")),
  );
  const expectedFiles =
    manifest.format === "aa-full-backup-v1"
      ? ["database.sqlite", "audit.ndjson"]
      : ["audit.ndjson"];
  if (
    JSON.stringify(Object.keys(manifest.files).sort()) !==
    JSON.stringify(expectedFiles.sort())
  )
    throw Error("Yedek dosya listesi geçersiz.");
  const contents = {};
  for (const name of expectedFiles) {
    const bytes = await payload(folder, name);
    if (
      sha256(bytes) !== manifest.files[name].sha256 ||
      bytes.length !== manifest.files[name].bytes
    )
      throw Error("Yedek dosyası değiştirilmiş veya eksik: " + name);
    contents[name] = bytes;
  }
  const lines = contents["audit.ndjson"]
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => auditRowSchema.parse(JSON.parse(line)));
  if (
    lines.length !== manifest.auditCount ||
    lines.some(
      (line) =>
        !Array.isArray(line.changes) ||
        (manifest.before && line.occurred_at >= manifest.before),
    )
  )
    throw Error("Arşiv kayıt sayısı/tarih aralığı geçersiz.");
  const schema = await currentSchema();
  if (
    manifest.schemaVersion !== schema.version ||
    (manifest.migrationsSha256 !== schema.migrationsSha256 &&
      manifest.migrationsSha256 !== schema.legacyMigrationsSha256 &&
      !schema.compatibleMigrationsSha256.includes(manifest.migrationsSha256))
  )
    throw Error(
      "Yedeğe uygun uygulama sürümünü kullanın; şema kaynakları farklı.",
    );
  if (manifest.format === "aa-full-backup-v1") {
    if (
      manifest.before !== null ||
      manifest.sourceSha256 !== sha256(contents["database.sqlite"])
    )
      throw Error("Tam yedek kapsamı geçersiz.");
    const { db, summary } = openSnapshot(contents["database.sqlite"], schema);
    try {
      await verifySnapshotModel(db);
      if (
        !isDeepStrictEqual(summary.tableCounts, manifest.tableCounts) ||
        summary.generation !== manifest.generation ||
        !isDeepStrictEqual([...auditRows(db)], lines)
      )
        throw Error(
          "Yedek metadatası/veritabanı/arşiv aynı görüntüye ait değil.",
        );
    } finally {
      db.close();
    }
  }
  return { manifest, contents };
}
export async function prepareRecovery({ backup, output }) {
  const { manifest, contents } = await verifyBundle(backup);
  if (manifest.format !== "aa-full-backup-v1")
    throw Error("İşlem geçmişi arşivi tam veritabanı yedeği değildir.");
  const recovered = recoverySnapshot(
    contents["database.sqlite"],
    await currentSchema(),
  );
  return writeBundle({
    bytes: recovered.bytes,
    output,
    recovery: {
      sessionsRemoved: recovered.sessionsRemoved,
      baseSourceSha256: manifest.sourceSha256,
    },
  });
}
