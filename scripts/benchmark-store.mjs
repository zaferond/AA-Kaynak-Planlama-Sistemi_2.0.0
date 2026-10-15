import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mergePlanningDelta } from "../shared/planning-response.ts";
import { Store } from "../backend/store.mjs";
import { benchmarkCommand } from "./benchmark-command.mjs";
import { seedBenchmarkStore } from "./benchmark-fixture.mjs";
import { hashPassword } from "../backend/auth.mjs";

// Never load .env or accept a database path/provider. Only generated temporary SQL.js data.
const options = new Map(
  process.argv.slice(2).map((arg) => {
    const match =
      /^--(sizes|samples|resources|actuals|percentages|calendar-days|audit-events|operation|response|validation|snapshot-copy|command|output)=(.+)$/.exec(
        arg,
      );
    if (!match)
      throw Error(
        "Use --sizes=1000,10000,50000 --samples=5 --resources=200 --actuals=0 --percentages=0 --calendar-days=1000 --audit-events=0 --operation=allocation|actual --response=separate|planning|full|delta --command=production|callback --validation=double|single --snapshot-copy=numeric|full --output=/tmp/result.json",
      );
    return [match[1], match[2]];
  }),
);
const integer = (value, min, max) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max)
    throw Error(`Expected integer ${min}–${max}.`);
  return number;
};
const sizes = (options.get("sizes") || "1000,10000,50000")
  .split(",")
  .map((value) => integer(value, 1, 100000));
if (sizes.length > 5) throw Error("At most five data sizes per run.");
const samples = integer(options.get("samples") || "5", 1, 20);
const resources = integer(options.get("resources") || "200", 1, 10000);
const actuals = integer(options.get("actuals") || "0", 0, 100000);
const percentages = integer(options.get("percentages") || "0", 0, actuals);
const calendarDays = integer(options.get("calendar-days") || "1000", 0, 100000);
const auditEvents = integer(options.get("audit-events") || "0", 0, 100000);
const responseMode = options.get("response") || "separate";
if (!["separate", "planning", "full", "delta"].includes(responseMode))
  throw Error("Expected --response=separate, planning, full or delta.");
const operation = options.get("operation") || "allocation";
if (!["allocation", "actual"].includes(operation))
  throw Error("Expected --operation=allocation or actual.");
if (operation === "actual" && (!actuals || responseMode === "delta"))
  throw Error("Actual edits require --actuals>0 and a full response.");
const validationMode = options.get("validation") || "single";
if (!["single", "double"].includes(validationMode))
  throw Error("Expected --validation=single or --validation=double.");
const commandMode =
  options.get("command") ||
  (validationMode === "double" ? "callback" : "production");
// Reject incompatible options before creating accounts or a temporary database.
benchmarkCommand([], { mode: commandMode, validation: validationMode });
const snapshotCopy = options.get("snapshot-copy") || "numeric";
if (!["numeric", "full"].includes(snapshotCopy))
  throw Error("Expected --snapshot-copy=numeric or full.");
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[
    Math.max(0, Math.ceil(values.length * p) - 1)
  ];
const round = (value) => Math.round(value * 100) / 100;
// Compare complete models independently of SQL/object field insertion order.
// Arrays keep their order. This runs outside all measured intervals.
const canonicalSnapshot = (value) =>
  Array.isArray(value)
    ? value.map(canonicalSnapshot)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonicalSnapshot(value[key])]),
        )
      : value;

function instrument(store) {
  let current;
  const originals = [];
  const wrap = (target, name, replacement) => {
    const original = target[name];
    target[name] = replacement(original);
    originals.push(() => {
      target[name] = original;
    });
  };
  for (const method of ["read", "persist", "prepareMutationView"])
    wrap(
      store,
      method,
      (original) =>
        async function (...args) {
          const start = performance.now();
          try {
            const result = await original.apply(this, args);
            if (current && method === "persist" && result)
              current.changedRecords = Object.fromEntries(
                Object.entries(result).map(([kind, records]) => [
                  kind,
                  records.length,
                ]),
              );
            return result;
          } finally {
            if (current) {
              current[method + "Ms"] += performance.now() - start;
              current[method + "Calls"]++;
            }
          }
        },
    );
  for (const method of ["validateSnapshot", "prepareMutationSettings"])
    wrap(
      store,
      method,
      (original) =>
        function (...args) {
          const start = performance.now();
          try {
            return original.apply(this, args);
          } finally {
            if (current) {
              current[method + "Ms"] += performance.now() - start;
              current[method + "Calls"]++;
            }
          }
        },
    );
  wrap(
    store,
    "copySnapshot",
    (original) =>
      function (...args) {
        const start = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          if (current) {
            current.snapshotCopyMs += performance.now() - start;
            current[
              args[1]?.planningOnly && snapshotCopy === "numeric"
                ? "planningDraftCopies"
                : "generalDraftCopies"
            ]++;
          }
        }
      },
  );
  wrap(
    globalThis,
    "structuredClone",
    (original) =>
      function (...args) {
        const start = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          if (current) {
            current.cloneMs += performance.now() - start;
            current.cloneCalls++;
          }
        }
      },
  );
  wrap(
    store.db,
    "raw",
    (original) =>
      function (sql, values, consume) {
        const start = performance.now();
        const result = original.call(this, sql, values, consume);
        if (current) {
          current.sqlStatements++;
          if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql)) {
            const name = /\bkp_([a-z_]+)/i.exec(sql)?.[1] || "other";
            const group = (current.sqlReads[name] ??= {
              calls: 0,
              rows: 0,
              ms: 0,
            });
            group.calls++;
            group.rows += result.rowCount;
            group.ms += performance.now() - start;
            current.selectedRows += result.rowCount;
            current.materializedRows += result.rows.length;
          } else {
            const name = /\bkp_([a-z_]+)/i.exec(sql)?.[1] || "other";
            current.writtenRows[name] =
              (current.writtenRows[name] || 0) + result.rowCount;
            current.writeParameterBytes += Buffer.byteLength(
              JSON.stringify(values || []),
            );
          }
        }
        return result;
      },
  );
  wrap(
    store.db.db,
    "export",
    (original) =>
      function (...args) {
        const start = performance.now();
        const result = original.apply(this, args);
        if (current) {
          current.exportMs += performance.now() - start;
          current.exportCalls++;
          current.exportBytes += result.length;
        }
        return result;
      },
  );
  // Time only the disposable database's file commit, never arbitrary files.
  wrap(
    fs,
    "open",
    (original) =>
      async function (...args) {
        if (args[0] !== store.db.file + ".tmp")
          return original.apply(this, args);
        const start = performance.now();
        const handle = await original.apply(this, args);
        if (current) current.fileCommitMs += performance.now() - start;
        for (const name of ["writeFile", "sync", "close"])
          wrap(
            handle,
            name,
            (method) =>
              async function (...values) {
                const start = performance.now();
                try {
                  return await method.apply(this, values);
                } finally {
                  if (current)
                    current.fileCommitMs += performance.now() - start;
                }
              },
          );
        return handle;
      },
  );
  wrap(
    fs,
    "rename",
    (original) =>
      async function (...args) {
        const start = performance.now();
        try {
          return await original.apply(this, args);
        } finally {
          if (
            current &&
            args[0] === store.db.file + ".tmp" &&
            args[1] === store.db.file
          )
            current.fileCommitMs += performance.now() - start;
        }
      },
  );
  return {
    start() {
      current = {
        readMs: 0,
        readCalls: 0,
        persistMs: 0,
        persistCalls: 0,
        validateSnapshotMs: 0,
        validateSnapshotCalls: 0,
        prepareMutationSettingsMs: 0,
        prepareMutationSettingsCalls: 0,
        prepareMutationViewMs: 0,
        prepareMutationViewCalls: 0,
        domainMs:
          commandMode === "production" && operation === "allocation" ? null : 0,
        planningDraftCopies: 0,
        generalDraftCopies: 0,
        cloneMs: 0,
        cloneCalls: 0,
        snapshotCopyMs: 0,
        exportMs: 0,
        exportCalls: 0,
        exportBytes: 0,
        fileCommitMs: 0,
        sqlReads: {},
        sqlStatements: 0,
        selectedRows: 0,
        materializedRows: 0,
        writtenRows: {},
        changedRecords: {},
        writeParameterBytes: 0,
      };
      return current;
    },
    stop() {
      current = undefined;
    },
    restore() {
      originals.reverse().forEach((restore) => restore());
    },
  };
}

const password = await hashPassword("Synthetic-benchmark-only-284!");
const results = [];
for (const size of sizes) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-store-benchmark-"));
  const file = path.join(dir, "synthetic.sqlite");
  const store = new Store({
    env: { NODE_ENV: "test", DB_PROVIDER: "sqljs", SQLJS_FILE: file },
  });
  if (snapshotCopy === "full")
    store.copySnapshot = (data) => structuredClone(data);
  let metrics;
  try {
    await store.connect();
    await store.bootstrapUser({
      _id: "bench-admin",
      username: "bench.admin",
      name: "Synthetic admin",
      role: "admin",
      leaders: [],
      active: true,
      password,
      revision: 1,
      version: 1,
    });
    const user = await store.findUser({ id: "bench-admin" });
    const planningKey = await seedBenchmarkStore(store, size, {
      resources,
      actuals,
      percentages,
      calendarDays,
      auditEvents,
    });
    const key =
      operation === "allocation"
        ? planningKey
        : Object.keys((await store.read()).data.actualAllocations)[0];
    const amount = (high) =>
      operation === "allocation" ? (high ? 0.5 : 0.25) : high ? 0.005 : 0.0025;
    let state = await store.view(user);
    // Warm up the same code paths, including SQL and file commit, outside measurements.
    await store.mutate(
      user,
      benchmarkCommand(
        [
          {
            kind: operation,
            id: key,
            value: amount(true),
            revision: state.data.revisions[operation + ":" + key],
          },
        ],
        { mode: commandMode, validation: validationMode },
      ).command,
      {
        returnView: responseMode !== "separate",
        planningDelta:
          responseMode === "delta"
            ? { baseGeneration: state.generation, ids: [key] }
            : undefined,
      },
    );
    state = await store.view(user);
    const unchangedModel = structuredClone(state);
    const initialGeneration = state.generation,
      initialAudit = (await store.auditLog(user)).total;
    metrics = instrument(store);
    const observations = [];
    for (let i = 0; i < samples; i++) {
      const observation = metrics.start(),
        start = performance.now();
      const result = await store.mutate(
        user,
        benchmarkCommand(
          [
            {
              kind: operation,
              id: key,
              value: amount(i % 2),
              revision: state.data.revisions[operation + ":" + key],
            },
          ],
          {
            mode: commandMode,
            validation: validationMode,
            observe: (ms) => {
              observation.domainMs += ms;
            },
          },
        ).command,
        {
          returnView: responseMode !== "separate",
          planningDelta:
            responseMode === "delta"
              ? { baseGeneration: state.generation, ids: [key] }
              : undefined,
        },
      );
      observation.mutateMs = performance.now() - start;
      const planning =
        commandMode === "production" &&
        operation === "allocation" &&
        snapshotCopy === "numeric";
      assert.equal(observation.planningDraftCopies, planning ? 1 : 0);
      assert.equal(observation.generalDraftCopies, planning ? 0 : 1);
      assert.equal(observation.validateSnapshotCalls, 1);
      assert.equal(observation.prepareMutationSettingsCalls, 1);
      assert.equal(
        observation.prepareMutationViewCalls,
        responseMode === "separate" ? 0 : 1,
      );
      const viewStart = performance.now();
      const wire =
        responseMode !== "separate" ? result : await store.view(user);
      observation.viewMs =
        responseMode !== "separate" ? 0 : performance.now() - viewStart;
      observation.pipelineMs = performance.now() - start;
      metrics.stop();
      const jsonStart = performance.now(),
        json = JSON.stringify(wire);
      observation.jsonMs = performance.now() - jsonStart;
      observation.responseBytes = Buffer.byteLength(json);
      const parseStart = performance.now(),
        decoded = JSON.parse(json);
      observation.parseMs = performance.now() - parseStart;
      const mergeStart = performance.now();
      if (decoded.responseMode === "planning-delta-v1") {
        const data = mergePlanningDelta(state, decoded);
        assert(data, "delta must match the cached base");
        state = { data, generation: decoded.generation, user: decoded.user };
      } else state = decoded;
      observation.mergeMs = performance.now() - mergeStart;
      observations.push(observation);
    }
    assert.deepEqual(state, await store.view(user));
    assert.equal(state.generation, initialGeneration + samples);
    assert.equal((await store.auditLog(user)).total, initialAudit + samples);
    assert.equal(state.data.revisions[operation + ":" + key], 2 + samples);
    const finalMap =
      operation === "allocation" ? "allocations" : "actualAllocations";
    assert.equal(state.data[finalMap][key], amount((samples - 1) % 2));
    const finalModel = structuredClone(state);
    finalModel.generation = unchangedModel.generation;
    finalModel.data[finalMap][key] = unchangedModel.data[finalMap][key];
    finalModel.data.revisions[operation + ":" + key] =
      unchangedModel.data.revisions[operation + ":" + key];
    assert.deepEqual(
      finalModel,
      unchangedModel,
      "all untouched model fields must be preserved",
    );
    const medians = Object.fromEntries(
      [
        "pipelineMs",
        "mutateMs",
        "viewMs",
        "readMs",
        "persistMs",
        "validateSnapshotMs",
        "prepareMutationSettingsMs",
        "prepareMutationViewMs",
        "domainMs",
        "cloneMs",
        "snapshotCopyMs",
        "exportMs",
        "fileCommitMs",
        "jsonMs",
        "parseMs",
        "mergeMs",
      ].map((key) => [
        key,
        observations[0][key] === null
          ? null
          : round(
              percentile(
                observations.map((item) => item[key]),
                0.5,
              ),
            ),
      ]),
    );
    const result = {
      allocations: size,
      operation,
      responseMode,
      validationMode,
      snapshotCopy,
      commandMode,
      resources,
      actualAllocations: actuals,
      actualPercentEntries: percentages,
      calendarDays,
      initialAuditEvents: auditEvents,
      databaseBytes: (await fs.stat(file)).size,
      medians,
      p95PipelineMs: round(
        percentile(
          observations.map((item) => item.pipelineMs),
          0.95,
        ),
      ),
      snapshotSha256: createHash("sha256")
        .update(JSON.stringify(canonicalSnapshot(state)))
        .digest("hex"),
      observations,
    };
    results.push(result);
    console.log(
      JSON.stringify({
        allocations: size,
        operation,
        responseMode,
        validationMode,
        snapshotCopy,
        commandMode,
        resources,
        actualAllocations: actuals,
        actualPercentEntries: percentages,
        calendarDays,
        initialAuditEvents: auditEvents,
        medians,
        readCalls: observations[0].readCalls,
        cloneCalls: observations[0].cloneCalls,
        planningDraftCopies: observations[0].planningDraftCopies,
        generalDraftCopies: observations[0].generalDraftCopies,
        selectedRows: observations[0].selectedRows,
        materializedRows: observations[0].materializedRows,
        exportCalls: observations[0].exportCalls,
        exportBytes: observations[0].exportBytes,
        databaseBytes: result.databaseBytes,
        responseBytes: observations[0].responseBytes,
        sqlReads: Object.fromEntries(
          Object.keys(observations[0].sqlReads).map((name) => [
            name,
            {
              calls: observations[0].sqlReads[name].calls,
              rows: observations[0].sqlReads[name].rows,
              medianMs: round(
                percentile(
                  observations.map((item) => item.sqlReads[name].ms),
                  0.5,
                ),
              ),
            },
          ]),
        ),
        writtenRows: observations[0].writtenRows,
        changedRecords: observations[0].changedRecords,
        writeParameterBytes: observations[0].writeParameterBytes,
      }),
    );
  } finally {
    metrics?.restore();
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}
const report = {
  measuredAt: new Date().toISOString(),
  node: process.version,
  provider: "sqljs",
  samples,
  responseMode,
  validationMode,
  snapshotCopy,
  commandMode,
  domainTimingScope:
    "domainMs measures callback staging only, excludes Store final validation, and is null for owned planning commands to preserve their marker. Other stage medians overlap and must not be added.",
  mutationTimingScope:
    "validateSnapshotMs is final full validation; prepareMutationSettingsMs is settings JSON comparison/preparation; prepareMutationViewMs includes metadata comparison, delta/full projection and any transaction-local re-read. These are separate stages but readMs overlaps response re-reads; medians must not be added.",
  commandSha256: createHash("sha256")
    .update(
      await fs.readFile(new URL("./benchmark-command.mjs", import.meta.url)),
    )
    .digest("hex"),
  recordReaderSha256: createHash("sha256")
    .update(
      await fs.readFile(
        new URL("../backend/read-records.mjs", import.meta.url),
      ),
    )
    .digest("hex"),
  mutationSnapshotSha256: createHash("sha256")
    .update(
      await fs.readFile(
        new URL("../backend/mutation-snapshot.mjs", import.meta.url),
      ),
    )
    .digest("hex"),
  storeSha256: createHash("sha256")
    .update(await fs.readFile(new URL("../backend/store.mjs", import.meta.url)))
    .digest("hex"),
  repositorySha256: Object.fromEntries(
    await Promise.all(
      [
        "backend/identity-repository.mjs",
        "backend/planning-reader.mjs",
        "backend/planning-writer.mjs",
        "backend/schema-migrations.mjs",
        "backend/migration-catalog.mjs",
      ].map(async (name) => [
        name,
        createHash("sha256")
          .update(await fs.readFile(new URL("../" + name, import.meta.url)))
          .digest("hex"),
      ]),
    ),
  ),
  operationsSha256: createHash("sha256")
    .update(
      await fs.readFile(new URL("../backend/operations.mjs", import.meta.url)),
    )
    .digest("hex"),
  changeServiceSha256: createHash("sha256")
    .update(
      await fs.readFile(
        new URL("../backend/change-service.mjs", import.meta.url),
      ),
    )
    .digest("hex"),
  auditSha256: createHash("sha256")
    .update(await fs.readFile(new URL("../backend/audit.mjs", import.meta.url)))
    .digest("hex"),
  sqlJsAdapterSha256: createHash("sha256")
    .update(
      await fs.readFile(
        new URL("../backend/adapters/sqljs.mjs", import.meta.url),
      ),
    )
    .digest("hex"),
  schemaSha256: createHash("sha256")
    .update(
      await fs.readFile(new URL("../shared/server-domain.ts", import.meta.url)),
    )
    .digest("hex"),
  benchmarkSha256: createHash("sha256")
    .update(await fs.readFile(new URL(import.meta.url)))
    .digest("hex"),
  changeSetSha256: createHash("sha256")
    .update(
      await fs.readFile(new URL("../backend/change-set.mjs", import.meta.url)),
    )
    .digest("hex"),
  scope:
    "Local synthetic write + full/delta response pipeline with JSON encode/decode and immutable client merge; no HTTP/network or native MSSQL performance claim. All databases created and removed in os.tmpdir().",
  results,
};
if (options.has("output"))
  await fs.writeFile(
    path.resolve(options.get("output")),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
