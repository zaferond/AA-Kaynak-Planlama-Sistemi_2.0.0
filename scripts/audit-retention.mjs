import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import policy from "../shared/data-retention-policy.json" with { type: "json" };
import { SqlJsAdapter } from "../backend/adapters/sqljs.mjs";
import { readDatabase, verifyBundle } from "./maintenance-files.mjs";
import {
  sha256,
  currentSchema,
  openSnapshot,
} from "./maintenance-snapshot.mjs";

export function retentionCutoff(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw Error("Bakım tarihi geçersiz.");
  const year = now.getUTCFullYear() - policy.auditRetentionYears;
  const month = now.getUTCMonth();
  const day = Math.min(
    now.getUTCDate(),
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
  );
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(year, month, day);
  return cutoff.toISOString();
}
export async function auditRetention({
  source,
  backup,
  apply = false,
  now = new Date(),
}) {
  const cutoff = retentionCutoff(now);
  const bytes = await readDatabase(source);
  const schema = await currentSchema();
  const { db, summary } = openSnapshot(bytes, schema);
  let eligible;
  const countQuery = db.prepare(
    "SELECT COUNT(*) AS n FROM kp_audit_events WHERE occurred_at < ?",
  );
  try {
    countQuery.bind([cutoff]);
    countQuery.step();
    eligible = Number(countQuery.getAsObject().n);
  } finally {
    countQuery.free();
    db.close();
  }
  const preview = {
    retentionYears: policy.auditRetentionYears,
    cutoff,
    total: summary.tableCounts.kp_audit_events,
    eligible,
    sourceSha256: sha256(bytes),
    automaticPurge: policy.automaticPurge,
  };
  if (!apply) return { ...preview, applied: false };
  if (!backup)
    throw Error(
      "Temizleme için doğrulanabilir tam yedek --backup ile belirtilmelidir.",
    );
  const { manifest } = await verifyBundle(backup);
  if (
    manifest.format !== "aa-full-backup-v1" ||
    manifest.sourceSha256 !== preview.sourceSha256
  )
    throw Error(
      "Tam yedek güncel kaynak dosyasının birebir görüntüsü olmalıdır. Yeni yedek alın.",
    );
  if (
    (await fs.realpath(source)) ===
    (await fs.realpath(path.join(backup, "database.sqlite")))
  )
    throw Error("Yedek veritabanının kendisi temizlenemez.");
  if (eligible === 0) return { ...preview, applied: false, removed: 0 };
  const adapter = new SqlJsAdapter(source);
  let opened = false;
  try {
    await adapter.open();
    opened = true;
    // The adapter's process lock excludes a running portal and other maintenance writers.
    if (sha256(await readDatabase(source)) !== preview.sourceSha256)
      throw Error("Kaynak dosyası önizlemeden sonra değişti. Yeni yedek alın.");
    await adapter.transaction(async (c) => {
      const count = Number(
        (
          await c.query(
            "SELECT COUNT(*) AS n FROM kp_audit_events WHERE occurred_at < @p0",
            [cutoff],
          )
        ).rows[0].n,
      );
      if (count !== eligible) throw Error("Temizlenecek kayıtlar değişti.");
      const deleted = await c.query(
        "DELETE FROM kp_audit_events WHERE occurred_at < @p0",
        [cutoff],
      );
      if (deleted.rowCount !== eligible)
        throw Error("Silinen kayıt sayısı beklenenle eşleşmiyor.");
      await c.upsert("audit_events", [
        {
          id: randomUUID(),
          occurred_at: now.toISOString(),
          actor_id: "maintenance-cli",
          actor_name: ("Bakım komutu · " + os.userInfo().username).slice(
            0,
            150,
          ),
          kind: "maintenance",
          record_id: "audit-retention",
          record_name: "İşlem geçmişi saklama politikası",
          action: "delete",
          changes: JSON.stringify([
            {
              path: ["auditRetentionYears"],
              before: null,
              after: policy.auditRetentionYears,
            },
            { path: ["auditCutoff"], before: null, after: cutoff },
            { path: ["auditRemoved"], before: 0, after: eligible },
            {
              path: ["backupChecksum"],
              before: null,
              after: manifest.sourceSha256,
            },
          ]),
        },
      ]);
    });
    return {
      ...preview,
      applied: true,
      removed: eligible,
      maintenanceEventRecorded: true,
    };
  } finally {
    if (opened) await adapter.close();
  }
}
