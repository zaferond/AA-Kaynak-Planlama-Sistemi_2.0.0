import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { Store } from "../backend/store.mjs";
import { createApp } from "../backend/app.mjs";
import { hashPassword, digest } from "../backend/auth.mjs";
import { syntheticDirectory } from "./directory-fixture.mjs";

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve: (...args) => resolve(...args) };
};
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-directory-session-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
    },
  });
  const password = "Synthetic-session-only-284!";
  const directory = syntheticDirectory(password);
  const server = http.createServer();
  let app;
  t.after(async () => {
    app?.locals.close();
    server.closeAllConnections();
    if (server.listening) await new Promise((r) => server.close(r));
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await store.connect();
  const hashed = await hashPassword(password);
  for (const [index, role] of ["normal", "manager", "admin"].entries()) {
    const id = String(index + 1).repeat(32);
    const person = {
      id,
      username: "synthetic." + role,
      name: "Synthetic " + role,
      email: role + "@example.test",
    };
    directory.add(person);
    await store.bootstrapUser({
      _id: role,
      ...person,
      authSource: "ldap",
      directoryId: id,
      role,
      leaders: [],
      active: true,
      password: hashed,
      version: 1,
      revision: 1,
    });
  }
  await store.bootstrapUser({
    _id: "local",
    username: "synthetic.local",
    name: "Synthetic local admin",
    role: "admin",
    leaders: [],
    active: true,
    password: hashed,
    version: 1,
    revision: 1,
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  app = createApp(store, { origin, directory });
  server.on("request", app);
  async function request(url, auth = {}, body) {
    const response = await fetch(origin + "/api" + url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: auth.cookie || "",
        ...(body === undefined
          ? {}
          : {
              Origin: origin,
              "X-Requested-With": "KaynakPortal",
              "X-CSRF-Token": auth.csrf || "",
              "Content-Type": "application/json",
            }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, json: await response.json(), response };
  }
  async function login(role) {
    const result = await request(
      "/auth/login",
      {},
      {
        username: "synthetic." + role,
        password,
      },
    );
    assert.equal(result.status, 200);
    const cookie = result.response.headers.get("set-cookie").split(";")[0];
    return {
      cookie,
      csrf: result.json.csrf,
      id: digest(cookie.slice("kp_session=".length)),
    };
  }
  return { store, directory, request, login };
}

test("definitive AD denial revokes every session for that identity across roles and reopen; reactivation requires a fresh login", async (t) => {
  const f = await setup(t);
  const local = await f.login("local");
  const bystander = await f.login("manager");
  for (const [index, role] of ["normal", "manager", "admin"].entries()) {
    const first = await f.login(role);
    const second = await f.login(role);
    const before = await f.store.read();
    const userBefore = await f.store.findUser({ id: role });
    const id = String(index + 1).repeat(32);
    f.directory.disable(id);
    const denied = await f.request("/data", first);
    assert.equal(denied.status, 401);
    assert.equal(await f.store.session(first.id), undefined);
    assert.equal(await f.store.session(second.id), undefined);
    assert.match(
      denied.response.headers.get("set-cookie") || "",
      /kp_session=;/,
    );
    assert.deepEqual(await f.store.findUser({ id: role }), userBefore);
    assert.deepEqual(await f.store.read(), before);
    assert.equal((await f.request("/auth/me", local)).status, 200);
    if (role === "normal")
      assert.equal((await f.request("/auth/me", bystander)).status, 200);
    f.directory.enable(id);
    await f.store.close();
    await f.store.connect();
    for (const old of [first, second]) {
      for (const url of ["/auth/me", "/data", "/version"])
        assert.equal((await f.request(url, old)).status, 401);
      assert.equal(
        (await f.request("/changes", old, { changes: [] })).status,
        401,
      );
    }
    assert.equal(
      (await f.request("/auth/me", await f.login(role))).status,
      200,
    );
  }
});

test("transient AD outage denies access without revoking sessions or changing the account; recovery preserves existing sessions", async (t) => {
  const f = await setup(t);
  const first = await f.login("normal");
  const second = await f.login("normal");
  const local = await f.login("local");
  const before = await f.store.read();
  const user = await f.store.findUser({ id: "normal" });
  const sessions = await Promise.all(
    [first, second].map((s) => f.store.session(s.id)),
  );
  f.directory.setUnavailable(true);
  for (const auth of [first, second]) {
    const unavailable = await f.request("/data", auth);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.response.headers.get("set-cookie"), null);
  }
  assert.deepEqual(
    await Promise.all([first, second].map((s) => f.store.session(s.id))),
    sessions,
  );
  assert.deepEqual(await f.store.findUser({ id: "normal" }), user);
  assert.deepEqual(await f.store.read(), before);
  assert.equal((await f.request("/auth/me", local)).status, 200);
  f.directory.setUnavailable(false);
  for (const auth of [first, second])
    assert.equal((await f.request("/auth/me", auth)).status, 200);
});

test("an AD check already in flight cannot authorize a session revoked by a concurrent definitive denial", async (t) => {
  const f = await setup(t);
  const first = await f.login("normal");
  const second = await f.login("normal");
  const entered = deferred(),
    release = deferred();
  t.after(() => release.resolve());
  const ensureActive = f.directory.ensureActive.bind(f.directory);
  let held = false;
  f.directory.ensureActive = async (id) => {
    if (!held) {
      held = true;
      entered.resolve();
      await release.promise;
      return; // Simulate an older successful LDAP response completing late.
    }
    return ensureActive(id);
  };
  const pending = f.request("/auth/me", first);
  await entered.promise;
  f.directory.disable("1".repeat(32));
  try {
    assert.equal((await f.request("/data", second)).status, 401);
  } finally {
    release.resolve();
  }
  assert.equal((await pending).status, 401);
  f.directory.enable("1".repeat(32));
  assert.equal((await f.request("/auth/me", first)).status, 401);
});

test("failed durable session revocation rolls back and fails closed without reporting a successful invalidation", async (t) => {
  const f = await setup(t);
  const first = await f.login("normal");
  const second = await f.login("normal");
  const before = await f.store.read();
  const sessions = await Promise.all(
    [first, second].map((s) => f.store.session(s.id)),
  );
  const revoke = f.store.revokeUser.bind(f.store);
  const mock = t.mock.method(f.store, "revokeUser", async (id, c) => {
    await revoke(id, c);
    throw Error("Synthetic persistence failure");
  });
  f.directory.disable("1".repeat(32));
  const failed = await f.request("/data", first);
  assert.equal(failed.status, 500);
  assert.equal(failed.response.headers.get("set-cookie"), null);
  assert.equal(
    JSON.stringify(failed.json).includes("Synthetic persistence failure"),
    false,
  );
  assert.deepEqual(
    await Promise.all([first, second].map((s) => f.store.session(s.id))),
    sessions,
  );
  assert.deepEqual(await f.store.read(), before);
  mock.mock.restore();
  assert.equal((await f.request("/data", first)).status, 401);
  for (const auth of [first, second])
    assert.equal(await f.store.session(auth.id), undefined);
});
