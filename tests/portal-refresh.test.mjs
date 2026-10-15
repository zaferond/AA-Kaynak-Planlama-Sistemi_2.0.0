import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { createPortalRefresh } from "../frontend/src/features/portal-refresh.ts";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const state = {
    busy: false,
    focused: false,
    visible: true,
    valid: true,
    reads: 0,
    checks: 0,
    errors: [],
    read: () => Promise.resolve(),
    check: () => Promise.resolve(false),
  };
  const refresh = createPortalRefresh({
    load: () => {
      state.reads++;
      return state.read();
    },
    checkUpdates: () => {
      state.checks++;
      return state.check();
    },
    isBusy: () => state.busy,
    hasFocusedInput: () => state.focused,
    isVisible: () => state.visible,
    assertSession: () => {
      if (!state.valid) throw Error("Synthetic old session");
    },
    onLoadError: (error) => state.errors.push(error.message),
  });
  return { state, refresh };
}

test("refresh: opening loads once; idle flushes without an external change do not read", async () => {
  const { state, refresh } = fixture();
  state.focused = true;
  await refresh.start();
  state.focused = false;
  for (let i = 0; i < 5; i++) refresh.flush();
  await setImmediate();
  assert.equal(state.reads, 1);
});

test("refresh: current editing/saving state defers notifications and resumes once when idle", async () => {
  const { state, refresh } = fixture();
  await refresh.start();
  state.busy = true;
  for (let i = 0; i < 5; i++) refresh.notify();
  await setImmediate();
  assert.equal(state.reads, 1);
  state.busy = false;
  refresh.flush();
  await setImmediate();
  assert.equal(state.reads, 2);
});

test("refresh: a delayed version result uses the latest editor state", async () => {
  const { state, refresh } = fixture();
  await refresh.start();
  const version = deferred();
  state.check = () => version.promise;
  const pending = refresh.poll();
  await setImmediate();
  state.busy = true;
  version.resolve(true);
  await pending;
  assert.equal(state.reads, 1);
  state.busy = false;
  refresh.flush();
  await setImmediate();
  assert.equal(state.reads, 2);
});

test("refresh: focus defers full reads while version/identity checks continue", async () => {
  const { state, refresh } = fixture();
  await refresh.start();
  state.focused = true;
  state.busy = true;
  state.check = async () => true;
  await refresh.poll();
  assert.equal(state.checks, 1);
  assert.equal(state.reads, 1);
  state.busy = false;
  refresh.flush();
  await setImmediate();
  assert.equal(state.reads, 1);
  state.focused = false;
  refresh.flush();
  await setImmediate();
  assert.equal(state.reads, 2);
});

test("refresh: an editor opened before a queued read starts preserves its notification", async () => {
  const { state, refresh } = fixture();
  await refresh.start();
  refresh.notify();
  state.busy = true;
  await setImmediate();
  assert.equal(state.reads, 1);
  state.busy = false;
  refresh.flush();
  await setImmediate();
  assert.equal(state.reads, 2);
});

test("refresh: bursts during a full read share the read and one follow-up", async () => {
  const { state, refresh } = fixture();
  await refresh.start();
  const read = deferred();
  state.read = () => read.promise;
  refresh.notify();
  await setImmediate();
  for (let i = 0; i < 8; i++) refresh.notify();
  await setImmediate();
  assert.equal(state.reads, 2);
  state.read = async () => {};
  read.resolve();
  await setImmediate();
  assert.equal(state.reads, 3);
  await setImmediate();
  assert.equal(state.reads, 3);
});

test("refresh: a follow-up waits if an editor opens during the first read", async () => {
  const { state, refresh } = fixture();
  await refresh.start();
  const read = deferred();
  state.read = () => read.promise;
  refresh.notify();
  await setImmediate();
  refresh.notify();
  state.busy = true;
  read.resolve();
  await setImmediate();
  assert.equal(state.reads, 2);
  state.read = async () => {};
  state.busy = false;
  refresh.flush();
  await setImmediate();
  assert.equal(state.reads, 3);
});

test("refresh: repeated polls share one check and hidden pages do not poll", async () => {
  const { state, refresh } = fixture();
  await refresh.start();
  const version = deferred();
  state.check = () => version.promise;
  const first = refresh.poll(),
    second = refresh.poll();
  assert.equal(first, second);
  await setImmediate();
  assert.equal(state.checks, 1);
  version.resolve(false);
  await first;
  state.visible = false;
  await refresh.poll();
  assert.equal(state.checks, 1);
});

test("refresh: stopping before queued work runs prevents both reads and checks", async () => {
  const { state, refresh } = fixture();
  const initial = refresh.start(),
    check = refresh.poll();
  refresh.stop();
  await Promise.all([initial, check]);
  refresh.notify();
  refresh.flush();
  await refresh.poll();
  assert.equal(state.reads, 0);
  assert.equal(state.checks, 0);
});

test("refresh: an old version result cannot queue a read after cleanup/reactivation", async () => {
  const { state, refresh } = fixture();
  await refresh.start();
  const version = deferred();
  state.check = () => version.promise;
  const old = refresh.poll();
  await setImmediate();
  refresh.stop();
  await refresh.start();
  version.resolve(true);
  await old;
  await setImmediate();
  assert.equal(state.reads, 2);
});

test("refresh: old read completion cannot clear or flush a replacement lifetime's read", async () => {
  const { state, refresh } = fixture();
  const oldRead = deferred();
  state.read = () => oldRead.promise;
  const old = refresh.start();
  await setImmediate();
  refresh.notify();
  refresh.stop();
  const newRead = deferred();
  state.read = () => newRead.promise;
  const current = refresh.start();
  await setImmediate();
  refresh.notify();
  oldRead.resolve();
  await old;
  assert.equal(state.reads, 2);
  state.read = async () => {};
  newRead.resolve();
  await current;
  await setImmediate();
  assert.equal(state.reads, 3);
});

test("refresh: a stale session before or after a check prevents new requests", async () => {
  const { state, refresh } = fixture();
  await refresh.start();
  const version = deferred();
  state.check = () => version.promise;
  const check = refresh.poll();
  await setImmediate();
  state.valid = false;
  version.resolve(true);
  await check;
  refresh.notify();
  refresh.flush();
  await refresh.poll();
  assert.equal(state.reads, 1);
  assert.equal(state.checks, 1);
  assert.deepEqual(state.errors, []);
});

test("refresh: a failed version check does not discard pending notifications or prevent retry", async () => {
  const { state, refresh } = fixture();
  await refresh.start();
  state.busy = true;
  refresh.notify();
  state.check = async () => {
    throw Error("Synthetic version failure");
  };
  await refresh.poll();
  assert.deepEqual(state.errors, []);
  state.busy = false;
  refresh.flush();
  await setImmediate();
  assert.equal(state.reads, 2);
  state.check = async () => true;
  await refresh.poll();
  await setImmediate();
  assert.equal(state.reads, 3);
});

test("refresh: full read failure reports once without a retry loop; stale failures are ignored", async () => {
  const { state, refresh } = fixture();
  await refresh.start();
  state.read = async () => {
    throw Error("Synthetic read failure");
  };
  refresh.notify();
  await setImmediate();
  await setImmediate();
  assert.equal(state.reads, 2);
  assert.deepEqual(state.errors, ["Synthetic read failure"]);
  state.read = async () => {};
  refresh.notify();
  await setImmediate();
  assert.equal(state.reads, 3);
  const read = deferred();
  state.read = () => read.promise;
  refresh.notify();
  await setImmediate();
  refresh.stop();
  read.reject(Error("Synthetic old failure"));
  await setImmediate();
  assert.deepEqual(state.errors, ["Synthetic read failure"]);
});
