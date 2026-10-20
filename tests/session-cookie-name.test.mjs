import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { createApp } from "../backend/app.mjs";
import { hashPassword } from "../backend/auth.mjs";

test("aynı bilgisayardaki normal ve test ortamı çerezleri bağımsız giriş ve çıkış sağlar", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-cookie-test-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "test.sqlite"),
    },
  });
  const apps = [];
  t.after(async () => {
    for (const { app, server } of apps) {
      app.locals.close();
      await new Promise((resolve) => server.close(resolve));
    }
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await store.connect();
  const password = "Cookie-test-password-284!";
  await store.bootstrapUser({
    _id: "admin",
    username: "cookie.admin",
    name: "Cookie Test",
    role: "admin",
    leaders: [],
    active: true,
    password: await hashPassword(password),
    version: 1,
    revision: 1,
  });
  for (const sessionCookieName of ["kp_session", "kp_test_session"]) {
    const server = http.createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = "http://127.0.0.1:" + server.address().port;
    const app = createApp(store, { origin, sessionCookieName });
    server.on("request", app);
    apps.push({ app, server, origin });
  }
  async function request(index, url, body, cookie = "", csrf = "") {
    const { origin } = apps[index];
    const response = await fetch(origin + "/api" + url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: cookie,
        ...(body === undefined
          ? {}
          : {
              Origin: origin,
              "Content-Type": "application/json",
              "X-Requested-With": "KaynakPortal",
              "X-CSRF-Token": csrf,
            }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { response, status: response.status, json: await response.json() };
  }
  const normal = await request(0, "/auth/login", {
    username: "cookie.admin",
    password,
  });
  const sandbox = await request(1, "/auth/login", {
    username: "cookie.admin",
    password,
  });
  assert.equal(normal.status, 200);
  assert.equal(sandbox.status, 200);
  const normalCookie = normal.response.headers.get("set-cookie").split(";")[0],
    testCookie = sandbox.response.headers.get("set-cookie").split(";")[0];
  assert.ok(normalCookie.startsWith("kp_session="));
  assert.ok(testCookie.startsWith("kp_test_session="));
  const both = normalCookie + "; " + testCookie;
  assert.equal(
    (await request(0, "/auth/me", undefined, both)).json.sessionIdentity,
    normal.json.sessionIdentity,
  );
  assert.equal(
    (await request(1, "/auth/me", undefined, both)).json.sessionIdentity,
    sandbox.json.sessionIdentity,
  );
  const logout = await request(1, "/auth/logout", {}, both, sandbox.json.csrf);
  assert.equal(logout.status, 200);
  assert.ok(
    logout.response.headers.get("set-cookie").startsWith("kp_test_session="),
  );
  assert.equal((await request(0, "/auth/me", undefined, both)).status, 200);
  assert.equal((await request(1, "/auth/me", undefined, both)).status, 401);
});

test("geçersiz oturum çerezi adları reddedilir", () => {
  for (const sessionCookieName of [
    "",
    "bad cookie",
    "bad;cookie",
    "bad\r\ncookie",
    "x".repeat(65),
    null,
  ])
    assert.throws(
      () => createApp({}, { sessionCookieName }),
      /Geçersiz oturum çerezi adı/,
    );
});
