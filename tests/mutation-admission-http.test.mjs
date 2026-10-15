import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { Store } from "../backend/store.mjs";
import { createApp } from "../backend/app.mjs";
import { MutationAdmission } from "../backend/mutation-admission.mjs";
import { token, digest, hashPassword } from "../backend/auth.mjs";
const deferred = () => {
  let resolve;
  return {
    promise: new Promise((r) => (resolve = r)),
    resolve: (...a) => resolve(...a),
  };
};
async function wait(fn) {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await delay(5);
  }
  assert.fail("synthetic admission barrier timed out");
}
async function fixture(t, limits = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-admission-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
    },
  });
  await store.connect();
  const user = {
    _id: "test-admin",
    username: "synthetic.admin",
    name: "Synthetic",
    role: "admin",
    leaders: [],
    active: true,
    version: 1,
    revision: 1,
    password: await hashPassword("Synthetic-admission-only-284!"),
  };
  await store.bootstrapUser(user);
  async function session() {
    const raw = token(),
      csrf = token();
    await store.createSession({
      _id: digest(raw),
      userId: user._id,
      userVersion: 1,
      csrf,
      expiresAt: new Date(Date.now() + 60000),
    });
    return { cookie: "kp_session=" + raw, csrf, id: digest(raw) };
  }
  const auth = await session();
  const server = http.createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  const gate = new MutationAdmission({
    activeLimit: 1,
    pendingLimit: 1,
    waitMs: 1000,
    bodyMs: 1000,
    ...limits,
  });
  const app = createApp(store, { origin, mutationGate: gate });
  server.on("request", app);
  let unblock = () => {};
  t.after(async () => {
    unblock();
    app.locals.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const headers = (a = auth) => ({
    Origin: origin,
    "Content-Type": "application/json",
    "X-Requested-With": "KaynakPortal",
    "X-CSRF-Token": a.csrf,
    Cookie: a.cookie,
  });
  async function request(url, body, options = {}) {
    const r = await fetch(origin + "/api" + url, {
      method: body === undefined ? "GET" : "POST",
      headers: headers(options.auth),
      body:
        body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
      signal: options.signal,
    });
    return {
      status: r.status,
      body: await r.json(),
      retryAfter: r.headers.get("retry-after"),
    };
  }
  const project = (id) => ({
    changes: [
      {
        kind: "project",
        id,
        value: {
          id,
          name: id,
          start: "2026-01",
          end: "2026-12",
          phases: {},
          phaseColors: {},
          milestones: [],
        },
        revision: 0,
      },
    ],
  });
  const original = store.mutate.bind(store);
  const entered = deferred(),
    hold = deferred();
  let calls = 0;
  store.mutate = async (...args) => {
    if (++calls === 1) {
      entered.resolve();
      await hold.promise;
    }
    return original(...args);
  };
  unblock = hold.resolve;
  return {
    store,
    gate,
    auth,
    session,
    server,
    origin,
    headers,
    request,
    project,
    entered,
    unblock,
    get calls() {
      return calls;
    },
  };
}
test("HTTP bounds all mutation endpoints before JSON buffering; reads/logout stay available; successful queued commits retain audit and revisions", async (t) => {
  const f = await fixture(t);
  const before = await f.store.read();
  const first = f.request("/changes", f.project("first"));
  await f.entered.promise;
  const second = f.request("/changes", f.project("second"));
  await wait(() => f.gate.counts.pending === 1);
  for (const url of [
    "/changes",
    "/CHANGES/",
    "/leaders/change",
    "/allocations/reset",
    "/resources/import",
    "/restore",
    "/users",
  ]) {
    const r = await f.request(url, "{");
    assert.equal(r.status, 503, url);
    assert.equal(r.retryAfter, "1");
    assert.match(r.body.error, /kaydedilmedi/);
  }
  assert.equal((await f.request("/data")).status, 200);
  assert.equal((await f.request("/auth/me")).status, 200);
  const other = await f.session();
  assert.equal(
    (await f.request("/auth/logout", {}, { auth: other })).status,
    200,
  );
  assert.equal((await f.store.read()).generation, before.generation);
  assert.equal(f.calls, 1);
  f.unblock();
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
  const after = await f.store.read();
  assert.equal(after.generation, before.generation + 2);
  assert.equal(after.data.revisions["project:first"], 1);
  assert.equal(after.data.revisions["project:second"], 1);
  assert.equal(
    (await f.store.auditLog(await f.store.findUser({ id: "test-admin" })))
      .total,
    2,
  );
  assert.equal(f.gate.counts.active, 0);
});
test("HTTP queue timeout rejects before mutation; bad auth/CSRF do not consume queue places", async (t) => {
  const f = await fixture(t, { waitMs: 100 });
  const first = f.request("/changes", f.project("first"));
  await f.entered.promise;
  assert.equal(
    (await f.request("/changes", "{", { auth: { cookie: "", csrf: "" } }))
      .status,
    401,
  );
  assert.equal(
    (await f.request("/changes", "{", { auth: { ...f.auth, csrf: "wrong" } }))
      .status,
    403,
  );
  assert.equal(f.gate.counts.pending, 0);
  assert.equal((await f.request("/changes", f.project("timeout"))).status, 503);
  assert.equal(f.calls, 1);
  f.unblock();
  await first;
  await delay(120);
  assert.equal(f.calls, 1);
  assert(!(await f.store.read()).data.projects.some((p) => p.id === "timeout"));
});
test("queued requests reauthenticate after logout instead of writing with their earlier session", async (t) => {
  const f = await fixture(t);
  const first = f.request("/changes", f.project("first"));
  await f.entered.promise;
  const other = await f.session();
  const second = f.request("/changes", f.project("revoked"), { auth: other });
  await wait(() => f.gate.counts.pending === 1);
  await f.store.deleteSession(other.id);
  f.unblock();
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 401);
  assert.equal(f.calls, 1);
  assert.equal(f.gate.counts.active, 0);
});
test("disconnect cancels queued work, but an executing write keeps its place until commit", async (t) => {
  const f = await fixture(t);
  const active = new AbortController();
  const first = f.request("/changes", f.project("first"), {
    signal: active.signal,
  });
  const firstRejected = assert.rejects(first, { name: "AbortError" });
  await f.entered.promise;
  const queued = new AbortController();
  const second = f.request("/changes", f.project("cancelled"), {
    signal: queued.signal,
  });
  const secondRejected = assert.rejects(second, { name: "AbortError" });
  await wait(() => f.gate.counts.pending === 1);
  queued.abort();
  await secondRejected;
  await wait(() => f.gate.counts.pending === 0);
  active.abort();
  await firstRejected;
  assert.equal(f.gate.counts.active, 1);
  const third = f.request("/changes", f.project("third"));
  await wait(() => f.gate.counts.pending === 1);
  assert.equal(f.calls, 1);
  f.unblock();
  assert.equal((await third).status, 200);
  const d = (await f.store.read()).data;
  assert(d.projects.some((p) => p.id === "first"));
  assert(d.projects.some((p) => p.id === "third"));
  assert(!d.projects.some((p) => p.id === "cancelled"));
  assert.equal(f.calls, 2);
  assert.equal(f.gate.counts.active, 0);
});
test("malformed bodies and unknown routes release admission; a stalled pre-handler body is destroyed without starting a write", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request("/changes", "{")).status, 400);
  assert.equal((await f.request("/unknown", {})).status, 404);
  assert.equal(f.gate.counts.active, 0);
  const ended = new Promise((resolve) => {
    const req = http.request(
      f.origin + "/api/changes",
      { method: "POST", headers: { ...f.headers(), "Content-Length": "100" } },
      (res) => {
        res.resume();
        res.on("end", () => resolve("response"));
      },
    );
    req.on("error", () => resolve("closed"));
    req.write("{");
  });
  await wait(() => f.gate.counts.active === 1);
  assert.equal(await ended, "closed");
  await wait(() => f.gate.counts.active === 0);
  assert.equal(f.calls, 0);
  f.unblock();
  assert.equal(
    (await f.request("/changes", f.project("after-timeout"))).status,
    200,
  );
});

test("a failed transaction releases its lease only after rollback and allows the queued commit", async (t) => {
  const f = await fixture(t);
  const before = await f.store.read();
  const invalid = f.project("invalid");
  invalid.changes[0].value.name = "";
  const first = f.request("/changes", invalid);
  await f.entered.promise;
  const second = f.request("/changes", f.project("valid"));
  await wait(() => f.gate.counts.pending === 1);
  f.unblock();
  assert.equal((await first).status, 400);
  assert.equal((await second).status, 200);
  const after = await f.store.read();
  assert.equal(after.generation, before.generation + 1);
  assert(!after.data.projects.some((p) => p.id === "invalid"));
  assert.equal(after.data.revisions["project:valid"], 1);
  assert.equal(f.gate.counts.active, 0);
});
