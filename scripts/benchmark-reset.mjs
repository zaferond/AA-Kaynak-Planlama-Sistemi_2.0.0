import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { Store } from "../backend/store.mjs";
import { reset } from "../backend/operations.mjs";
import { seedBenchmarkStore } from "./benchmark-fixture.mjs";
import { hashPassword } from "../backend/auth.mjs";

// Synthetic reset only. No .env or existing DB/provider option is accepted.
const options = new Map(
  process.argv.slice(2).map((arg) => {
    const m = /^--(mode|size|samples|output)=(.+)$/.exec(arg);
    if (!m)
      throw Error(
        "Use --mode=separate|committed --size=10000 --samples=5 --output=/tmp/result.json",
      );
    return [m[1], m[2]];
  }),
);
const mode = options.get("mode") || "committed";
if (!["separate", "committed"].includes(mode)) throw Error("Invalid mode");
function integer(key, fallback, min, max) {
  const n = Number(options.get(key) ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max) throw Error("Invalid " + key);
  return n;
}
const size = integer("size", 10000, 1, 100000),
  samples = integer("samples", 5, 1, 20);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical(value[k])]),
        )
      : value;
const median = (xs) =>
  [...xs].sort((a, b) => a - b)[Math.ceil(xs.length / 2) - 1];
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-reset-benchmark-"));
const env = (file) => ({
  NODE_ENV: "test",
  DB_PROVIDER: "sqljs",
  SQLJS_FILE: file,
});
let store = new Store({ env: env(path.join(dir, "seed.sqlite")) });
const observations = [];
try {
  await store.connect();
  await store.bootstrapUser({
    _id: "bench-admin",
    username: "bench.admin",
    name: "Synthetic Admin",
    role: "admin",
    leaders: [],
    active: true,
    password: await hashPassword("Synthetic-reset-only-284!"),
    revision: 1,
    version: 1,
  });
  await seedBenchmarkStore(store, size, {
    resources: 80,
    actuals: 1000,
    percentages: 1000,
    calendarDays: 20,
  });
  const seed = await fs.readFile(store.db.file);
  await store.close();
  // Every sample starts from the same database bytes. No accumulating audit
  // history or repeated refill cost is hidden inside the measured reset.
  for (let i = -1; i < samples; i++) {
    const file = path.join(dir, "sample-" + i + ".sqlite");
    await fs.writeFile(file, seed);
    store = new Store({ env: env(file) });
    await store.connect();
    const user = await store.findUser({ id: "bench-admin" }),
      before = await store.read(),
      auditBefore = (await store.auditLog(user)).total;
    const revisions = Object.fromEntries(
      Object.entries(before.data.revisions).filter(([k]) =>
        k.startsWith("allocation:"),
      ),
    );
    const metrics = {
      readCalls: 0,
      readMs: 0,
      transactionCalls: 0,
      selectedRows: 0,
      sqlReads: {},
    };
    let current = metrics;
    const read = store.read,
      transaction = store.transaction,
      raw = store.db.raw;
    store.read = async function (...args) {
      const start = performance.now();
      try {
        return await read.apply(this, args);
      } finally {
        if (current) {
          current.readCalls++;
          current.readMs += performance.now() - start;
        }
      }
    };
    store.transaction = async function (...args) {
      if (current) current.transactionCalls++;
      return transaction.apply(this, args);
    };
    store.db.raw = function (sql, values, consume) {
      const result = raw.call(this, sql, values, consume);
      if (current && /^SELECT\b/i.test(sql)) {
        const name = /\bFROM\s+\[?(kp_[a-z_]+)\]?/i.exec(sql)?.[1] || "other";
        current.sqlReads[name] =
          (current.sqlReads[name] || 0) + result.rowCount;
        current.selectedRows += result.rowCount;
      }
      return result;
    };
    const start = performance.now();
    const committed = await store.mutate(
      user,
      (d, u) => reset(d, u, revisions),
      { returnView: mode === "committed" },
    );
    const response = mode === "committed" ? committed : await store.view(user);
    metrics.pipelineMs = performance.now() - start;
    current = undefined;
    assert.deepEqual(response, await store.view(user));
    assert.equal(response.generation, before.generation + 1);
    assert.deepEqual(response.data.allocations, {});
    assert.deepEqual(
      response.data.actualAllocations,
      before.data.actualAllocations,
    );
    for (const key of Object.keys(before.data.allocations))
      assert.equal(
        response.data.revisions["allocation:" + key],
        before.data.revisions["allocation:" + key] + 1,
      );
    assert.equal((await store.auditLog(user)).total, auditBefore + size);
    metrics.responseBytes = Buffer.byteLength(JSON.stringify(response));
    metrics.snapshotSha256 = digest(JSON.stringify(canonical(response)));
    if (i >= 0) observations.push(metrics);
    await store.close();
  }
} finally {
  await store.close();
  await fs.rm(dir, { recursive: true, force: true });
}
const report = {
  measuredAt: new Date().toISOString(),
  node: process.version,
  provider: "sqljs",
  mode,
  size,
  samples,
  scope:
    "Synthetic reset + snapshot preparation + disk commit. No HTTP/browser/native MSSQL/memory/concurrency claim.",
  medians: Object.fromEntries(
    [
      "readCalls",
      "readMs",
      "transactionCalls",
      "selectedRows",
      "pipelineMs",
      "responseBytes",
    ].map((k) => [
      k,
      Math.round(median(observations.map((r) => r[k])) * 100) / 100,
    ]),
  ),
  sqlReads: observations[0].sqlReads,
  snapshotSha256: observations[0].snapshotSha256,
  observations,
  sourceSha256: Object.fromEntries(
    await Promise.all(
      [
        "backend/store.mjs",
        "backend/identity-repository.mjs",
        "backend/planning-reader.mjs",
        "backend/planning-writer.mjs",
        "backend/schema-migrations.mjs",
        "backend/migration-catalog.mjs",
        "backend/operations.mjs",
        "backend/read-records.mjs",
        "shared/server-domain.ts",
        "scripts/benchmark-reset.mjs",
        "scripts/benchmark-fixture.mjs",
      ].map(async (name) => [
        name,
        digest(await fs.readFile(new URL("../" + name, import.meta.url))),
      ]),
    ),
  ),
};
assert(observations.every((r) => r.snapshotSha256 === report.snapshotSha256));
console.log(JSON.stringify(report));
if (options.has("output"))
  await fs.writeFile(
    path.resolve(options.get("output")),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
