import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  mssqlTestEnvironment,
  validateTestDatabase,
  validateCleanupObjects,
  withMssqlTestDatabase,
} from "../scripts/mssql-test-environment.mjs";
import { checkedNativeContext } from "./mssql-native-suite.mjs";

const input = () => ({
  TEST_DB_SERVER: "test.invalid",
  TEST_DB_DATABASE: "AA_native_test",
  TEST_DB_USER: "synthetic",
  TEST_DB_PASSWORD: "Synthetic-not-a-real-password",
});
const info = () => ({
  database_name: "AA_native_test",
  default_schema: "dbo",
  compatibility_level: 160,
  can_inspect: 1,
  can_create: 1,
  can_alter: 1,
  can_select: 1,
  can_insert: 1,
  can_update: 1,
  can_delete: 1,
  product_version: "synthetic",
  edition: "synthetic",
});

function fakeInspection({
  occupied = [],
  metadata = info(),
  busy = false,
} = {}) {
  let objects = [...occupied];
  const events = [],
    drops = [];
  const lease = {
    begin: async () => events.push("begin"),
    rollback: async () => events.push("release"),
  };
  const adapter = {
    pool: {},
    open: async () => events.push("open"),
    close: async () => events.push("close"),
    async request(_owner, text) {
      if (text.includes("aa_kaynak_native_test")) {
        events.push("lease");
        if (busy) throw Error("Test lease busy");
        return { rows: [] };
      }
      if (text.includes("DB_NAME()")) return { rows: [metadata] };
      return { rows: [...objects] };
    },
    async transaction(fn) {
      events.push("cleanup");
      return fn({
        query: async (text) => {
          if (text.includes("DROP TABLE")) {
            const name = text.match(/DROP TABLE \[dbo\]\.\[(\w+)\]/)[1];
            drops.push(name);
            objects = objects.filter((row) => row.name !== name);
            return { rows: [] };
          }
          return { rows: [...objects] };
        },
      });
    },
  };
  return {
    adapter,
    leaseFactory: () => lease,
    events,
    drops,
    add: (row) => objects.push(row),
  };
}

test("native test configuration never falls back to application DB credentials", () => {
  assert.throws(
    () =>
      mssqlTestEnvironment({
        DB_SERVER: "production.invalid",
        DB_DATABASE: "production",
        DB_USER: "app",
        DB_PASSWORD: "do-not-use",
      }),
    /TEST_DB_SERVER/,
  );
  const env = mssqlTestEnvironment({
    ...input(),
    DB_SERVER: "production.invalid",
    DB_PASSWORD: "do-not-use",
    NODE_ENV: "production",
    SQLJS_FILE: "/real.sqlite",
    ADMIN_PASSWORD: "do-not-copy",
  });
  assert.equal(env.DB_SERVER, "test.invalid");
  assert.equal(env.NODE_ENV, "test");
  assert.equal(env.DB_AUTO_MIGRATE, "true");
  assert.equal(env.DB_PROVIDER, "mssql");
  assert.equal(env.SQLJS_FILE, undefined);
  assert.equal(env.ADMIN_PASSWORD, undefined);
  for (const key of ["SERVER", "DATABASE", "USER", "PASSWORD"])
    assert.throws(
      () => mssqlTestEnvironment({ ...input(), ["TEST_DB_" + key]: "" }),
      new RegExp("TEST_DB_" + key),
    );
});

test("native test configuration rejects unsafe names and ambiguous TLS/port/NTLM settings", () => {
  for (const name of [
    "master",
    "application",
    "a_test;DROP",
    "[a_test]",
    "a test",
    "a".repeat(129) + "_test",
  ])
    assert.throws(
      () => mssqlTestEnvironment({ ...input(), TEST_DB_DATABASE: name }),
      /TEST_DB_DATABASE/,
    );
  for (const key of ["ENCRYPT", "TRUST_SERVER_CERTIFICATE"])
    for (const value of ["TRUE", "1", "yes"])
      assert.throws(
        () => mssqlTestEnvironment({ ...input(), ["TEST_DB_" + key]: value }),
        /true veya false/,
      );
  assert.throws(
    () => mssqlTestEnvironment({ ...input(), TEST_DB_PORT: "invalid" }),
    /DB_PORT/,
  );
  assert.throws(
    () => mssqlTestEnvironment({ ...input(), TEST_DB_AUTH: "ntlm" }),
    /TEST_DB_DOMAIN/,
  );
  const named = mssqlTestEnvironment({
    ...input(),
    TEST_DB_AUTH: "ntlm",
    TEST_DB_DOMAIN: "TEST",
    TEST_DB_INSTANCE: "TEST_INSTANCE",
  });
  assert.equal(named.DB_DOMAIN, "TEST");
  assert.equal(named.DB_INSTANCE, "TEST_INSTANCE");
});

test("native preflight refuses wrong DB, hidden objects, old compatibility and non-dbo schema", () => {
  validateTestDatabase(info(), [], "AA_native_test");
  for (const patch of [
    { database_name: "production" },
    { default_schema: "custom" },
    { compatibility_level: 120 },
    { compatibility_level: undefined },
    { can_inspect: 0 },
    { can_create: 0 },
    { can_alter: null },
    { can_select: 0 },
    { can_insert: 0 },
    { can_update: 0 },
    { can_delete: 0 },
  ])
    assert.throws(() =>
      validateTestDatabase({ ...info(), ...patch }, [], "AA_native_test"),
    );
  for (const row of [
    { schema_name: "dbo", name: "kp_projects" },
    { schema_name: "dbo", name: "unrelated" },
    { schema_name: "other", name: "kp_projects" },
  ])
    assert.throws(
      () => validateTestDatabase(info(), [row], "AA_native_test"),
      /boş değil/,
    );
  assert.throws(() => validateTestDatabase(undefined, [], "AA_native_test"));
});

test("native cleanup allows only fixed application tables in dbo", () => {
  validateCleanupObjects([
    { schema_name: "dbo", name: "kp_projects" },
    { schema_name: "dbo", name: "kp_schema_migrations" },
  ]);
  for (const row of [
    { schema_name: "other", name: "kp_projects" },
    { schema_name: "dbo", name: "not_ours" },
    { schema_name: "dbo", name: "kp_projects]; DROP TABLE x;--" },
  ])
    assert.throws(() => validateCleanupObjects([row]), /beklenmeyen/);
});

test("an occupied native DB is rejected without callback or cleanup", async () => {
  const inspection = fakeInspection({
    occupied: [{ schema_name: "dbo", name: "unrelated" }],
  });
  let ran = false;
  await assert.rejects(
    withMssqlTestDatabase(
      mssqlTestEnvironment(input()),
      () => {
        ran = true;
      },
      inspection,
    ),
    /boş değil/,
  );
  assert.equal(ran, false);
  assert.equal(inspection.events.includes("cleanup"), false);
  assert.deepEqual(inspection.drops, []);
  assert.deepEqual(inspection.events.slice(-2), ["release", "close"]);
});

test("a second test lease or insufficient metadata permission stops before table mutation", async () => {
  for (const options of [
    { busy: true },
    { metadata: { ...info(), can_inspect: 0 } },
  ]) {
    const inspection = fakeInspection(options);
    await assert.rejects(
      withMssqlTestDatabase(
        mssqlTestEnvironment(input()),
        () => assert.fail("must not run"),
        inspection,
      ),
    );
    assert.equal(inspection.events.includes("cleanup"), false);
    assert.deepEqual(inspection.drops, []);
    assert.equal(inspection.events.at(-1), "close");
  }
});

test("owned native test tables are cleaned before lease release on success and test failure", async () => {
  for (const fail of [false, true]) {
    const inspection = fakeInspection();
    const promise = withMssqlTestDatabase(
      mssqlTestEnvironment(input()),
      async () => {
        inspection.add({ schema_name: "dbo", name: "kp_allocations" });
        inspection.add({ schema_name: "dbo", name: "kp_schema_migrations" });
        if (fail) throw Error("Synthetic test failure");
        return "complete";
      },
      inspection,
    );
    if (fail) await assert.rejects(promise, /Synthetic test failure/);
    else assert.equal(await promise, "complete");
    assert(inspection.drops.includes("kp_allocations"));
    assert.equal(inspection.drops.at(-1), "kp_schema_migrations");
    assert.deepEqual(inspection.events.slice(-3), [
      "cleanup",
      "release",
      "close",
    ]);
  }
});

test("an unexpected object during native tests prevents all cleanup DDL and reports both failures", async () => {
  const inspection = fakeInspection();
  await assert.rejects(
    withMssqlTestDatabase(
      mssqlTestEnvironment(input()),
      async () => {
        inspection.add({ schema_name: "dbo", name: "not_ours" });
        throw Error("Synthetic suite failure");
      },
      inspection,
    ),
    (error) => {
      assert(error instanceof AggregateError);
      assert.match(error.errors[0].message, /suite failure/);
      assert.match(error.errors[1].message, /beklenmeyen/);
      return true;
    },
  );
  assert.deepEqual(inspection.drops, []);
  assert.equal(inspection.events.at(-1), "close");
});

test("failed native subtests propagate instead of allowing a success report", async () => {
  const sentinel = Error("Synthetic assertion failure");
  const context = checkedNativeContext({
    diagnostic() {},
    async test(_name, fn) {
      try {
        await fn({});
      } catch {}
    },
  });
  await assert.rejects(
    context.test("failure", () => {
      throw sentinel;
    }),
    (e) => e === sentinel,
  );
  let succeeded = false;
  await context.test("success", () => {
    succeeded = true;
  });
  assert.equal(succeeded, true);
});

test("native lease release failure cannot be reported as success", async () => {
  const inspection = fakeInspection();
  inspection.leaseFactory = () => ({
    begin: async () => {},
    rollback: async () => {
      throw Error("Synthetic lease release failure");
    },
  });
  await assert.rejects(
    withMssqlTestDatabase(
      mssqlTestEnvironment(input()),
      () => "complete",
      inspection,
    ),
    /lease release failure/,
  );
  assert.equal(inspection.events.at(-1), "close");
});

test("native CLI refuses application .env fallback and validates profile before connecting", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-native-config-"));
  try {
    await fs.writeFile(
      path.join(dir, ".env"),
      "DB_SERVER=production.invalid\nDB_PASSWORD=do-not-use\n",
    );
    const env = { ...process.env };
    for (const key of Object.keys(env))
      if (key.startsWith("TEST_DB_") || key.startsWith("DB_")) delete env[key];
    env.DB_PASSWORD = "do-not-use";
    const runner = fileURLToPath(
      new URL("../scripts/run-mssql-tests.mjs", import.meta.url),
    );
    const missing = spawnSync(process.execPath, [runner], {
      cwd: dir,
      env,
      encoding: "utf8",
    });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /TEST_DB_SERVER/);
    assert(!missing.stderr.includes("do-not-use"));
    const file = path.join(dir, ".env.mssql.test");
    await fs.writeFile(
      file,
      Object.entries(input())
        .map(([k, v]) => `${k}='${v}'`)
        .join("\n"),
    );
    const invalid = spawnSync(
      process.execPath,
      [runner, "--env-file", file, "--size", "1"],
      { cwd: dir, env, encoding: "utf8" },
    );
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /size/);
    assert(!invalid.stderr.includes(input().TEST_DB_PASSWORD));
    assert.equal(invalid.stdout, "");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
