import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import {
  MutationAdmission,
  mutationAdmissionLimits,
  mutationAdmissionConfig,
} from "../backend/mutation-admission.mjs";

test("admission limits validate bounded integers and redact invalid environment values", () => {
  assert.deepEqual(mutationAdmissionConfig(), {
    activeLimit: 2,
    pendingLimit: 8,
    waitMs: 5000,
    bodyMs: 60000,
  });
  assert.equal(
    mutationAdmissionConfig({ MUTATION_PENDING_LIMIT: "0" }).pendingLimit,
    0,
  );
  for (const [key, values] of Object.entries({
    activeLimit: [0, 9, 1.5, NaN],
    pendingLimit: [-1, 33],
    waitMs: [99, 10001],
    bodyMs: [999, 120001],
  }))
    for (const value of values)
      assert.throws(() => mutationAdmissionLimits({ [key]: value }));
  for (const value of ["private-marker", "1e2", "", true, null])
    assert.throws(
      () => mutationAdmissionConfig({ MUTATION_ACTIVE_LIMIT: value }),
      (e) => !e.message.includes("private-marker"),
    );
});
test("admission is FIFO, bounded, and releases a lease exactly once", async () => {
  const gate = new MutationAdmission({ activeLimit: 1, pendingLimit: 2 });
  const first = await gate.acquire();
  const order = [];
  const second = gate.acquire().then((r) => {
    order.push(2);
    return r;
  });
  const third = gate.acquire().then((r) => {
    order.push(3);
    return r;
  });
  await assert.rejects(
    gate.acquire(),
    (e) => e.status === 503 && e.retryAfter === 1,
  );
  assert.deepEqual(gate.counts, { active: 1, pending: 2, closed: false });
  first();
  first();
  const release2 = await second;
  assert.deepEqual(order, [2]);
  release2();
  const release3 = await third;
  release3();
  assert.deepEqual(order, [2, 3]);
  assert.equal(gate.counts.active, 0);
});
test("queue timeout never grants a late write; cancelling a queued request returns its place", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const gate = new MutationAdmission({
    activeLimit: 1,
    pendingLimit: 2,
    waitMs: 100,
  });
  const release = await gate.acquire();
  const abort = new AbortController();
  const cancelled = assert.rejects(gate.acquire(abort.signal), {
    name: "AbortError",
  });
  abort.abort();
  await cancelled;
  const timedOut = assert.rejects(gate.acquire(), { status: 503 });
  t.mock.timers.tick(100);
  await timedOut;
  assert.equal(gate.counts.pending, 0);
  release();
  await setImmediate();
  assert.equal(gate.counts.active, 0);
  const next = await gate.acquire();
  next();
});
test("shutdown rejects pending work without releasing an executing lease", async () => {
  const gate = new MutationAdmission({ activeLimit: 1, pendingLimit: 1 });
  const release = await gate.acquire();
  const pending = assert.rejects(gate.acquire(), { status: 503 });
  gate.close();
  gate.close();
  await pending;
  assert.equal(gate.counts.active, 1);
  await assert.rejects(gate.acquire(), { status: 503 });
  release();
  assert.equal(gate.counts.active, 0);
});
