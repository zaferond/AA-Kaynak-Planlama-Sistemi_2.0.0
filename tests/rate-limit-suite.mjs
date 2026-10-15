import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import {
  DatabaseAttemptStore,
  AttemptLimiter,
} from "../backend/rate-limits.mjs";
import { application } from "./login-test-fixture.mjs";

// Run with one temporary SQL.js adapter locally, and two independent MSSQL
// pools in the native suite. Only the latter proves cross-process SQL locking.
export async function sharedRateLimitSuite(stores, t) {
  const limiters = stores.map(
    (store) =>
      new AttemptLimiter(
        new DatabaseAttemptStore(store.db, { provider: store.provider }),
      ),
  );
  const scope = "test-" + randomUUID();
  const outcomes = await Promise.allSettled(
    Array.from({ length: 40 }, (_, i) =>
      limiters[i % 2].reserve(scope, "same-account", 15),
    ),
  );
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 15);
  assert.equal(
    outcomes.filter((r) => r.status === "rejected" && r.reason.status === 429)
      .length,
    25,
  );
  // A new service instance must retain the shared failure count.
  const restarted = new AttemptLimiter(
    new DatabaseAttemptStore(stores[1].db, { provider: stores[1].provider }),
  );
  await assert.rejects(restarted.reserve(scope, "same-account", 15), {
    status: 429,
  });
  const release = outcomes.find((r) => r.status === "fulfilled").value;
  await Promise.all([release(), release()]);
  await restarted.reserve(scope, "same-account", 15);
  await assert.rejects(restarted.reserve(scope, "same-account", 15), {
    status: 429,
  });
  await restarted.reserve(scope, "different-account", 15);
  // Uses SQL Server UTC in the native run, including expiry cleanup. A late
  // successful response must not refund the replacement window.
  const key = createHash("sha256")
    .update(scope + "expiry")
    .digest("hex");
  const repositories = stores.map(
    (store) => new DatabaseAttemptStore(store.db, { provider: store.provider }),
  );
  const old = await repositories[0].reserve(key, 1);
  await stores[0].transaction((c) =>
    c.query("UPDATE kp_rate_limits SET expires_at=1 WHERE bucket_hash=@p0", [
      key,
    ]),
  );
  const replacement = await repositories[1].reserve(key, 1);
  assert(replacement.allowed);
  assert.notEqual(replacement.windowId, old.windowId);
  await repositories[0].release(key, old.windowId);
  assert.equal((await repositories[1].reserve(key, 1)).allowed, false);
  const expiredKey = createHash("sha256")
    .update(scope + "cleanup")
    .digest("hex");
  await repositories[0].reserve(expiredKey, 1);
  await stores[0].transaction((c) =>
    c.query("UPDATE kp_rate_limits SET expires_at=1 WHERE bucket_hash=@p0", [
      expiredKey,
    ]),
  );
  await repositories[1].cleanup();
  assert.equal(
    (
      await stores[0].db.query(
        "SELECT * FROM kp_rate_limits WHERE bucket_hash=@p0",
        [expiredKey],
      )
    ).rows.length,
    0,
  );
  assert.equal((await repositories[1].reserve(key, 1)).allowed, false);

  const first = await application(t, ["loopback"], {
    attemptLimiter: limiters[0],
  });
  const second = await application(t, ["loopback"], {
    attemptLimiter: limiters[1],
  });
  for (let i = 0; i < 60; i++)
    assert.equal((await [first, second][i % 2].request({})).status, 400);
  for (const app of [first, second]) {
    const blocked = await app.request({});
    assert.equal(blocked.status, 429);
    assert(Number(blocked.retryAfter) > 0 && Number(blocked.retryAfter) <= 900);
    assert.equal((await app.request({}, "192.0.2.2")).status, 400);
  }
  for (let i = 0; i < 15; i++)
    assert.equal(
      (
        await [first, second][i % 2].request(
          { username: i % 2 ? " TEST.USER " : "test.user", password: "wrong" },
          "198.51.100." + (i + 1),
        )
      ).status,
      401,
    );
  assert.equal(
    (
      await second.request(
        { username: "test.user", password: first.password },
        "198.51.100.200",
      )
    ).status,
    429,
  );
  const rows = (
    await stores[0].db.query("SELECT bucket_hash FROM kp_rate_limits")
  ).rows;
  assert(rows.every((r) => /^[a-f0-9]{64}$/.test(r.bucket_hash)));
  assert(!JSON.stringify(rows).includes("test.user"));
}
