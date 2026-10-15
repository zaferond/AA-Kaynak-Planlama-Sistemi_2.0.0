import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";

let counter = 0;
async function setup(t) {
  const storage = await import("../frontend/src/storage.ts?test=" + counter++);
  const pending = [];
  t.mock.method(
    globalThis,
    "fetch",
    (url, options) =>
      new Promise((resolve) => pending.push({ url, options, resolve })),
  );
  const reply = (path, result, status = 200, identity = "") => {
    const index = pending.findIndex((item) => item.url === "/api" + path);
    assert(index >= 0, "pending request " + path);
    pending.splice(index, 1)[0].resolve({
      ok: status < 400,
      status,
      headers: new Headers(identity ? { "X-Session-Identity": identity } : {}),
      json: async () => result,
    });
  };
  return { storage, pending, reply };
}

test("late background reads return the latest accepted data and cannot roll back generation or permissions", async (t) => {
  const { storage, reply } = await setup(t);
  const oldRead = storage.readLocal();
  const write = storage.writeBatch([
    { kind: "allocation", id: "t|p|2026-09", value: 1, revision: 0 },
  ]);
  await setImmediate();
  const user = { id: "u", role: "normal", name: "Current" };
  reply("/changes", { generation: 2, data: { marker: "new" }, user });
  assert.deepEqual(await write, { marker: "new" });
  reply("/data", {
    generation: 1,
    data: { marker: "old" },
    user: { ...user, role: "admin" },
  });
  assert.deepEqual(await oldRead, { marker: "new" });
  assert.equal(storage.currentUser().role, "normal");
  const check = storage.checkUpdates();
  reply("/version", { generation: 2 });
  assert.equal(await check, false);
});

test("out-of-order administrative and batch responses use the newest snapshot", async (t) => {
  const { storage, reply } = await setup(t);
  const userEdit = storage.saveUser({
    id: "u",
    role: "normal",
    resourceId: "r",
    leaders: [],
    revision: 1,
  });
  const batch = storage.writeBatch([
    { kind: "allocation", id: "t|p|2026-09", value: 1, revision: 0 },
  ]);
  await setImmediate();
  reply("/changes", { generation: 4, data: { marker: "latest" } });
  await batch;
  reply("/users", { generation: 3, data: { marker: "older" } });
  assert.deepEqual(await userEdit, { marker: "latest" });
});

test("responses from a previous session never enter the new session cache", async (t) => {
  const { storage, reply } = await setup(t);
  const oldRead = storage.readLocal();
  const rejected = assert.rejects(
    oldRead,
    (error) => error.name === "StaleSessionError",
  );
  const login = storage.login("new.user", "unused");
  reply("/auth/login", {
    user: { id: "new", role: "normal" },
    csrf: "new-csrf",
  });
  await login;
  const newRead = storage.readLocal();
  reply("/data", {
    generation: 99,
    data: { marker: "old-admin" },
    user: { id: "old", role: "admin" },
  });
  await rejected;
  reply("/data", {
    generation: 1,
    data: { marker: "new-user" },
    user: { id: "new", role: "normal" },
  });
  assert.deepEqual(await newRead, { marker: "new-user" });
  assert.equal(storage.currentUser().id, "new");
});

test("an old session 401 cannot expire a new login", async (t) => {
  const { storage, reply } = await setup(t);
  const old = storage.readLocal();
  const rejected = assert.rejects(
    old,
    (error) => error.name === "StaleSessionError",
  );
  const login = storage.login("new.user", "unused");
  reply("/auth/login", { user: { id: "new", role: "normal" }, csrf: "new" });
  await login;
  reply("/data", { error: "Old session" }, 401);
  await rejected;
  assert.equal(storage.currentUser().id, "new");
});

test("a delayed version response does not trigger a reload after a newer write", async (t) => {
  const { storage, reply } = await setup(t);
  const check = storage.checkUpdates();
  const read = storage.readLocal();
  reply("/data", { generation: 3, data: { marker: "current" } });
  await read;
  reply("/version", { generation: 2 });
  assert.equal(await check, false);
});

const planningUser = { id: "u", role: "admin", name: "Current", leaders: [] };
const planningData = () => ({
  marker: "metadata",
  projects: [{ id: "p" }],
  allocations: { "t|p|2026-09": 1 },
  revisions: { "allocation:t|p|2026-09": 1, "project:p": 3 },
});
const planningPatch = (baseGeneration, entries, user = planningUser) => ({
  responseMode: "planning-delta-v1",
  baseGeneration,
  generation: baseGeneration + 1,
  user,
  allocations: entries,
});
async function loadPlanning(storage, reply, generation = 1) {
  const read = storage.readLocal();
  const data = planningData();
  reply("/data", { generation, data, user: planningUser });
  await read;
  return data;
}

test("queued cell writes negotiate their latest base and merge zero/delete without mutating displayed data", async (t) => {
  const { storage, reply, pending } = await setup(t);
  const original = await loadPlanning(storage, reply);
  const first = storage.writeBatch([
    { kind: "allocation", id: "t|p|2026-09", value: 0, revision: 1 },
  ]);
  const second = storage.writeBatch([
    { kind: "allocation", id: "t|p|2026-10", value: 0.5, revision: 0 },
  ]);
  await setImmediate();
  assert.equal(pending.length, 1);
  assert.equal(JSON.parse(pending[0].options.body).baseGeneration, 1);
  reply(
    "/changes",
    planningPatch(1, [{ id: "t|p|2026-09", value: 0, revision: 2 }]),
  );
  const next = await first;
  assert.equal(next.allocations["t|p|2026-09"], 0);
  assert.equal(original.allocations["t|p|2026-09"], 1);
  await setImmediate();
  assert.equal(JSON.parse(pending[0].options.body).baseGeneration, 2);
  reply(
    "/changes",
    planningPatch(2, [
      { id: "t|p|2026-09", value: null, revision: 3 },
      { id: "t|p|2026-10", value: 0.5, revision: 1 },
    ]),
  );
  const final = await second;
  assert.equal(Object.hasOwn(final.allocations, "t|p|2026-09"), false);
  assert.equal(final.revisions["allocation:t|p|2026-09"], 3);
  assert.equal(final.allocations["t|p|2026-10"], 0.5);
  assert.equal(final.projects, original.projects);
  assert.equal(pending.length, 0);
});

test("a delayed delta cannot overwrite a newer background snapshot or its principal", async (t) => {
  const { storage, reply, pending } = await setup(t);
  await loadPlanning(storage, reply);
  const write = storage.writeBatch([
    { kind: "allocation", id: "t|p|2026-09", value: 2, revision: 1 },
  ]);
  await setImmediate();
  const read = storage.readLocal();
  const current = { ...planningData(), marker: "newer" };
  reply("/data", {
    generation: 4,
    data: current,
    user: { ...planningUser, role: "manager" },
  });
  await read;
  reply(
    "/changes",
    planningPatch(1, [{ id: "t|p|2026-09", value: 2, revision: 2 }]),
  );
  assert.deepEqual(await write, current);
  assert.equal(storage.currentUser().role, "manager");
  assert.equal(pending.length, 0);
});

test("incompatible deltas fetch a full view once and never repeat the committed write", async (t) => {
  const { storage, reply, pending } = await setup(t);
  await loadPlanning(storage, reply);
  const write = storage.writeBatch([
    { kind: "allocation", id: "t|p|2026-09", value: 2, revision: 1 },
  ]);
  await setImmediate();
  reply(
    "/changes",
    planningPatch(3, [{ id: "t|p|2026-09", value: 2, revision: 2 }]),
  );
  await setImmediate();
  assert.deepEqual(
    pending.map((item) => item.url),
    ["/api/data"],
  );
  const data = { ...planningData(), marker: "recovered" };
  reply("/data", { generation: 4, data, user: planningUser });
  assert.deepEqual(await write, data);
  assert.equal(pending.length, 0);
});

test("entity writes and old servers retain full snapshots; missing caches do not request a delta", async (t) => {
  const { storage, reply, pending } = await setup(t);
  const first = storage.writeBatch([
    { kind: "allocation", id: "t|p|2026-09", value: 1, revision: 0 },
  ]);
  await setImmediate();
  assert.equal(JSON.parse(pending[0].options.body).responseMode, undefined);
  reply("/changes", {
    generation: 1,
    data: planningData(),
    user: planningUser,
  });
  await first;
  const second = storage.writeBatch([
    { kind: "allocation", id: "t|p|2026-09", value: 0, revision: 1 },
  ]);
  await setImmediate();
  assert.equal(
    JSON.parse(pending[0].options.body).responseMode,
    "planning-delta-v1",
  );
  const oldServer = { ...planningData(), marker: "old server" };
  reply("/changes", { generation: 2, data: oldServer, user: planningUser });
  assert.deepEqual(await second, oldServer);
  const mixed = storage.writeBatch([
    { kind: "project", id: "p", value: null, revision: 3 },
  ]);
  await setImmediate();
  assert.equal(JSON.parse(pending[0].options.body).responseMode, undefined);
  reply("/changes", {
    generation: 3,
    data: planningData(),
    user: planningUser,
  });
  await mixed;
});

test("a delta from a previous session is rejected before parsing or fetching recovery data", async (t) => {
  const { storage, reply, pending } = await setup(t);
  await loadPlanning(storage, reply);
  const write = storage.writeBatch([
    { kind: "allocation", id: "t|p|2026-09", value: 2, revision: 1 },
  ]);
  const rejected = assert.rejects(
    write,
    (error) => error.name === "StaleSessionError",
  );
  await setImmediate();
  const login = storage.login("new.user", "unused");
  reply("/auth/login", { user: { id: "new", role: "normal" }, csrf: "new" });
  await login;
  const request = pending.splice(0, 1)[0];
  request.resolve({
    ok: true,
    status: 200,
    json: () => {
      throw Error("old body must not be parsed");
    },
  });
  await rejected;
  assert.equal(storage.currentUser().id, "new");
  assert.equal(pending.length, 0);
});

function browserEvents(t) {
  const window = new EventTarget(),
    signals = [],
    events = [];
  window.localStorage = {
    setItem: (key, value) => signals.push({ key, value }),
  };
  globalThis.window = window;
  t.after(() => delete globalThis.window);
  for (const name of ["session-expired", "session-changed"])
    window.addEventListener(name, () => events.push(name));
  return { window, signals, events };
}
async function bindSession(storage, reply, identity = "old-session") {
  const login = storage.login("old.user", "unused");
  reply("/auth/login", {
    user: planningUser,
    csrf: "old-csrf",
    sessionIdentity: identity,
  });
  await login;
  return loadPlanning(storage, reply, 10);
}

test("unchanged generation still detects a different session; old queued writes cancel while the new session can write immediately", async (t) => {
  const { events } = browserEvents(t);
  const { storage, reply, pending } = await setup(t);
  await bindSession(storage, reply);
  const first = storage.writeBatch([
    { kind: "allocation", id: "old", value: 1, revision: 0 },
  ]);
  const queued = storage.writeBatch([
    { kind: "allocation", id: "queued", value: 1, revision: 0 },
  ]);
  const rejectFirst = assert.rejects(first, { name: "StaleSessionError" });
  const rejectQueued = assert.rejects(queued, { name: "StaleSessionError" });
  await setImmediate();
  const oldWrite = pending.shift();
  const check = storage.checkUpdates();
  reply("/version", { generation: 10, sessionIdentity: "new-session" });
  assert.equal(await check, false);
  assert.equal(storage.currentUser(), null);
  assert.deepEqual(events, ["session-changed"]);
  const login = storage.login("new.user", "unused");
  reply("/auth/login", {
    user: { ...planningUser, id: "new", role: "normal" },
    csrf: "new-csrf",
    sessionIdentity: "new-session",
  });
  await login;
  const next = storage.writeBatch([
    { kind: "allocation", id: "new", value: 1, revision: 0 },
  ]);
  await setImmediate();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].options.headers["X-CSRF-Token"], "new-csrf");
  assert.equal(JSON.parse(pending[0].options.body).responseMode, undefined);
  reply(
    "/changes",
    {
      generation: 1,
      data: { marker: "new-session" },
      user: { ...planningUser, id: "new", role: "normal" },
    },
    200,
    "new-session",
  );
  assert.deepEqual(await next, { marker: "new-session" });
  oldWrite.resolve({
    status: 401,
    ok: false,
    json: () => {
      throw Error("Old body must not be read");
    },
  });
  await Promise.all([rejectFirst, rejectQueued]);
  assert.equal(storage.currentUser().id, "new");
  assert.equal(pending.length, 0);
});

test("a changed identity on any API response invalidates the view before parsing its body", async (t) => {
  const { events } = browserEvents(t);
  const { storage, reply, pending } = await setup(t);
  await bindSession(storage, reply);
  const read = storage.readLocal();
  const rejected = assert.rejects(read, { name: "StaleSessionError" });
  pending.shift().resolve({
    ok: true,
    status: 200,
    headers: new Headers({ "X-Session-Identity": "another-session" }),
    json: () => {
      throw Error("Body must not be parsed");
    },
  });
  await rejected;
  assert.equal(storage.currentUser(), null);
  assert.deepEqual(events, ["session-changed"]);
});

test("cross-tab invalidation rejects in-flight reads; a late old 401 cannot expire the new session", async (t) => {
  const { window, events } = browserEvents(t);
  const { storage, reply, pending } = await setup(t);
  const stop = storage.observeSessionChanges();
  t.after(stop);
  await bindSession(storage, reply);
  const read = storage.readLocal();
  const rejected = assert.rejects(read, { name: "StaleSessionError" });
  const old = pending.shift();
  const emit = (value) => {
    const event = new Event("storage");
    Object.assign(event, {
      key: "aa-session-change-v1",
      newValue: JSON.stringify(value),
    });
    window.dispatchEvent(event);
  };
  emit({ version: 1, id: "signal", source: "other-tab" });
  emit({ version: 1, id: "signal", source: "other-tab" }); // channel/storage duplicate
  emit({ version: 2, id: "ignored", source: "other-tab" });
  assert.deepEqual(events, ["session-changed"]);
  assert.equal(storage.currentUser(), null);
  const login = storage.login("new.user", "unused");
  reply("/auth/login", {
    user: { ...planningUser, id: "new" },
    csrf: "new",
    sessionIdentity: "new",
  });
  await login;
  old.resolve({
    ok: false,
    status: 401,
    json: () => {
      throw Error("Old body must not be parsed");
    },
  });
  await rejected;
  assert.equal(storage.currentUser().id, "new");
  assert.deepEqual(events, ["session-changed"]);
});

test("session notifications contain only a nonce; failed login/logout do not publish a successful account change", async (t) => {
  const { signals, events } = browserEvents(t);
  const { storage, reply } = await setup(t);
  await bindSession(storage, reply);
  assert.equal(signals.length, 1);
  const assertSession = storage.captureSessionGuard();
  assert.deepEqual(Object.keys(JSON.parse(signals[0].value)).sort(), [
    "id",
    "source",
    "version",
  ]);
  assert(!JSON.stringify(signals).includes("old-csrf"));
  assert(!JSON.stringify(signals).includes("old-session"));
  const logout = storage.logout();
  const failed = assert.rejects(logout, { status: 503 });
  reply("/auth/logout", { error: "temporary failure" }, 503, "old-session");
  await failed;
  assertSession(); // Failed logout does not invalidate the component context.
  assert.equal(storage.currentUser().id, planningUser.id);
  assert.equal(signals.length, 1);
  const success = storage.logout();
  reply("/auth/logout", { ok: true }, 200, "old-session");
  await success;
  assert.throws(assertSession, { name: "StaleSessionError" });
  assert.equal(storage.currentUser(), null);
  assert.equal(signals.length, 2);
  const login = storage.login("bad.user", "unused");
  const denied = assert.rejects(login, { status: 401 });
  reply("/auth/login", { error: "wrong password" }, 401);
  await denied;
  assert.equal(signals.length, 2);
  assert.deepEqual(events, []);
});

test("a temporary identity check failure preserves the session; expiry clears it without a notification loop", async (t) => {
  const { signals, events } = browserEvents(t);
  const { storage, reply } = await setup(t);
  await bindSession(storage, reply);
  const resume = storage.resumeRemembered();
  const failed = assert.rejects(resume, { status: 503 });
  reply("/auth/me", { error: "temporary failure" }, 503, "old-session");
  await failed;
  assert.equal(storage.currentUser().id, planningUser.id);
  const expiry = storage.resumeRemembered();
  reply("/auth/me", { error: "expired" }, 401);
  assert.equal(await expiry, false);
  assert.equal(storage.currentUser(), null);
  assert.equal(signals.length, 2); // one login and one expiry
  const repeated = storage.resumeRemembered();
  reply("/auth/me", { error: "expired" }, 401);
  assert.equal(await repeated, false);
  assert.equal(signals.length, 2);
  assert.deepEqual(events, ["session-expired", "session-expired"]);
});

test("a backup file read started in the old session cannot send a restore after another account logs in", async (t) => {
  browserEvents(t);
  const { storage, reply, pending } = await setup(t);
  await bindSession(storage, reply);
  let finish;
  const text = new Promise((resolve) => {
    finish = resolve;
  });
  const restore = storage.restoreBackup({ size: 100, text: () => text });
  const rejected = assert.rejects(restore, { name: "StaleSessionError" });
  const login = storage.login("new.user", "unused");
  reply("/auth/login", {
    user: { ...planningUser, id: "new" },
    csrf: "new",
    sessionIdentity: "new",
  });
  await login;
  finish(
    JSON.stringify({ format: "aa-planning-data-v1", data: planningData() }),
  );
  await rejected;
  assert.equal(pending.length, 0);
  assert.equal(storage.currentUser().id, "new");
});

test("a timed-out write cancels queued writes and direct mutations until explicit fresh-read acknowledgement", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { storage, reply, pending } = await setup(t);
  await loadPlanning(storage, reply);
  const change = {
    kind: "allocation",
    id: "t|p|2026-09",
    value: 2,
    revision: 1,
  };
  const first = storage.writeBatch([change]);
  const queued = storage.writeBatch([{ ...change, id: "queued" }]);
  const failures = [
    assert.rejects(first, {
      name: "RequestFailure",
      outcomeUnknown: true,
      timedOut: true,
    }),
    assert.rejects(queued, { name: "WriteBlockedError" }),
  ];
  await setImmediate();
  const late = pending.shift();
  t.mock.timers.tick(120_000);
  await Promise.all(failures);
  assert.equal(late.options.signal.aborted, true);
  assert.equal(storage.hasUncertainWrite(), true);
  assert.equal(pending.length, 0);
  await assert.rejects(storage.saveUser({}), { name: "WriteBlockedError" });
  await assert.rejects(storage.importResources([]), {
    name: "WriteBlockedError",
  });
  assert.equal(pending.length, 0);
  const read = storage.readLocal();
  reply("/data", { data: planningData(), generation: 1, user: planningUser });
  await read;
  assert.equal(
    storage.hasUncertainWrite(),
    true,
    "background reads cannot acknowledge a write",
  );
  const inspection = storage.inspectUncertainWrite();
  reply("/data", { data: planningData(), generation: 1, user: planningUser });
  const checked = await inspection;
  assert.deepEqual(checked.data, planningData());
  storage.acknowledgeUncertainWrite(checked.check);
  assert.equal(storage.hasUncertainWrite(), false);
  late.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ "X-Session-Identity": "must-not-be-accepted" }),
    json: () => assert.fail("late body"),
  });
  await setImmediate();
  assert.equal(storage.currentUser().id, "u");
  const retry = storage.writeBatch([change]);
  await setImmediate();
  assert.equal(
    JSON.parse(pending[0].options.body).changes[0].revision,
    1,
    "explicit retry retains captured revision",
  );
  reply("/changes", { error: "synthetic conflict" }, 409);
  await assert.rejects(retry, { status: 409 });
  assert.equal(
    storage.hasUncertainWrite(),
    false,
    "a completed 409 is a known failure",
  );
});

test("a hung write body cannot advance cached generation, and failed recovery never unblocks writes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { storage, reply, pending } = await setup(t);
  await loadPlanning(storage, reply);
  const write = storage.writeBatch([
    { kind: "allocation", id: "t|p|2026-09", value: 2, revision: 1 },
  ]);
  const rejected = assert.rejects(write, {
    name: "RequestFailure",
    outcomeUnknown: true,
  });
  await setImmediate();
  let finish;
  pending.shift().resolve({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await setImmediate();
  t.mock.timers.tick(120_000);
  await rejected;
  assert.equal(storage.currentGeneration(), 1);
  finish({
    generation: 900,
    user: { ...planningUser, role: "normal" },
    data: { marker: "late" },
  });
  await setImmediate();
  assert.equal(storage.currentGeneration(), 1);
  assert.equal(storage.currentUser().role, "admin");
  const check = storage.inspectUncertainWrite();
  const failed = assert.rejects(check, { status: 503 });
  reply("/data", { error: "synthetic recovery failure" }, 503);
  await failed;
  assert.equal(storage.hasUncertainWrite(), true);
});

test("delta fallback timeout is an unknown write; the committed POST is never repeated", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { storage, reply, pending } = await setup(t);
  await loadPlanning(storage, reply);
  const write = storage.writeBatch([
    { kind: "allocation", id: "t|p|2026-09", value: 2, revision: 1 },
  ]);
  const rejected = assert.rejects(write, {
    name: "RequestFailure",
    outcomeUnknown: true,
  });
  await setImmediate();
  reply(
    "/changes",
    planningPatch(3, [{ id: "t|p|2026-09", value: 2, revision: 2 }]),
  );
  await setImmediate();
  assert.deepEqual(
    pending.map((p) => p.url),
    ["/api/data"],
  );
  t.mock.timers.tick(60_000);
  await rejected;
  assert.equal(storage.hasUncertainWrite(), true);
  assert.equal(pending.length, 1);
});

test("session change cancels hung requests immediately and invalidates old recovery acknowledgements", async (t) => {
  browserEvents(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { storage, reply, pending } = await setup(t);
  await bindSession(storage, reply);
  const first = storage.writeBatch([
    { kind: "allocation", id: "t|p|2026-09", value: 2, revision: 1 },
  ]);
  const rejected = assert.rejects(first, { name: "RequestFailure" });
  await setImmediate();
  pending.shift();
  t.mock.timers.tick(120_000);
  await rejected;
  const inspection = storage.inspectUncertainWrite();
  reply("/data", { data: planningData(), generation: 11, user: planningUser });
  const { check } = await inspection;
  const oldRead = storage.readLocal();
  const stale = assert.rejects(oldRead, { name: "StaleSessionError" });
  const login = storage.login("new.user", "unused");
  reply("/auth/login", {
    user: { ...planningUser, id: "new" },
    csrf: "new",
    sessionIdentity: "new",
  });
  await Promise.all([stale, login]);
  assert.equal(storage.hasUncertainWrite(), false);
  assert.throws(() => storage.acknowledgeUncertainWrite(check), {
    name: "WriteBlockedError",
  });
  assert.equal(storage.currentUser().id, "new");
  assert.equal(pending[0].options.signal.aborted, true);
});

test("known admission 503 preserves cache and command revision, does not fence or resend, and permits an explicit retry", async (t) => {
  const { storage, pending, reply } = await setup(t);
  const read = storage.readLocal();
  reply("/data", { generation: 1, data: { marker: "original" } });
  await read;
  const changes = [
    { kind: "allocation", id: "t|p|2026-01", value: 0.5, revision: 2 },
  ];
  const failed = assert.rejects(
    storage.writeBatch(changes),
    (e) => e.status === 503 && !storage.isUncertainWrite(e),
  );
  await setImmediate();
  reply(
    "/changes",
    { error: "Sunucu şu anda yoğun. Değişiklikleriniz kaydedilmedi." },
    503,
  );
  await failed;
  await setImmediate();
  assert.equal(pending.length, 0);
  assert.equal(changes[0].revision, 2);
  const retried = storage.writeBatch(changes);
  await setImmediate();
  assert.equal(pending.length, 1);
  assert.equal(JSON.parse(pending[0].options.body).changes[0].revision, 2);
  reply("/changes", { generation: 2, data: { marker: "saved" } });
  assert.deepEqual(await retried, { marker: "saved" });
});
