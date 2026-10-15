import test from "node:test";
import {
  compareSnapshotValidation,
  legacyValidationProjection,
} from "./snapshot-validation-suite.mjs";
import { createPersonMonthHoursIndex } from "../shared/actual-units.ts";
import { referencePersonMonthHours } from "./person-month-reference.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  nativeSourceHashes,
  installedSqlDrivers,
} from "../scripts/native-evidence.mjs";
import { validate } from "../shared/server-domain.ts";
import { nativeReleaseSuite } from "./native-release-suite.mjs";
import { Store } from "../backend/store.mjs";
import { schemaVersion } from "../backend/migration-catalog.mjs";
import {
  nativeContentionProfile,
  nativeProfileOptions,
} from "../scripts/native-contention-profile.mjs";
import { concurrencySuite } from "./concurrency-suite.mjs";
import { planningContractSuite } from "./planning-contract-suite.mjs";
import { planningPreflightSuite } from "./planning-preflight-suite.mjs";
import { integrationSuite } from "./integration-suite.mjs";
import { sharedRateLimitSuite } from "./rate-limit-suite.mjs";
import {
  nativePoolSuite,
  nativeMetadataBatchSuite,
  nativeScanSuite,
  nativeLoadProfile,
  nativeUpgradeSuite,
  checkedNativeContext,
} from "./mssql-native-suite.mjs";
import {
  mssqlTestEnvironment,
  withMssqlTestDatabase,
  cleanupTestTables,
} from "../scripts/mssql-test-environment.mjs";

test(
  "MSSQL: native schema, HTTP, independent pools, rollback, scope and synthetic load",
  { timeout: 900000 },
  async (t) => {
    const env = mssqlTestEnvironment();
    const checked = checkedNativeContext(t);
    const size = Number(process.env.TEST_DB_LOAD_SIZE || 1000),
      samples = Number(process.env.TEST_DB_LOAD_SAMPLES || 3);
    assert(Number.isInteger(size) && size >= 24 && size <= 100000);
    assert(Number.isInteger(samples) && samples >= 1 && samples <= 10);
    const report = await withMssqlTestDatabase(env, async (server) => {
      const stores = Array.from({ length: 2 }, () => new Store({ env }));
      try {
        await checked.test(
          `native legacy v2 upgrade to schema ${schemaVersion} preserves data and runs once`,
          () => nativeUpgradeSuite(stores[0]),
        );
        await cleanupTestTables(stores[0].db);
        await checked.test(
          "native HTTP CRUD, permissions, import, restore and SQL constraints",
          () => integrationSuite(stores[0]),
        );
        await concurrencySuite(stores[0], checked);
        await cleanupTestTables(stores[0].db);
        await stores[0].connect();
        await checked.test(
          "native single-cell preflight matches full staging and preserves rollback, scope and audit",
          (sub) => planningPreflightSuite(stores[0], sub),
        );
        await cleanupTestTables(stores[0].db);
        await stores[0].connect();
        await checked.test(
          "native single-cell validation dependency contract matches frozen full commits and rejects unrelated faults",
          (sub) => planningContractSuite(stores[0], sub),
        );
        // Each profile starts with a fresh schema and no preceding fixture/audit.
        await cleanupTestTables(stores[0].db);
        await stores[0].connect();
        await stores[1].connect();
        await checked.test(
          "shared login budgets across independent native pools and HTTP services",
          (sub) => sharedRateLimitSuite(stores, sub),
        );
        await nativePoolSuite(stores, checked);
        await checked.test(
          "native metadata batch equals ordinary reads and SQL errors cannot stage a write",
          (sub) => nativeMetadataBatchSuite(stores, sub),
        );
        await cleanupTestTables(stores[0].db);
        await stores[0].connect();
        const load = await nativeLoadProfile(stores, checked, {
          size,
          samples,
        });
        await checked.test(
          "native numeric scans equal buffered snapshots and drain errors/cancellation before continuation",
          (sub) => nativeScanSuite(stores, sub),
        );
        let contention;
        if (process.env.TEST_DB_CONTENTION === "true") {
          const options = nativeProfileOptions({
            requests: process.env.TEST_DB_PROFILE_REQUESTS,
            actuals: process.env.TEST_DB_PROFILE_ACTUALS,
            concurrency: process.env.TEST_DB_PROFILE_CONCURRENCY,
          });
          assert(size >= options.requests);
          await cleanupTestTables(stores[0].db);
          await stores[0].connect();
          await checked.test(
            "native bounded contention profile preserves scope, revisions, commit snapshots and audit",
            async () => {
              contention = await nativeContentionProfile(stores, {
                size,
                ...options,
              });
            },
          );
        }
        const before = await stores[0].transaction(
          (c) => stores[0].read(c),
          true,
        );
        await checked.test(
          "native current snapshot validates completely; legacy fields match the frozen oracle",
          () => {
            const complete = validate(before.data, {
              previousResources: before.data.resources,
            });
            assert.deepEqual(
              validate(complete, { previousResources: complete.resources }),
              complete,
            );
            const d = legacyValidationProjection(before.data);
            assert(
              compareSnapshotValidation(d, { previousResources: d.resources })
                .data,
            );
            const invalid = structuredClone(d);
            invalid.allocations["missing|missing|2026-01"] = 1;
            assert.equal(compareSnapshotValidation(invalid).error?.status, 400);
          },
        );
        await checked.test(
          "native persisted calendar/hour snapshot matches the frozen person-month calculation",
          () => {
            const d = before.data,
              index = createPersonMonthHoursIndex(d);
            assert(d.resources.length > 0);
            const months = new Set([
              "2026-01",
              "2026-02",
              ...Object.keys(d.actualPercentEntries).map(
                (key) => key.split("|")[2],
              ),
            ]);
            for (const resource of d.resources)
              for (const month of months)
                assert.deepEqual(
                  index.get(resource.id, month),
                  referencePersonMonthHours(
                    month,
                    resource.id,
                    d.actualWorkedHours[resource.id + "|" + month],
                    d.workCalendar,
                    d.personCalendar,
                  ),
                );
          },
        );
        await stores[1].close();
        await stores[1].connect();
        assert.deepEqual(
          await stores[1].transaction((c) => stores[1].read(c), true),
          before,
        );
        await cleanupTestTables(stores[0].db);
        await stores[0].connect();
        const releaseChecks = await nativeReleaseSuite(stores, checked);
        const root = fileURLToPath(new URL("../", import.meta.url));
        const sourceHashes = await nativeSourceHashes(root);
        return {
          checkedAt: new Date().toISOString(),
          checkedCommit: /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || "")
            ? process.env.GITHUB_SHA
            : null,
          sourceHashScope:
            "Application/build inputs and test sources; identity is not feature coverage.",
          node: process.version,
          schema: schemaVersion,
          server,
          load,
          ...(contention ? { contention } : {}),
          sourceHashes,
          releaseChecks,
          drivers: installedSqlDrivers(root),
        };
      } finally {
        const closed = await Promise.allSettled(
          stores.map((store) => store.close()),
        );
        const errors = closed
          .filter((r) => r.status === "rejected")
          .map((r) => r.reason);
        if (errors.length)
          throw new AggregateError(errors, "Test pools did not close.");
      }
    });
    // No success report until database cleanup and lease release have finished.
    if (process.env.TEST_DB_REPORT)
      await fs.writeFile(
        process.env.TEST_DB_REPORT,
        JSON.stringify({ ...report, cleanupVerified: true }, null, 2) + "\n",
        { mode: 0o600, flag: "wx" },
      );
    t.diagnostic(
      "Native MSSQL assertions and cleanup completed; no real application data or credentials in the report.",
    );
  },
);
