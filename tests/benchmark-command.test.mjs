import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { benchmarkCommand } from "../scripts/benchmark-command.mjs";
import { isPlanningCommand } from "../backend/operations.mjs";

const execute = promisify(execFile);
const changes = [
  { kind: "allocation", id: "t|p|2026-01", revision: 0, value: 0.5 },
];

test("production benchmark retains the owned planning command, without a timing wrapper", () => {
  const { command, measuresDomain } = benchmarkCommand(changes, {
    observe() {
      throw Error("must not wrap owned command");
    },
  });
  assert(isPlanningCommand(command));
  assert.equal(measuresDomain, false);
  const data = { allocations: {}, revisions: {} };
  command(data, { role: "admin" });
  assert.equal(data.allocations[changes[0].id], 0.5);
  assert.equal(data.revisions["allocation:" + changes[0].id], 1);
});

test("callback and actual benchmarks keep the general mutation boundary and stage-only timing", () => {
  for (const [input, options] of [
    [changes, { mode: "callback" }],
    [[{ kind: "actual" }], {}],
  ]) {
    const { command, measuresDomain } = benchmarkCommand(input, options);
    assert.equal(isPlanningCommand(command), false);
    assert.equal(measuresDomain, true);
  }
  const observations = [],
    data = { allocations: {}, revisions: {} };
  benchmarkCommand(changes, {
    mode: "callback",
    observe: (ms) => observations.push(ms),
  }).command(data, { role: "admin" });
  assert.equal(observations.length, 1);
  assert(observations[0] >= 0);
  assert.equal(data.allocations[changes[0].id], 0.5);
});

test("benchmark refuses mislabeled production or incompatible validation modes", () => {
  for (const options of [
    { mode: "unknown" },
    { validation: "unknown" },
    { validation: "double" },
  ])
    assert.throws(() => benchmarkCommand(changes, options));
  assert.equal(
    isPlanningCommand(
      benchmarkCommand(changes, { mode: "callback", validation: "double" })
        .command,
    ),
    false,
  );
});

test("temporary SQL.js benchmarks prove draft selection and equal complete model digests for production and reference", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-benchmark-command-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const script = fileURLToPath(
    new URL("../scripts/benchmark-store.mjs", import.meta.url),
  );
  const env = Object.fromEntries(
    ["PATH", "SystemRoot", "WINDIR"]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  Object.assign(env, { TMPDIR: dir, TMP: dir, TEMP: dir });
  for (const operation of ["allocation", "actual"]) {
    const results = [];
    for (const mode of ["production", "callback"]) {
      const output = path.join(dir, `${operation}-${mode}.json`);
      await execute(
        process.execPath,
        [
          script,
          "--sizes=2",
          "--samples=2",
          "--resources=2",
          "--actuals=4",
          "--percentages=1",
          "--calendar-days=2",
          `--operation=${operation}`,
          `--response=${operation === "allocation" ? "delta" : "full"}`,
          ...(mode === "callback" ? ["--command=callback"] : []),
          `--output=${output}`,
        ],
        { cwd: dir, env, timeout: 30000, maxBuffer: 1024 * 1024 },
      );
      const report = JSON.parse(await fs.readFile(output, "utf8"));
      assert.equal(report.commandMode, mode);
      assert.match(report.commandSha256, /^[a-f0-9]{64}$/);
      const result = report.results[0];
      const planning = mode === "production" && operation === "allocation";
      assert.equal(result.commandMode, mode);
      assert.equal(result.observations.length, 2);
      for (const observation of result.observations) {
        assert.equal(observation.planningDraftCopies, planning ? 1 : 0);
        assert.equal(observation.generalDraftCopies, planning ? 0 : 1);
        assert.equal(observation.domainMs === null, planning);
        assert.equal(observation.changedRecords[operation], 1);
        assert.equal(observation.readCalls, 1);
        for (const method of [
          "validateSnapshot",
          "prepareMutationSettings",
          "prepareMutationView",
        ]) {
          assert.equal(observation[method + "Calls"], 1);
          assert(Number.isFinite(observation[method + "Ms"]));
          assert(observation[method + "Ms"] >= 0);
        }
      }
      assert.equal(result.medians.domainMs === null, planning);
      results.push(result);
    }
    assert.equal(results[0].snapshotSha256, results[1].snapshotSha256);
  }
  assert.deepEqual((await fs.readdir(dir)).sort(), [
    "actual-callback.json",
    "actual-production.json",
    "allocation-callback.json",
    "allocation-production.json",
  ]);
});

test("legacy double validation is labeled callback, while invalid production options create no database or output", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-benchmark-options-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const sentinel = path.join(dir, "untouched.sqlite");
  await fs.writeFile(sentinel, "synthetic sentinel, not a database");
  await fs.writeFile(
    path.join(dir, ".env"),
    `DB_PROVIDER=mssql\nSQLJS_FILE=${sentinel}\nNODE_ENV=production\n`,
  );
  const env = Object.fromEntries(
    ["PATH", "SystemRoot", "WINDIR"]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  Object.assign(env, {
    TMPDIR: dir,
    TMP: dir,
    TEMP: dir,
    DB_PROVIDER: "mssql",
    SQLJS_FILE: sentinel,
    NODE_ENV: "production",
  });
  const script = fileURLToPath(
    new URL("../scripts/benchmark-store.mjs", import.meta.url),
  );
  const output = path.join(dir, "report.json");
  const options = { cwd: dir, env, timeout: 30000, maxBuffer: 1024 * 1024 };
  await assert.rejects(
    execute(
      process.execPath,
      [
        script,
        "--command=production",
        "--validation=double",
        `--output=${output}`,
      ],
      options,
    ),
    (error) =>
      error.code === 1 &&
      /Double validation requires --command=callback/.test(error.stderr),
  );
  assert.deepEqual((await fs.readdir(dir)).sort(), [
    ".env",
    "untouched.sqlite",
  ]);
  await execute(
    process.execPath,
    [
      script,
      "--sizes=2",
      "--samples=1",
      "--resources=2",
      "--calendar-days=0",
      "--validation=double",
      `--output=${output}`,
    ],
    options,
  );
  const report = JSON.parse(await fs.readFile(output, "utf8"));
  assert.equal(report.commandMode, "callback");
  assert.equal(report.validationMode, "double");
  assert.equal(report.results[0].observations[0].generalDraftCopies, 1);
  const fullOutput = path.join(dir, "full-copy.json");
  await execute(
    process.execPath,
    [
      script,
      "--sizes=2",
      "--samples=1",
      "--resources=2",
      "--calendar-days=0",
      "--response=delta",
      "--snapshot-copy=full",
      `--output=${fullOutput}`,
    ],
    options,
  );
  const full = JSON.parse(await fs.readFile(fullOutput, "utf8"));
  assert.equal(full.commandMode, "production");
  assert.equal(full.results[0].observations[0].planningDraftCopies, 0);
  assert.equal(full.results[0].observations[0].generalDraftCopies, 1);
  assert.equal(full.results[0].medians.domainMs, null);
  assert.equal(
    await fs.readFile(sentinel, "utf8"),
    "synthetic sentinel, not a database",
  );
  assert.deepEqual((await fs.readdir(dir)).sort(), [
    ".env",
    "full-copy.json",
    "report.json",
    "untouched.sqlite",
  ]);
});
