import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { Store } from "../backend/store.mjs";
import { hashPassword, publicUser } from "../backend/auth.mjs";
import { seedBenchmarkStore } from "./benchmark-fixture.mjs";
import { actualView } from "../backend/actual-view.mjs";
import { activityReport } from "../backend/activity-report.mjs";
import { readActualReportData } from "../backend/actual-report-reader.mjs";
// No env files, database paths/providers or live accounts accepted.
const options = new Map(
  process.argv.slice(2).map((arg) => {
    const match = /^--(size|samples|output)=(.+)$/.exec(arg);
    if (!match)
      throw Error(
        "Use --size=10000 --samples=3 --output=/tmp/report-read.json",
      );
    return [match[1], match[2]];
  }),
);
const size = Number(options.get("size") || 10000),
  samples = Number(options.get("samples") || 3);
if (
  !Number.isInteger(size) ||
  size < 1000 ||
  size > 100000 ||
  !Number.isInteger(samples) ||
  samples < 1 ||
  samples > 10
)
  throw Error("size 1000–100000; samples 1–10 must be integers.");
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-report-benchmark-"));
const store = new Store({
  env: {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
  },
});
const date = "2026-10-13",
  query = { start: "2026-03", count: 3, projects: ["bench-p0"] };
const round = (n) => Math.round(n * 100) / 100;
try {
  await store.connect();
  await seedBenchmarkStore(store, size, {
    resources: 200,
    actuals: 4000,
    percentages: 4000,
    calendarDays: 200,
  });
  const d = (await store.read()).data,
    resource = d.resources[0];
  const user = {
    _id: "synthetic-benchmark",
    username: "synthetic.benchmark",
    name: "Synthetic",
    role: "normal",
    resourceId: resource.id,
    leaders: [],
    active: true,
    version: 1,
    revision: 1,
    password: await hashPassword("Synthetic-benchmark-only-284!"),
  };
  await store.bootstrapUser(user);
  const principal = publicUser(user),
    original = store.db.raw;
  let observation;
  store.db.raw = function (sql, values, consume) {
    const result = original.call(this, sql, values, consume);
    if (observation && /^SELECT\b/.test(sql)) {
      observation.sqlCalls++;
      observation.sqlRows += result.rowCount;
    }
    return result;
  };
  const results = [];
  for (const kind of ["actual", "activity"]) {
    const project = (data) =>
      kind === "actual"
        ? actualView(data, principal, query, date)
        : activityReport(data, principal, query, date.slice(0, 7));
    const read = (mode) =>
      store.transaction(
        async (c) =>
          project(
            mode === "full-reference"
              ? (await store.read(c)).data
              : await readActualReportData(
                  c,
                  "sqljs",
                  principal,
                  query,
                  kind,
                  date,
                ),
          ),
        true,
      );
    const expected = await read("full-reference");
    for (const mode of ["full-reference", "scoped"]) {
      await read(mode); // warmup, excluded
      const timings = [],
        rows = [],
        calls = [];
      for (let i = 0; i < samples; i++) {
        observation = { sqlRows: 0, sqlCalls: 0 };
        const start = performance.now();
        const result = await read(mode);
        timings.push(performance.now() - start);
        rows.push(observation.sqlRows);
        calls.push(observation.sqlCalls);
        observation = undefined;
        assert.deepEqual(result, expected); // correctness outside measured work
      }
      results.push({
        kind,
        mode,
        medianMs: round(timings.sort((a, b) => a - b)[Math.floor(samples / 2)]),
        returnedSqlRows: rows[0],
        sqlCalls: calls[0],
        samples,
      });
    }
  }
  const report = {
    date: "2026-10-13",
    node: process.version,
    provider: "temporary-synthetic-sqljs",
    size,
    resources: 200,
    actuals: 4000,
    months: 3,
    exactResultComparison: true,
    results,
  };
  if (options.has("output"))
    await fs.writeFile(
      options.get("output"),
      JSON.stringify(report, null, 2) + "\n",
      { flag: "wx" },
    );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await store.close();
  await fs.rm(dir, { recursive: true, force: true });
}
