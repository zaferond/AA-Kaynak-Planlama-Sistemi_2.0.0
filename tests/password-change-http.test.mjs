import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { Store } from "../backend/store.mjs";
import { createApp } from "../backend/app.mjs";
import { hashPassword, verifyPassword } from "../backend/auth.mjs";

const TEMPORARY = "Temporary-password-test-1!";
const CHOSEN = "Chosen-password-test-2!";

async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-password-http-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "test.sqlite"),
    },
  });
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const app = createApp(store, { origin });
  server.on("request", app);
  t.after(async () => {
    app.locals.close();
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await store.connect();
  await store.bootstrapUser({
    _id: "first-login",
    username: "qa.first",
    name: "QA First",
    role: "admin",
    resourceId: "",
    leaders: [],
    active: true,
    password: await hashPassword(TEMPORARY),
    mustChangePassword: true,
    revision: 1,
    version: 1,
  });
  async function request(url, body, auth = {}) {
    const response = await fetch(origin + "/api" + url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: auth.cookie || "",
        ...(body === undefined
          ? {}
          : {
              Origin: origin,
              "Content-Type": "application/json",
              "X-Requested-With": "KaynakPortal",
              "X-CSRF-Token": auth.csrf || "",
            }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, json: await response.json(), response };
  }
  const session = (result) => ({
    cookie: result.response.headers.get("set-cookie").split(";")[0],
    csrf: result.json.csrf,
  });
  async function login(password, remember = false) {
    const result = await request("/auth/login", {
      username: "qa.first",
      password,
      remember,
    });
    assert.equal(result.status, 200, JSON.stringify(result.json));
    return { ...session(result), user: result.json.user };
  }
  return { store, request, session, login };
}

test("a temporary password allows only the password change until it is replaced", async (t) => {
  const { store, request, session, login } = await setup(t);
  const first = await login(TEMPORARY);
  const other = await login(TEMPORARY);
  assert.equal(first.user.mustChangePassword, true);

  // Everything except session info, logout and the change itself is refused.
  const blocked = await request("/data", undefined, first);
  assert.equal(blocked.status, 403);
  assert.match(blocked.json.error, /şifrenizi değiştirin/);
  const me = await request("/auth/me", undefined, first);
  assert.equal(me.status, 200);
  assert.equal(me.json.user.mustChangePassword, true);

  // Wrong current password, the same password and a weak one are refused.
  for (const [body, pattern] of [
    [{ currentPassword: "wrong-password-123", newPassword: CHOSEN }, /şifre/i],
    [{ currentPassword: TEMPORARY, newPassword: TEMPORARY }, /aynı|farklı/i],
    [{ currentPassword: TEMPORARY, newPassword: "short" }, /10/],
  ]) {
    const refused = await request("/auth/password", body, first);
    assert(refused.status >= 400 && refused.status < 500, refused.status);
    assert.match(refused.json.error, pattern);
  }
  assert.equal(
    (await store.findUser({ id: "first-login" })).mustChangePassword,
    true,
  );

  const changed = await request(
    "/auth/password",
    { currentPassword: TEMPORARY, newPassword: CHOSEN },
    first,
  );
  assert.equal(changed.status, 200, JSON.stringify(changed.json));
  assert.equal(changed.json.user.mustChangePassword, undefined);
  const stored = await store.findUser({ id: "first-login" });
  assert.equal(stored.mustChangePassword, undefined);
  assert(await verifyPassword(CHOSEN, stored.password));

  // The response carries a new session; every earlier session is closed.
  const renewed = session(changed);
  assert.notEqual(renewed.cookie, first.cookie);
  assert.equal((await request("/data", undefined, renewed)).status, 200);
  assert.equal((await request("/auth/me", undefined, first)).status, 401);
  assert.equal((await request("/auth/me", undefined, other)).status, 401);

  // The temporary password no longer works; the chosen one does.
  const old = await request("/auth/login", {
    username: "qa.first",
    password: TEMPORARY,
  });
  assert.equal(old.status, 401);
  const next = await login(CHOSEN);
  assert.equal(next.user.mustChangePassword, undefined);
  assert.equal((await request("/data", undefined, next)).status, 200);
});

test("a password change keeps the session's remember choice", async (t) => {
  const { request, login } = await setup(t);
  for (const remember of [true, false]) {
    const auth = await login(remember ? TEMPORARY : CHOSEN, remember);
    const changed = await request(
      "/auth/password",
      {
        currentPassword: remember ? TEMPORARY : CHOSEN,
        newPassword: remember ? CHOSEN : TEMPORARY + "x",
      },
      auth,
    );
    assert.equal(changed.status, 200, JSON.stringify(changed.json));
    const cookie = changed.response.headers.get("set-cookie");
    assert.equal(/Max-Age=/i.test(cookie), remember, cookie);
  }
});
