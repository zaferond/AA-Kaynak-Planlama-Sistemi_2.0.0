import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Store } from "../backend/store.mjs";
import { MssqlAdapter } from "../backend/adapters/mssql.mjs";
import {
  ATTEMPT_WINDOW_MS,
  clientAddressKey,
  MemoryAttemptStore,
  DatabaseAttemptStore,
  AttemptLimiter,
  createAttemptLimiter,
} from "../backend/rate-limits.mjs";
import { application } from "./login-test-fixture.mjs";
import { sharedRateLimitSuite } from "./rate-limit-suite.mjs";

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-rate-test-"));
  const env = {
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "fixture.sqlite"),
  };
  let store = new Store({ env });
  await store.connect();
  t.after(async () => {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  return {
    get store() {
      return store;
    },
    async reopen() {
      await store.close();
      store = new Store({ env });
      await store.connect();
    },
  };
}

test("IP keys normalize mapped IPv4, IPv6 spellings and privacy addresses; invalid forwarding is rejected", () => {
  assert.equal(
    clientAddressKey("::ffff:192.0.2.10"),
    clientAddressKey("192.0.2.10"),
  );
  assert.equal(clientAddressKey("::ffff:c000:20a"), "192.0.2.10");
  const subnet = clientAddressKey("2001:db8:12:34::1");
  assert.equal(subnet, "2001:0db8:0012:0034::/64");
  assert.equal(clientAddressKey("2001:0DB8:0012:0034:0:0:0:abcd"), subnet);
  assert.notEqual(clientAddressKey("2001:db8:12:35::1"), subnet);
  for (const value of [undefined, "", "bad", "192.0.2.10:3000", "fe80::1%lo0"])
    assert.throws(() => clientAddressKey(value), { status: 400 });
});

test("fixed windows, failed attempts and concurrent idempotent success releases retain exact budgets", async () => {
  let now = 1000;
  const limiter = new AttemptLimiter(
    new MemoryAttemptStore({ now: () => now }),
  );
  await limiter.reserve("account", "a", 3); // Failure remains charged.
  const success = await limiter.reserve("account", "a", 3);
  await Promise.all([success(), success(), success()]);
  await limiter.reserve("account", "a", 3);
  await limiter.reserve("account", "a", 3);
  await assert.rejects(limiter.reserve("account", "a", 3), {
    status: 429,
    retryAfter: 900,
  });
  now += ATTEMPT_WINDOW_MS - 1;
  await assert.rejects(limiter.reserve("account", "a", 3), {
    status: 429,
    retryAfter: 1,
  });
  now++;
  await limiter.reserve("account", "a", 3);
});

test("late success from an expired window cannot refund a replacement window", async () => {
  let now = 1000;
  const limiter = new AttemptLimiter(
    new MemoryAttemptStore({ now: () => now }),
  );
  const old = await limiter.reserve("ip", "a", 1);
  now += ATTEMPT_WINDOW_MS;
  await limiter.cleanup();
  await limiter.reserve("ip", "a", 1);
  await old();
  await assert.rejects(limiter.reserve("ip", "a", 1), { status: 429 });
});

test("memory capacity is bounded, fails closed, and recovers after expiry", async () => {
  let now = 1000;
  const store = new MemoryAttemptStore({ now: () => now, maxEntries: 2 });
  const limiter = new AttemptLimiter(store);
  await limiter.reserve("ip", "a", 2);
  await limiter.reserve("ip", "b", 2);
  await assert.rejects(limiter.reserve("ip", "c", 2), {
    status: 503,
    retryAfter: 30,
  });
  assert.equal(store.entries.size, 2);
  await limiter.reserve("ip", "a", 2);
  now += ATTEMPT_WINDOW_MS;
  await limiter.reserve("ip", "c", 2);
  assert.equal(store.entries.size, 1);
});

test("two HTTP services share IP/account limits and concurrent reservations in a temporary database", async (t) => {
  const f = await fixture(t);
  await sharedRateLimitSuite([f.store, f.store], t);
});

test("database budgets survive reconnect, match window receipts and expire without deleting active budgets", async (t) => {
  const f = await fixture(t);
  let now = 1000;
  const make = () =>
    new AttemptLimiter(
      new DatabaseAttemptStore(f.store.db, {
        provider: "sqljs",
        now: () => now,
      }),
    );
  let limiter = make();
  await limiter.reserve("account", "private.name", 1);
  const oldRow = (await f.store.db.query("SELECT * FROM kp_rate_limits"))
    .rows[0];
  await f.reopen();
  limiter = make();
  await assert.rejects(limiter.reserve("account", "private.name", 1), {
    status: 429,
  });
  now += ATTEMPT_WINDOW_MS;
  await limiter.reserve("account", "private.name", 1);
  const row = (await f.store.db.query("SELECT * FROM kp_rate_limits")).rows[0];
  assert.notEqual(row.window_id, oldRow.window_id);
  const repository = new DatabaseAttemptStore(f.store.db, {
    provider: "sqljs",
    now: () => now,
  });
  await repository.release(oldRow.bucket_hash, oldRow.window_id);
  await assert.rejects(limiter.reserve("account", "private.name", 1), {
    status: 429,
  });
  await limiter.reserve("ip", "later", 1);
  now += ATTEMPT_WINDOW_MS - 1;
  await limiter.reserve("ip", "active", 1);
  now++;
  await limiter.cleanup();
  const rows = (await f.store.db.query("SELECT * FROM kp_rate_limits")).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attempts, 1);
  assert.equal(rows[0].expires_at, now - 1 + ATTEMPT_WINDOW_MS);
});

test("database migration 29 preserves model/history, runs once and enforces nonnegative counts", async (t) => {
  const f = await fixture(t);
  await f.store.transaction(async (c) => {
    await c.upsert("projects", [
      {
        id: "preserved",
        name: "Türkçe proje",
        responsible_name: "Test",
        start_month: "2026-01",
        end_month: "2026-12",
      },
    ]);
    await c.upsert("project_phases", [
      {
        project_id: "preserved",
        month: "2026-03",
        label: "Analiz",
        color: "blue",
      },
    ]);
    await c.upsert("audit_events", [
      {
        id: "existing-audit",
        occurred_at: "2026-10-01T09:00:00.000Z",
        actor_id: "synthetic",
        actor_name: "Test",
        kind: "project",
        record_id: "preserved",
        record_name: "Türkçe proje",
        action: "create",
        changes: "[]",
      },
    ]);
    await c.query("DROP TABLE kp_rate_limits");
    await c.query("DELETE FROM kp_schema_migrations WHERE version=29");
  });
  const before = await f.store.read();
  const audits = (await f.store.db.query("SELECT * FROM kp_audit_events")).rows;
  await f.reopen();
  assert.deepEqual(await f.store.read(), before);
  assert.deepEqual(
    (await f.store.db.query("SELECT * FROM kp_audit_events")).rows,
    audits,
  );
  await assert.rejects(
    f.store.transaction((c) =>
      c.upsert("rate_limits", [
        {
          bucket_hash: "a".repeat(64),
          window_id: "test",
          attempts: -1,
          expires_at: 1000,
        },
      ]),
    ),
    /constraint/i,
  );
  await f.reopen();
  assert.equal(
    (
      await f.store.db.query(
        "SELECT version FROM kp_schema_migrations WHERE version=29",
      )
    ).rows.length,
    1,
  );
});

test("MSSQL always selects shared storage and counter locks remain separate from business-data locks", async () => {
  assert(
    createAttemptLimiter({ provider: "mssql", db: {} }).store instanceof
      DatabaseAttemptStore,
  );
  assert(
    createAttemptLimiter({ provider: "sqljs" }).store instanceof
      MemoryAttemptStore,
  );
  const calls = [];
  const adapter = Object.create(MssqlAdapter.prototype);
  adapter.lockedTransaction = (...args) => {
    calls.push(args);
    return "result";
  };
  const fn = () => {};
  assert.equal(await adapter.transaction(fn), "result");
  await adapter.transaction(fn, true);
  adapter.rateLimitTransaction("b".repeat(64), fn);
  assert.deepEqual(calls, [
    [fn, "aa_kaynak_data", "Exclusive", 15000],
    [fn, "aa_kaynak_data", "Shared", 15000],
    [fn, "aa_kaynak_rate:" + "b".repeat(64), "Exclusive", 2000],
  ]);
  assert.throws(() => adapter.rateLimitTransaction("bad", fn));
});

test("shared-store failure blocks login without password lookup or local fallback and does not leak errors", async (t) => {
  let lookups = 0,
    sessions = 0;
  const store = {
    cleanupSessions: async () => {},
    findUser: async () => {
      lookups++;
    },
    createSession: async () => {
      sessions++;
    },
  };
  const attemptLimiter = new AttemptLimiter({
    reserve: async () => {
      throw Error("Secret SQL host/password");
    },
    cleanup: async () => {},
  });
  const app = await application(t, [], { attemptLimiter }, store);
  const response = await app.request({
    username: "test.user",
    password: "wrong",
  });
  assert.equal(response.status, 503);
  assert.equal(response.retryAfter, "30");
  assert(!JSON.stringify(response.body).includes("Secret"));
  assert.equal(lookups, 0);
  assert.equal(sessions, 0);
});

test("a failed success refund does not issue a session and does not silently reset the budget", async (t) => {
  const base = await application(t);
  let sessions = 0;
  const store = {
    ...base.store,
    createSession: async () => {
      sessions++;
    },
  };
  const attemptLimiter = new AttemptLimiter({
    reserve: async () => ({ allowed: true, windowId: "w" }),
    release: async () => {
      throw Error("SQL offline");
    },
    cleanup: async () => {},
  });
  const app = await application(t, [], { attemptLimiter }, store);
  const response = await app.request({
    username: "test.user",
    password: app.password,
  });
  assert.equal(response.status, 503);
  assert.equal(sessions, 0);
});

test("malformed JSON and oversized login bodies consume the IP budget before parsing", async (t) => {
  const app = await application(t, ["loopback"]);
  for (let i = 0; i < 30; i++) {
    assert.equal((await app.request("{")).status, 400);
    assert.equal((await app.request({ x: "x".repeat(5000) })).status, 413);
  }
  assert.equal((await app.request({})).status, 429);
  assert.equal((await app.request({}, "192.0.2.2")).status, 400);
});

test("trusted chains stop at the nearest untrusted hop; forged leftmost addresses cannot split its quota", async (t) => {
  const app = await application(t, ["loopback", "10.10.0.10"]);
  for (let i = 0; i < 60; i++)
    assert.equal(
      (
        await app.request(
          {},
          "203.0.113." + (i + 1) + ", 192.0.2.8, 10.10.0.10",
        )
      ).status,
      400,
    );
  assert.equal(
    (await app.request({}, "203.0.113.200, 192.0.2.8, 10.10.0.10")).status,
    429,
  );
  assert.equal((await app.request({}, "192.0.2.9, 10.10.0.10")).status, 400);
  assert.equal((await app.request({}, "not-an-address")).status, 400);
});

test("IPv4-mapped and rotating IPv6 addresses cannot bypass HTTP IP limits", async (t) => {
  const app = await application(t, ["loopback"]);
  for (let i = 0; i < 60; i++)
    assert.equal(
      (await app.request({}, i % 2 ? "::ffff:192.0.2.3" : "192.0.2.3")).status,
      400,
    );
  assert.equal((await app.request({}, "::ffff:c000:203")).status, 429);
  for (let i = 0; i < 60; i++)
    assert.equal(
      (await app.request({}, "2001:db8:aa:bb::" + (i + 1).toString(16))).status,
      400,
    );
  assert.equal(
    (await app.request({}, "2001:0DB8:00AA:00BB::ffff")).status,
    429,
  );
  assert.equal((await app.request({}, "2001:db8:aa:bc::1")).status, 400);
});
