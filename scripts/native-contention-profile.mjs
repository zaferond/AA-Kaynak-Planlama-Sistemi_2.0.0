import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { hashPassword } from "../backend/auth.mjs";
import { changeAndView } from "../backend/change-service.mjs";
import { mergePlanningDelta } from "../shared/planning-response.ts";
import { seedBenchmarkStore } from "./benchmark-fixture.mjs";
import {
  transactionProbe,
  profileWorkers,
  memorySampler,
  latencySummary,
  assertNativeProfileStores,
} from "./transaction-profile.mjs";

export function nativeProfileOptions({
  requests = "40",
  actuals = "4000",
  concurrency = "1,4,12",
} = {}) {
  function number(value, min, max) {
    if (!/^\d+$/.test(String(value)))
      throw Error("Invalid synthetic profile limits.");
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < min || n > max)
      throw Error("Invalid synthetic profile limits.");
    return n;
  }
  const count = number(requests, 20, 200),
    actualCount = number(actuals, 200, 50000);
  if (typeof concurrency !== "string")
    throw Error("Invalid profile concurrency.");
  const levels = concurrency.split(",").map((n) => number(n.trim(), 1, 20));
  if (
    !levels.length ||
    levels.length > 4 ||
    new Set(levels).size !== levels.length ||
    levels.some((n) => n > count)
  )
    throw Error("Invalid profile concurrency.");
  return { requests: count, actuals: actualCount, concurrency: levels };
}

const mapFor = (kind) =>
  kind === "allocation" ? "allocations" : "actualAllocations";
const rounded = (value) => Math.round(value * 1000) / 1000;
function summarizeGroups(observations) {
  return Object.fromEntries(
    [...new Set(observations.map((o) => o.kind))].map((kind) => {
      const rows = observations.filter((o) => o.kind === kind);
      const metrics = [
        "elapsedMs",
        "queueMs",
        "transactionEntryMs",
        "transactionTailMs",
        "lockAcquireServerMs",
        "lockAcquireRoundtripMs",
        "readMs",
        "snapshotMetadataMs",
        "snapshotNumericMs",
        "snapshotOtherSqlMs",
        "snapshotSqlCalls",
        "snapshotBufferedRows",
        "snapshotStreamedRows",
        "copySnapshotMs",
        "commandAndValidationAndDiffPrepMs",
        "planningDeltaProjectionMs",
        "planningDeltaProjectionCalls",
        "planningDraftCopies",
        "fullSnapshotCopies",
        "persistMs",
        "projectViewMs",
        "sqlMs",
        "sqlCalls",
        "scanCalls",
        "numericBatchCalls",
        "numericBatchStatements",
        "metadataBatchCalls",
        "metadataBatchStatements",
        "readCalls",
        "copySnapshotCalls",
        "persistCalls",
        "projectViewCalls",
        "lockCalls",
        "jsonEncodeMs",
        "jsonBytes",
      ];
      return [
        kind,
        {
          observations: rows.length,
          metrics: Object.fromEntries(
            metrics.map((key) => [
              key,
              latencySummary(rows.map((r) => r[key])),
            ]),
          ),
          sqlRowsPerRequest: Object.fromEntries(
            [...new Set(rows.flatMap((r) => Object.keys(r.sqlRows)))].map(
              (table) => [
                table,
                latencySummary(rows.map((r) => r.sqlRows[table] || 0)),
              ],
            ),
          ),
        },
      ];
    }),
  );
}

// Called only inside withMssqlTestDatabase, after verified-empty lease acquisition
// and the native assertions. No .env, connection URL or existing database input.
export async function nativeContentionProfile(
  stores,
  { size, requests, actuals, concurrency },
) {
  assertNativeProfileStores(stores);
  assert(stores.length === 2 && size >= requests && actuals >= requests);
  await seedBenchmarkStore(stores[0], size, {
    resources: 80,
    actuals,
    percentages: actuals,
    calendarDays: 20,
  });
  const team = (await stores[0].read()).data.teams.find((t) => t.lead);
  const password = await hashPassword("Native-contention-synthetic-only-284!");
  const users = {};
  for (const role of ["admin", "manager", "normal"]) {
    const id = "native-contention-" + role;
    await stores[0].bootstrapUser({
      _id: id,
      username: "synthetic." + role,
      name: "Synthetic " + role,
      role,
      leaders: role === "admin" ? [] : [team.lead],
      resourceId: role === "normal" ? "bench-r0" : "",
      active: true,
      password,
      revision: 1,
      version: 1,
    });
    users[role] = await stores[0].findUser({ id });
    // Independent full-read reference before measurements, including role scope.
    const reference = await stores[0].transaction(async (c) => {
      const snapshot = await stores[0].read(c);
      return stores[0].projectView(
        snapshot.data,
        snapshot.generation,
        users[role],
        c,
      );
    }, true);
    assert.deepEqual(await stores[1].view(users[role]), reference);
  }
  const scenarios = [
    "read-admin",
    "read-normal",
    "write-allocation",
    "write-actual",
    "mixed",
  ];
  const cases = [];
  for (const level of concurrency)
    for (const scenario of scenarios) {
      // Warm up the actual Store/command/projection paths without profiling. Use
      // a same-value write; revisions/generation are then captured in the base.
      const warm = await stores[0].view(users.admin);
      const warmId = Object.keys(warm.data.allocations)[0];
      await changeAndView(stores[0], users.admin, [
        {
          kind: "allocation",
          id: warmId,
          value: warm.data.allocations[warmId],
          revision: warm.data.revisions["allocation:" + warmId],
        },
      ]);
      await stores[1].view(users.normal);
      const before = await stores[0].view(users.admin);
      const auditBefore = (await stores[0].auditLog(users.admin)).total;
      const planningKeys = Object.keys(before.data.allocations).slice(
        0,
        requests,
      );
      const actualKeys = Object.keys(before.data.actualAllocations).slice(
        0,
        requests,
      );
      assert(
        planningKeys.length === requests && actualKeys.length === requests,
      );
      const kinds = Array.from({ length: requests }, (_, i) =>
        scenario === "mixed" ? scenarios[i % 4] : scenario,
      );
      const edits = kinds.flatMap((kind, i) => {
        if (!kind.startsWith("write-")) return [];
        const entity = kind === "write-allocation" ? "allocation" : "actual";
        const id = (entity === "allocation" ? planningKeys : actualKeys)[i];
        const previous = before.data[mapFor(entity)][id];
        const a = entity === "allocation" ? 0.25 : 0.0025,
          b = entity === "allocation" ? 0.5 : 0.005;
        return [
          {
            index: i,
            kind: entity,
            id,
            value: previous === a ? b : a,
            revision: before.data.revisions[entity + ":" + id],
          },
        ];
      });
      const byIndex = new Map(edits.map((e) => [e.index, e]));
      function consistentSnapshot(view) {
        if (view.user.role !== "admin") {
          assert.equal(view.user.id, users.normal._id);
          for (const key of Object.keys(view.data.actualAllocations))
            assert.equal(key.split("|")[0], "bench-r0");
          return;
        }
        const committed = edits.filter(
          (e) => view.data[mapFor(e.kind)][e.id] === e.value,
        ).length;
        assert.equal(
          committed,
          view.generation - before.generation,
          "Snapshot must contain exactly its committed writes",
        );
      }
      const memory = memorySampler();
      let observations, memoryResult, probe;
      const started = performance.now();
      try {
        probe = transactionProbe(stores, { captureMemory: memory.capture });
        observations = await profileWorkers(
          requests,
          level,
          async (index, queueMs) => {
            const kind = kinds[index],
              store = stores[index % stores.length];
            const { value: response, observation } = await probe.measure(
              kind,
              () => {
                const edit = byIndex.get(index);
                return edit
                  ? changeAndView(
                      store,
                      users.admin,
                      [
                        {
                          kind: edit.kind,
                          id: edit.id,
                          value: edit.value,
                          revision: edit.revision,
                        },
                      ],
                      edit.kind === "allocation"
                        ? {
                            responseMode: "planning-delta-v1",
                            baseGeneration: before.generation,
                          }
                        : {},
                    )
                  : store.view(
                      users[kind === "read-admin" ? "admin" : "normal"],
                    );
              },
            );
            const encodeStart = performance.now();
            const jsonBytes = Buffer.byteLength(JSON.stringify(response));
            const jsonEncodeMs = performance.now() - encodeStart;
            memory.capture();
            const view =
              response.responseMode === "planning-delta-v1"
                ? {
                    ...before,
                    generation: response.generation,
                    data: mergePlanningDelta(before, response),
                  }
                : response;
            assert(view.data);
            consistentSnapshot(view);
            const edit = byIndex.get(index);
            if (edit) {
              assert.equal(view.data[mapFor(edit.kind)][edit.id], edit.value);
              assert.equal(
                view.data.revisions[edit.kind + ":" + edit.id],
                edit.revision + 1,
              );
            }
            assert.equal(observation.lockCalls, 1);
            assert.equal(observation.metadataBatchCalls, edit ? 1 : 0);
            assert.equal(observation.metadataBatchStatements, edit ? 10 : 0);
            assert.equal(observation.scanCalls, edit ? 0 : 5);
            assert.equal(observation.numericBatchCalls, edit ? 1 : 0);
            assert.equal(observation.numericBatchStatements, edit ? 5 : 0);
            assert.equal(observation.snapshotSqlCalls, edit ? 2 : 15);
            assert.equal(observation.snapshotOtherSqlMs, 0);
            assert(observation.snapshotBufferedRows > 0);
            assert(observation.snapshotStreamedRows > 0);
            return {
              ...observation,
              queueMs,
              jsonEncodeMs,
              jsonBytes,
              responseMode: response.responseMode || "full",
              generation: response.generation,
            };
          },
        );
      } finally {
        try {
          probe?.restore();
        } finally {
          memoryResult = memory.stop();
        }
      }
      const elapsedMs = performance.now() - started;
      const after = await stores[1].view(users.admin);
      assert.equal(after.generation, before.generation + edits.length);
      assert.equal(
        (await stores[1].auditLog(users.admin)).total,
        auditBefore + edits.length,
      );
      for (const edit of edits) {
        assert.equal(after.data[mapFor(edit.kind)][edit.id], edit.value);
        assert.equal(
          after.data.revisions[edit.kind + ":" + edit.id],
          edit.revision + 1,
        );
      }
      const generations = observations
        .filter((o) => o.kind.startsWith("write-"))
        .map((o) => o.generation)
        .sort((a, b) => a - b);
      assert.deepEqual(
        generations,
        edits.map((_, i) => before.generation + i + 1),
      );
      const groups = summarizeGroups(observations);
      cases.push({
        scenario,
        concurrency: level,
        requests,
        writes: edits.length,
        elapsedMs: rounded(elapsedMs),
        throughputPerSecond: rounded((requests * 1000) / elapsedMs),
        responseModes: Object.fromEntries(
          [...new Set(observations.map((o) => o.responseMode))].map((mode) => [
            mode,
            observations.filter((o) => o.responseMode === mode).length,
          ]),
        ),
        memoryBytes: memoryResult,
        groups,
      });
    }
  // A sequential client advances its cached generation after every returned
  // patch. The stale-base contention cases above deliberately retain a fixed
  // base; this additional case checks the normal delta chain on an independent
  // SQL pool after all edits, without keeping completed full responses.
  const initial = await stores[0].view(users.admin);
  let cached = initial;
  const ids = Object.keys(initial.data.allocations).slice(0, requests);
  const auditBefore = (await stores[0].auditLog(users.admin)).total;
  const memory = memorySampler();
  let observations, memoryResult, probe;
  const started = performance.now();
  try {
    probe = transactionProbe(stores, { captureMemory: memory.capture });
    observations = await profileWorkers(requests, 1, async (index, queueMs) => {
      const id = ids[index],
        revision = cached.data.revisions["allocation:" + id];
      const value = cached.data.allocations[id] === 0.25 ? 0.5 : 0.25;
      const { value: response, observation } = await probe.measure(
        "write-allocation",
        () =>
          changeAndView(
            stores[index % stores.length],
            users.admin,
            [{ kind: "allocation", id, value, revision }],
            {
              responseMode: "planning-delta-v1",
              baseGeneration: cached.generation,
            },
          ),
      );
      const encodeStart = performance.now();
      const jsonBytes = Buffer.byteLength(JSON.stringify(response));
      const jsonEncodeMs = performance.now() - encodeStart;
      assert.equal(response.responseMode, "planning-delta-v1");
      assert.equal(response.generation, initial.generation + index + 1);
      assert.equal(observation.lockCalls, 1);
      assert.equal(observation.metadataBatchCalls, 1);
      assert.equal(observation.metadataBatchStatements, 10);
      assert.equal(observation.scanCalls, 0);
      assert.equal(observation.numericBatchCalls, 1);
      assert.equal(observation.numericBatchStatements, 5);
      assert.equal(observation.snapshotSqlCalls, 2);
      assert.equal(observation.snapshotOtherSqlMs, 0);
      assert(observation.snapshotBufferedRows > 0);
      assert(observation.snapshotStreamedRows > 0);
      assert.equal(observation.planningDraftCopies, 1);
      assert.equal(observation.fullSnapshotCopies, 0);
      assert.equal(observation.projectViewCalls, 0);
      assert.equal(observation.planningDeltaProjectionCalls, 1);
      // The active-principal lookup remains; the admin user-list projection is skipped.
      assert.equal(observation.sqlRows.users, 1);
      cached = {
        ...cached,
        generation: response.generation,
        data: mergePlanningDelta(cached, response),
      };
      assert.equal(cached.data.allocations[id], value);
      assert.equal(cached.data.revisions["allocation:" + id], revision + 1);
      return {
        ...observation,
        queueMs,
        jsonBytes,
        jsonEncodeMs,
        responseMode: response.responseMode,
        generation: response.generation,
      };
    });
  } finally {
    try {
      probe?.restore();
    } finally {
      memoryResult = memory.stop();
    }
  }
  const elapsedMs = performance.now() - started;
  assert.deepEqual(cached, await stores[1].view(users.admin));
  assert.equal(
    (await stores[1].auditLog(users.admin)).total,
    auditBefore + requests,
  );
  cases.push({
    scenario: "planning-delta-chain",
    concurrency: 1,
    requests,
    writes: requests,
    elapsedMs: rounded(elapsedMs),
    throughputPerSecond: rounded((requests * 1000) / elapsedMs),
    responseModes: { "planning-delta-v1": requests },
    memoryBytes: memoryResult,
    groups: summarizeGroups(observations),
  });
  return {
    plannedRecords: size,
    actualRecords: actuals,
    percentRecordsAtSeed: actuals,
    pools: stores.length,
    requestsPerCase: requests,
    concurrency,
    cases,
    scope:
      "Synthetic native Store/changeAndView pipeline. No HTTP/browser/WAN, SQL execution plans/IO, production load or service capacity claim. Uses unchanged production lock and validation rules. Profile instrumentation adds timing SELECT and memory sampling overhead. Metadata batch metrics count one SQL roundtrip and each SELECT rowset; full snapshot rows and validation remain.",
    metricNotes: {
      percentiles:
        "Nearest-rank sample quantiles, not production p95/p99 estimates. Count is explicit; mixed groups have fewer observations.",
      queueMs:
        "Time before the bounded benchmark worker starts; not application admission queue latency.",
      transactionEntryMs:
        "Client time from transaction call to callback; includes pool/begin, application-lock acquisition and round trips.",
      lockAcquireServerMs:
        "SQL server clock around sp_getapplock, including procedure execution cost. Not pure DMV lock wait or client/pool time.",
      elapsedMs:
        "Store operation until returned view/delta. JSON encode measured separately; assertions are excluded.",
      stages:
        "Read/persist/project durations include their SQL calls and overlap sqlMs; do not sum all metrics. Snapshot metadata/numeric/other SQL timings include only successful adapter requests within Store.read, including driver decoding, stream consumers and network waits; they do not isolate SQL Server time or CPU. Snapshot row counters distinguish buffered versus streamed rows, not allocated bytes or physical IO. Auth/preflight/audit/user projection are excluded from snapshot counters. CommandAndValidationAndDiffPrep covers the copy-to-persist gap, including command execution, schema validation and preparation; it does not isolate schema validation. Owned planning callbacks keep their identity during profiling.",
      memoryBytes:
        "Whole Node process samples during each case and stage boundaries. Includes retained fixture/base, instrumentation and response data; no per-request allocation or guaranteed CPU-bound peak.",
    },
  };
}
