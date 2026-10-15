import { parseArgs } from "node:util";
import {
  readDatabase,
  writeBundle,
  verifyBundle,
  prepareRecovery,
} from "./maintenance-files.mjs";
import { cutoffDate } from "./maintenance-snapshot.mjs";
import { auditRetention } from "./audit-retention.mjs";

// Explicit files only: no .env, live Store connection, migrations, purge or in-place restore.
try {
  const { positionals, values } = parseArgs({
    options: {
      source: { type: "string" },
      output: { type: "string" },
      backup: { type: "string" },
      before: { type: "string" },
      apply: { type: "boolean" },
    },
    allowPositionals: true,
  });
  if (positionals.length !== 1)
    throw Error(
      "backup | archive | verify | prepare-recovery | retention komutunu seçin.",
    );
  const command = positionals[0];
  const required = {
    backup: ["source", "output"],
    archive: ["source", "output", "before"],
    verify: ["backup"],
    "prepare-recovery": ["backup", "output"],
    retention: ["source"],
  }[command];
  const allowed =
    command === "retention" ? ["source", "backup", "apply"] : required;
  if (
    !allowed ||
    Object.keys(values).some((key) => !allowed.includes(key)) ||
    required.some((key) => !values[key])
  )
    throw Error(
      "Komutun gerekli argümanlarını kullanın: " + (required || []).join(", "),
    );
  let result;
  if (command === "retention") {
    result = await auditRetention(values);
  } else if (command === "verify") {
    const { manifest } = await verifyBundle(values.backup);
    result = {
      verified: true,
      format: manifest.format,
      auditCount: manifest.auditCount,
      schemaVersion: manifest.schemaVersion,
    };
  } else if (command === "prepare-recovery") {
    const recovery = await prepareRecovery(values);
    result = {
      directory: recovery.directory,
      ...recovery.manifest.recovery,
      liveDatabaseReplaced: false,
    };
  } else {
    const bytes = await readDatabase(values.source);
    const bundle = await writeBundle({
      bytes,
      output: values.output,
      archiveOnly: command === "archive",
      before: command === "archive" ? cutoffDate(values.before) : null,
    });
    result = {
      directory: bundle.directory,
      format: bundle.manifest.format,
      auditCount: bundle.manifest.auditCount,
      sourceChanged: false,
    };
  }
  console.log(JSON.stringify(result));
} catch (error) {
  console.error("Bakım işlemi başarısız: " + error.message);
  process.exitCode = 1;
}
