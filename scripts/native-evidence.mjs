import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  deploymentSources,
  readDeploymentFile,
} from "./deployment-manifest.mjs";
import { schemaVersion } from "../backend/migration-catalog.mjs";
export const nativeReleaseChecks = Object.freeze([
  "currentSchemaAndHierarchy",
  "personalCalendarPrivacy",
  "actualReportProjection",
  "adSessionLifecycle",
  "encryptedNativeConnection",
]);
export async function nativeSourceHashes(root) {
  const hashes = await deploymentSources(root);
  const tests = (await fs.readdir(path.join(root, "tests")))
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => "tests/" + name);
  for (const file of [
    ...tests,
    ".github/workflows/mssql-native.yml",
    ".github/workflows/quality.yml",
  ])
    hashes[file] = createHash("sha256")
      .update(await readDeploymentFile(root, file))
      .digest("hex");
  return hashes;
}
export async function nativeEvidenceContext(root, commit) {
  const lock = JSON.parse(
    await fs.readFile(path.join(root, "package-lock.json"), "utf8"),
  );
  return {
    commit,
    schema: schemaVersion,
    sourceHashes: await nativeSourceHashes(root),
    drivers: Object.fromEntries(
      ["mssql", "tedious"].map((name) => [
        name,
        lock.packages["node_modules/" + name].version,
      ]),
    ),
  };
}
export function installedSqlDrivers(root) {
  const require = createRequire(pathToFileURL(path.join(root, "package.json")));
  const mssql = createRequire(require.resolve("mssql"));
  return {
    mssql: require("mssql/package.json").version,
    tedious: mssql("tedious/package.json").version,
  };
}
function requireCondition(value, message) {
  if (!value) throw Error(message);
}
export function verifyNativeEvidence(report, expected) {
  requireCondition(
    /^[a-f0-9]{40}$/.test(expected.commit || ""),
    "Expected commit is required.",
  );
  requireCondition(
    report && typeof report === "object",
    "Invalid native evidence.",
  );
  requireCondition(
    report.checkedCommit === expected.commit,
    "Native evidence belongs to another commit.",
  );
  requireCondition(
    report.schema === expected.schema,
    "Native evidence belongs to another schema.",
  );
  requireCondition(
    report.cleanupVerified === true,
    "Native database cleanup is not verified.",
  );
  requireCondition(
    report.server?.compatibilityLevel >= 130 &&
      typeof report.server?.productVersion === "string",
    "Native SQL Server metadata is missing.",
  );
  for (const name of ["mssql", "tedious"])
    requireCondition(
      report.drivers?.[name] === expected.drivers[name],
      "Native driver does not match the lock.",
    );
  requireCondition(
    report.releaseChecks &&
      nativeReleaseChecks.every((key) => report.releaseChecks[key] === true),
    "Current native release checks are incomplete.",
  );
  requireCondition(
    report.sourceHashes &&
      typeof report.sourceHashes === "object" &&
      Object.keys(report.sourceHashes).length ===
        Object.keys(expected.sourceHashes).length,
    "Native source inventory is incomplete.",
  );
  for (const [name, hash] of Object.entries(expected.sourceHashes))
    requireCondition(
      report.sourceHashes[name] === hash,
      "Native source hashes do not match the current files.",
    );
  return {
    ok: true,
    commit: report.checkedCommit,
    schema: report.schema,
    drivers: { mssql: report.drivers.mssql, tedious: report.drivers.tedious },
    sourceFiles: Object.keys(expected.sourceHashes).length,
    cleanupVerified: true,
    releaseChecks: nativeReleaseChecks,
  };
}
