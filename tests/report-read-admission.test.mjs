import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { setImmediate } from "node:timers/promises";
import { ReportReadAdmission } from "../backend/report-read-admission.mjs";
import { createApp } from "../backend/app.mjs";
import { digest } from "../backend/auth.mjs";
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

test("report admission enforces per-account/global limits and releases slots once without retaining user IDs", () => {
  for (const options of [
    { activeLimit: 0 },
    { activeLimit: 9 },
    { perUserLimit: 0 },
    { perUserLimit: 1.5 },
    { activeLimit: 1, perUserLimit: 2 },
  ])
    assert.throws(() => new ReportReadAdmission(options));
  const gate = new ReportReadAdmission({ activeLimit: 2, perUserLimit: 1 });
  assert.throws(() => gate.acquire(""));
  const a = gate.acquire("a");
  assert.throws(() => gate.acquire("a"), { status: 429, retryAfter: 1 });
  const b = gate.acquire("b");
  assert.throws(() => gate.acquire("c"), { status: 503, retryAfter: 1 });
  a();
  a();
  b();
  assert.deepEqual(gate.counts, { active: 0, users: 0 });
});

test("HTTP report bounds share both endpoints, preserve other reads, retain disconnected in-flight work and release after errors", async (t) => {
  const gate = new ReportReadAdmission({ activeLimit: 2, perUserLimit: 1 });
  const enteredA = deferred(),
    enteredB = deferred(),
    holdA = deferred(),
    holdB = deferred();
  const store = {
    provider: "sqljs",
    async session(id) {
      for (const userId of ["a", "b", "c"])
        if (id === digest("synthetic-" + userId))
          return { _id: id, userId, userVersion: 1, csrf: "synthetic" };
    },
    async findUser({ id }) {
      return {
        _id: id,
        username: id,
        name: "Synthetic",
        role: "admin",
        leaders: [],
        active: true,
        version: 1,
      };
    },
    async generation() {
      return 7;
    },
    async cleanupSessions() {},
    async actualView() {
      enteredA.resolve();
      await holdA.promise;
      return { data: {} };
    },
    async activityReport() {
      enteredB.resolve();
      await holdB.promise;
      return { rows: [] };
    },
  };
  const server = http.createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  const app = createApp(store, { origin, reportReadGate: gate });
  server.on("request", app);
  t.after(async () => {
    holdA.resolve();
    holdB.resolve();
    app.locals.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  async function request(url, id, signal) {
    const response = await fetch(origin + "/api" + url, {
      headers: { Cookie: "kp_session=synthetic-" + id },
      signal,
    });
    return {
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
      json: await response.json(),
    };
  }
  const actual = "/actual-view?start=2026-01&count=3",
    activity = "/activity-report?start=2026-01&count=3";
  const controller = new AbortController();
  const first = request(actual, "a", controller.signal).catch((e) => e);
  await enteredA.promise;
  const duplicate = await request(activity, "a");
  assert.equal(duplicate.status, 429);
  assert.equal(duplicate.retryAfter, "1");
  const second = request(activity, "b");
  await enteredB.promise;
  assert.equal((await request(actual, "c")).status, 503);
  assert.equal((await request("/auth/me", "a")).status, 200);
  assert.equal((await request("/version", "c")).status, 200);
  controller.abort();
  assert.equal((await first).name, "AbortError");
  assert.deepEqual(gate.counts, { active: 2, users: 2 });
  holdA.resolve();
  holdB.resolve();
  assert.equal((await second).status, 200);
  for (let i = 0; i < 20 && gate.counts.active; i++) await setImmediate();
  assert.deepEqual(gate.counts, { active: 0, users: 0 });
  assert.equal(
    (await request("/actual-view?start=bad&count=3", "a")).status,
    400,
  );
  assert.deepEqual(gate.counts, { active: 0, users: 0 });
  store.actualView = async () => {
    throw Object.assign(Error("Synthetic unavailable"), { status: 503 });
  };
  assert.equal((await request(actual, "a")).status, 503);
  assert.deepEqual(gate.counts, { active: 0, users: 0 });
  store.actualView = async () => ({ data: {} });
  assert.equal((await request(actual, "a")).status, 200);
});
