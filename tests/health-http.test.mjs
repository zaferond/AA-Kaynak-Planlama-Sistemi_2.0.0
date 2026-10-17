import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { Store } from "../backend/store.mjs";
import { createApp } from "../backend/app.mjs";

async function serve(t, store, options = {}) {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const app = createApp(store, { origin, ...options });
  server.on("request", app);
  t.after(async () => {
    app.locals.close();
    await new Promise((resolve) => server.close(resolve));
  });
  return origin;
}

test("health answers without a session and reveals nothing else", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-health-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "test.sqlite"),
    },
  });
  t.after(async () => {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await store.connect();
  const origin = await serve(t, store);
  const response = await fetch(origin + "/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  // Other API routes still require a session.
  assert.equal((await fetch(origin + "/api/data")).status, 401);
});

test("health reports 503 when the database does not answer", async (t) => {
  const store = {
    generation: () => Promise.reject(Error("database down")),
    cleanupSessions: async () => {},
  };
  const origin = await serve(t, store);
  const response = await fetch(origin + "/api/health");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
});

test("slow API requests are logged without their query text", async (t) => {
  const lines = [];
  const store = {
    generation: () => new Promise((resolve) => setTimeout(resolve, 30)),
    cleanupSessions: async () => {},
  };
  const origin = await serve(t, store, {
    slowRequestMs: 20,
    log: (...parts) => lines.push(parts.join(" ")),
  });
  await fetch(origin + "/api/health?q=secret-search");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^Slow request GET \/api\/health 200 \d+ms$/);
  assert(!lines[0].includes("secret"));
});
