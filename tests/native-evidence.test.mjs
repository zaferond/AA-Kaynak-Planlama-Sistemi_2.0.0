import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeReleaseChecks,
  verifyNativeEvidence,
  nativeSourceHashes,
  installedSqlDrivers,
} from "../scripts/native-evidence.mjs";
import {
  legacyValidationProjection,
  compareSnapshotValidation,
  validationFixture,
} from "./snapshot-validation-suite.mjs";
import { validate } from "../shared/server-domain.ts";
import { fileURLToPath } from "node:url";
const expected = () => ({
  commit: "a".repeat(40),
  schema: 35,
  drivers: { mssql: "12.7.2", tedious: "20.3.8" },
  sourceHashes: {
    "backend/a.mjs": "b".repeat(64),
    "tests/a.mjs": "c".repeat(64),
  },
});
const report = () => ({
  checkedCommit: expected().commit,
  schema: expected().schema,
  drivers: expected().drivers,
  sourceHashes: expected().sourceHashes,
  cleanupVerified: true,
  server: { compatibilityLevel: 160, productVersion: "synthetic" },
  releaseChecks: Object.fromEntries(
    nativeReleaseChecks.map((name) => [name, true]),
  ),
});
test("native acceptance rejects other commits/schemas, missing cleanup/checks, old drivers and changed/extra/missing source files", () => {
  assert.equal(verifyNativeEvidence(report(), expected()).ok, true);
  for (const change of [
    (r) => (r.checkedCommit = "d".repeat(40)),
    (r) => (r.schema = 32),
    (r) => (r.cleanupVerified = false),
    (r) => delete r.server,
    (r) => (r.drivers.tedious = "20.0.0"),
    (r) => delete r.releaseChecks,
    ...nativeReleaseChecks.map(
      (name) => (r) => (r.releaseChecks[name] = false),
    ),
    (r) => (r.sourceHashes["backend/a.mjs"] = "d".repeat(64)),
    (r) => delete r.sourceHashes["tests/a.mjs"],
    (r) => (r.sourceHashes["extra.mjs"] = "e".repeat(64)),
  ]) {
    const r = report();
    change(r);
    assert.throws(() => verifyNativeEvidence(r, expected()));
  }
  assert.throws(() =>
    verifyNativeEvidence(report(), { ...expected(), commit: "short" }),
  );
});
test("native source inventory includes current application, migration, driver locks, tests and workflows without environment/data", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const hashes = await nativeSourceHashes(root);
  for (const name of [
    "backend/migrations/035_mssql.sql",
    "package-lock.json",
    "backend/actual-report-reader.mjs",
    "tests/native-evidence.test.mjs",
    ".github/workflows/quality.yml",
    ".github/workflows/mssql-native.yml",
  ])
    assert.match(hashes[name], /^[a-f0-9]{64}$/);
  assert(
    !Object.keys(hashes).some(
      (name) =>
        name.startsWith("data/") ||
        name.includes(".env") ||
        name.startsWith("ci-evidence/"),
    ),
  );
  assert.deepEqual(installedSqlDrivers(root), {
    mssql: "12.7.2",
    tedious: "20.3.8",
  });
});
test("legacy validator stays independent; current hierarchy is validated separately and PO/Leader data cannot silently enter the old contract", () => {
  const data = validationFixture();
  data.leaderParents = {};
  data.leadershipUnits = {};
  data.resources[0].versions[0].assignmentRole = "member";
  const before = structuredClone(data),
    legacy = legacyValidationProjection(data);
  assert(
    compareSnapshotValidation(legacy, { previousResources: legacy.resources })
      .data,
  );
  assert.deepEqual(validate(validate(data)), validate(data));
  assert.deepEqual(data, before);
  for (const role of ["leader", "productOwner"]) {
    const invalid = structuredClone(data);
    invalid.resources[0].versions[0].assignmentRole = role;
    assert.throws(() => legacyValidationProjection(invalid));
  }
});
