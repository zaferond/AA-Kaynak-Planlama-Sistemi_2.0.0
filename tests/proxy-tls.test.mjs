import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { Store } from "../backend/store.mjs";
import { createApp } from "../backend/app.mjs";
import { hashPassword } from "../backend/auth.mjs";

test("isolated TLS proxy preserves secure sessions, source checks and the connection IP login budget", async (t) => {
  // No .env, installed database, real account, external connection or global TLS override.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-proxy-tls-test-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
    },
  });
  let app, backend, proxy;
  t.after(async () => {
    app?.locals.close();
    for (const server of [proxy, backend])
      if (server?.listening) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-keyout",
      path.join(dir, "test-key.pem"),
      "-out",
      path.join(dir, "test-cert.pem"),
    ],
    { stdio: "ignore", timeout: 15000 },
  );
  const key = await fs.readFile(path.join(dir, "test-key.pem")),
    ca = await fs.readFile(path.join(dir, "test-cert.pem"));
  await store.connect();
  const password = "Synthetic-proxy-test-only-284!";
  await store.bootstrapUser({
    _id: "tls-test",
    username: "synthetic.proxy",
    name: "Synthetic proxy user",
    role: "admin",
    leaders: [],
    active: true,
    version: 1,
    revision: 1,
    password: await hashPassword(password),
  });
  backend = http.createServer();
  await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
  proxy = https.createServer({ key, cert: ca }, (req, res) => {
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: backend.address().port,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          // A fixed trusted proxy overwrites client-supplied forwarding claims.
          "x-forwarded-for": req.socket.remoteAddress,
          "x-forwarded-proto": "https",
        },
      },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const origin = "https://127.0.0.1:" + proxy.address().port;
  app = createApp(store, {
    origin: origin + "/",
    trustedProxies: ["127.0.0.1/32"],
  });
  backend.on("request", app);
  function request(route, { body, headers = {}, ...tls } = {}) {
    return new Promise((resolve, reject) => {
      const req = https.request(
        origin + route,
        {
          ca,
          rejectUnauthorized: true,
          servername: "localhost",
          method: body === undefined ? "GET" : "POST",
          headers: {
            Origin: origin,
            "X-Requested-With": "KaynakPortal",
            "Content-Type": "application/json",
            ...headers,
          },
          ...tls,
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: JSON.parse(Buffer.concat(chunks).toString()),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(
        body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
      );
    });
  }
  await assert.rejects(
    request("/api/auth/me", { ca: undefined }),
    /self.signed certificate/,
  );
  await assert.rejects(
    request("/api/auth/me", { servername: "wrong.invalid" }),
    { code: "ERR_TLS_CERT_ALTNAME_INVALID" },
  );
  const login = await request("/api/auth/login", {
    body: { username: "synthetic.proxy", password },
    headers: { "X-Forwarded-Proto": "http" },
  });
  assert.equal(login.status, 200);
  assert.equal(login.headers["strict-transport-security"], "max-age=31536000");
  const cookie = login.headers["set-cookie"][0];
  for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"])
    assert(cookie.includes(flag));
  const headers = {
    Cookie: cookie.split(";")[0],
    "X-CSRF-Token": login.body.csrf,
  };
  const me = await request("/api/auth/me", { headers });
  assert.equal(me.status, 200);
  assert.equal(me.headers["cache-control"], "no-store");
  assert.equal(me.body.sessionIdentity, login.body.sessionIdentity);
  const before = await store.generation();
  assert.equal(
    (
      await request("/api/changes", {
        body: { changes: [] },
        headers: { ...headers, Origin: "https://invalid.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/changes", {
        body: { changes: [] },
        headers: { ...headers, "X-CSRF-Token": "invalid" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/data", {
        headers: {
          ...headers,
          Host: "invalid.example",
          "X-Forwarded-Host": origin.slice(8),
        },
      })
    ).status,
    403,
  );
  assert.equal(await store.generation(), before);
  const logout = await request("/api/auth/logout", { body: {}, headers });
  assert.equal(logout.status, 200);
  assert(logout.headers["set-cookie"][0].includes("Secure"));
  assert.equal((await request("/api/auth/me", { headers })).status, 401);
  for (let i = 0; i < 60; i++)
    assert.equal(
      (
        await request("/api/auth/login", {
          body: {},
          headers: { "X-Forwarded-For": `192.0.2.${i + 1}` },
        })
      ).status,
      400,
    );
  const limited = await request("/api/auth/login", {
    body: {},
    headers: { "X-Forwarded-For": "192.0.2.200" },
  });
  assert.equal(limited.status, 429);
  assert(Number(limited.headers["retry-after"]) > 0);
});
