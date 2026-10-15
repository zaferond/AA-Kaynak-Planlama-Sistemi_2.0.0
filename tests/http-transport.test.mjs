import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import {
  HttpTransport,
  RequestFailure,
} from "../frontend/src/http-transport.ts";
import {
  WriteRecovery,
  WriteBlockedError,
} from "../frontend/src/write-recovery.ts";

function setup(t) {
  const transport = new HttpTransport(),
    pending = [];
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(
    globalThis,
    "fetch",
    (url, init) =>
      new Promise((resolve, reject) =>
        pending.push({ url, init, resolve, reject }),
      ),
  );
  t.after(() => transport.cancelAll(Error("synthetic cleanup")));
  return { transport, pending };
}
const response = (result) => ({ json: async () => result });

test("deadline bounds stalled headers, aborts the request and ignores late response metadata", async (t) => {
  const { transport, pending } = setup(t);
  let inspected = 0,
    cancelledBody = 0;
  const request = transport.json("/synthetic", {}, 100, () => inspected++);
  const rejected = assert.rejects(
    request,
    (e) => e instanceof RequestFailure && e.timedOut && !e.outcomeUnknown,
  );
  t.mock.timers.tick(100);
  await rejected;
  assert.equal(pending[0].init.signal.aborted, true);
  pending[0].resolve({
    body: { cancel: async () => cancelledBody++ },
    json: () => assert.fail("late body must not be parsed"),
  });
  await setImmediate();
  assert.equal(inspected, 0);
  assert.equal(cancelledBody, 1);
});

test("the same deadline covers a body stalled after successful POST headers", async (t) => {
  const { transport, pending } = setup(t);
  let finishBody,
    inspected = 0;
  const request = transport.json(
    "/synthetic",
    { method: "POST" },
    100,
    () => inspected++,
  );
  const rejected = assert.rejects(
    request,
    (e) => e instanceof RequestFailure && e.timedOut && e.outcomeUnknown,
  );
  pending[0].resolve({
    json: () =>
      new Promise((resolve) => {
        finishBody = resolve;
      }),
  });
  await setImmediate();
  assert.equal(inspected, 1);
  t.mock.timers.tick(100);
  await rejected;
  assert.equal(pending[0].init.signal.aborted, true);
  finishBody({ privateMarker: "synthetic late body" });
  await setImmediate();
  // A later independent request is not cancelled by the expired one's timer.
  const next = transport.json("/next", {}, 100, () => {});
  pending[1].resolve(response({ ok: true }));
  assert.deepEqual((await next).result, { ok: true });
  t.mock.timers.tick(100);
  assert.equal(pending[1].init.signal.aborted, false);
});

test("network and invalid-body errors distinguish unknown writes without exposing raw details", async (t) => {
  const { transport, pending } = setup(t);
  for (const method of ["GET", "POST"]) {
    const request = transport.json("/synthetic", { method }, 100, () => {});
    const rejected = assert.rejects(
      request,
      (e) =>
        e instanceof RequestFailure &&
        !e.timedOut &&
        e.outcomeUnknown === (method === "POST") &&
        !e.message.includes("PRIVATE_SYNTHETIC"),
    );
    pending.at(-1).reject(Error("PRIVATE_SYNTHETIC"));
    await rejected;
  }
  for (const json of [
    async () => {
      throw SyntaxError("PRIVATE_SYNTHETIC");
    },
    async () => null,
    async () => [],
  ]) {
    const request = transport.json(
      "/synthetic",
      { method: "POST" },
      100,
      () => {},
    );
    const rejected = assert.rejects(request, {
      name: "RequestFailure",
      outcomeUnknown: true,
    });
    pending.at(-1).resolve({ json });
    await rejected;
  }
});

test("session cancellation promptly drains all promises and preserves the cancellation reason", async (t) => {
  const { transport, pending } = setup(t),
    reason = Error("synthetic session changed");
  const one = transport.json("/one", {}, 100, () => assert.fail("old header"));
  const two = transport.json("/two", { method: "POST" }, 100, () =>
    assert.fail("old header"),
  );
  const rejected = [one, two].map((p) =>
    assert.rejects(p, (e) => e === reason),
  );
  transport.cancelAll(reason);
  await Promise.all(rejected);
  assert(pending.every((p) => p.init.signal.aborted));
  t.mock.timers.tick(100);
  pending.forEach((p) => p.resolve(response({ marker: "old" })));
  await setImmediate();
});

test("inspection errors preserve identity; successful requests detach their timers", async (t) => {
  const { transport, pending } = setup(t),
    reason = Error("synthetic session validation");
  const failed = transport.json("/one", {}, 100, () => {
    throw reason;
  });
  const rejected = assert.rejects(failed, (e) => e === reason);
  pending[0].resolve(response({}));
  await rejected;
  const success = transport.json("/two", {}, 100, () => {});
  pending[1].resolve(response({ ok: true }));
  await success;
  transport.cancelAll(reason);
  t.mock.timers.tick(100);
  assert.equal(pending[0].init.signal.aborted, true);
  assert.equal(pending[1].init.signal.aborted, false);
});

test("uncertain-write fence cancels old queue epochs and requires a fresh explicit inspection acknowledgement", () => {
  const recovery = new WriteRecovery(),
    events = [];
  const stop = recovery.subscribe(() => events.push(recovery.pending()));
  const queuedEpoch = recovery.capture();
  recovery.markUnknown();
  assert.throws(() => recovery.assert(), WriteBlockedError);
  assert.throws(() => recovery.acknowledge({}), WriteBlockedError);
  const check = recovery.checkedAt(recovery.capture());
  assert.equal(recovery.pending(), true);
  recovery.acknowledge(check);
  recovery.assert();
  assert.throws(() => recovery.assert(queuedEpoch), WriteBlockedError);
  recovery.markUnknown();
  assert.throws(() => recovery.acknowledge(check), WriteBlockedError);
  const oldSessionCheck = recovery.checkedAt(recovery.capture());
  recovery.reset();
  recovery.markUnknown();
  assert.throws(() => recovery.acknowledge(oldSessionCheck), WriteBlockedError);
  assert.throws(() => recovery.checkedAt(queuedEpoch), WriteBlockedError);
  stop();
  assert.deepEqual(events, [true, false, true, false, true]);
});
