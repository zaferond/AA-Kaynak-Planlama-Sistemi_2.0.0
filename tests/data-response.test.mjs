import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { sendDataSnapshot } from "../backend/data-response.mjs";
import { createApp } from "../backend/app.mjs";
import { Store } from "../backend/store.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { seedBenchmarkStore } from "../scripts/benchmark-fixture.mjs";

const zip = promisify(gzip),
  unzip = promisify(gunzip);
const large = {
  generation: 7,
  data: { text: "Türkçe <not> & eğitim 📅 ".repeat(3000) },
};
async function listen(t, app) {
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    app?.locals.close?.();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return "http://127.0.0.1:" + server.address().port;
}
function raw(
  origin,
  { encoding, cookie, method = "GET", pathname = "/data" } = {},
) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      origin + pathname,
      {
        method,
        agent: false,
        headers: {
          ...(encoding === undefined ? {} : { "Accept-Encoding": encoding }),
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}
const decoded = async (response) =>
  response.headers["content-encoding"] === "gzip"
    ? unzip(response.body)
    : response.body;

test("large snapshot gzip negotiation preserves Express JSON representation and headers", async (t) => {
  const app = express();
  app.set("json spaces", 2);
  app.set("json escape", true);
  app.set("json replacer", (key, value) =>
    key === "generation" ? value + 1 : value,
  );
  app.get("/data", (req, res) => {
    res.set("Cache-Control", "no-store");
    return sendDataSnapshot(req, res, large);
  });
  const origin = await listen(t, app);
  const identity = await raw(origin, { encoding: "identity" });
  for (const [encoding, expected] of [
    [undefined, undefined],
    ["identity", undefined],
    ["gzip", "gzip"],
    ["gzip;q=0", undefined],
    ["gzip;q=0.2, identity;q=1", undefined],
    ["gzip;q=1, identity;q=0.2", "gzip"],
    ["br;q=1, identity;q=0.5", undefined],
    ["gzip, identity;q=0", "gzip"],
    ["*", "gzip"],
  ]) {
    const response = await raw(origin, { encoding });
    assert.equal(response.status, 200);
    assert.equal(response.headers["content-encoding"], expected);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.match(response.headers.vary, /(?:^|,\s*)Accept-Encoding(?:,|$)/);
    assert.match(response.headers["content-type"], /application\/json.*utf-8/);
    assert.equal(
      Number(response.headers["content-length"]),
      response.body.length,
    );
    assert.deepEqual(await decoded(response), identity.body);
    const parsed = JSON.parse(await decoded(response));
    assert.equal(parsed.generation, 8);
    assert.equal(parsed.data.text, large.data.text);
  }
  const rejected = await raw(origin, {
    encoding: "gzip;q=0, identity;q=0, *;q=0",
  });
  assert.equal(rejected.status, 406);
  assert.equal(rejected.headers["content-encoding"], undefined);
  const head = await raw(origin, { encoding: "gzip", method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers["content-encoding"], "gzip");
  assert.equal(head.body.length, 0);
  assert(Number(head.headers["content-length"]) > 0);
});

test("small snapshots skip gzip unless identity is explicitly forbidden", async (t) => {
  const snapshot = { generation: 1, data: { text: "Short" } };
  const app = express();
  let calls = 0;
  app.get("/data", (req, res) =>
    sendDataSnapshot(req, res, snapshot, {
      compress: async (...args) => {
        calls++;
        return zip(...args);
      },
    }),
  );
  const origin = await listen(t, app);
  const small = await raw(origin, { encoding: "gzip" });
  assert.equal(small.headers["content-encoding"], undefined);
  assert.equal(calls, 0);
  const forced = await raw(origin, { encoding: "gzip, identity;q=0" });
  assert.equal(forced.headers["content-encoding"], "gzip");
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(await decoded(forced)), snapshot);
});

test("an expanded gzip response falls back to identity only when permitted", async (t) => {
  const app = express();
  app.get("/data", (req, res) =>
    sendDataSnapshot(req, res, large, {
      compress: (body) => zip(body, { level: 0 }),
    }),
  );
  const origin = await listen(t, app);
  const plain = await raw(origin, { encoding: "identity" });
  const fallback = await raw(origin, { encoding: "gzip" });
  assert.equal(fallback.headers["content-encoding"], undefined);
  assert.deepEqual(fallback.body, plain.body);
  const forced = await raw(origin, { encoding: "gzip, identity;q=0" });
  assert.equal(forced.headers["content-encoding"], "gzip");
  assert(forced.body.length > plain.body.length);
  assert.deepEqual(await decoded(forced), plain.body);
});

test("failed compression cannot send a partial gzip response or snapshot", async (t) => {
  const app = express();
  app.get("/data", (req, res) =>
    sendDataSnapshot(req, res, large, {
      compress: async () => {
        throw Error("Compression failed");
      },
    }),
  );
  app.use((_error, _req, res, _next) =>
    res.status(500).json({ error: "Load failed" }),
  );
  const origin = await listen(t, app);
  const response = await raw(origin, { encoding: "gzip" });
  assert.equal(response.status, 500);
  assert.equal(response.headers["content-encoding"], undefined);
  assert.deepEqual(JSON.parse(response.body), { error: "Load failed" });
});

test("a pending gzip response retains its snapshot and subsequent loads see the latest generation", async (t) => {
  let snapshot = structuredClone(large),
    started,
    release;
  const compressionStarted = new Promise((resolve) => {
    started = resolve;
  });
  const compressionAllowed = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const app = express();
  app.get("/data", (req, res) =>
    sendDataSnapshot(req, res, snapshot, {
      compress: async (...args) => {
        if (++calls === 1) {
          started();
          await compressionAllowed;
        }
        return zip(...args);
      },
    }),
  );
  const origin = await listen(t, app);
  const first = raw(origin, { encoding: "gzip" });
  await compressionStarted;
  snapshot.generation++;
  snapshot.data.text = "Updated ".repeat(10000);
  release();
  const initial = JSON.parse(await decoded(await first));
  assert.deepEqual(initial, large);
  const latest = JSON.parse(
    await decoded(await raw(origin, { encoding: "gzip" })),
  );
  assert.deepEqual(latest, snapshot);
});

test("completed compression does not write to a disconnected response", async () => {
  let sent = false,
    started,
    release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const req = {
    acceptsEncodings: (...values) =>
      values.includes("gzip") ? "gzip" : "identity",
  };
  const res = {
    destroyed: false,
    writableEnded: false,
    vary() {},
    app: { get() {} },
    set() {
      sent = true;
    },
    type() {
      return this;
    },
    send() {
      sent = true;
    },
  };
  const pending = sendDataSnapshot(req, res, large, {
    compress: async () => {
      started();
      await waiting;
      return Buffer.from("compressed");
    },
  });
  await ready;
  res.destroyed = true;
  release();
  await pending;
  assert.equal(sent, false);
  await sendDataSnapshot(req, res, large, {
    compress: () => {
      throw Error("Disconnected request must not compress");
    },
  });
});

test("authenticated compressed loads preserve all role scopes, fresh generations and revoked-session checks", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-compressed-load-"));
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
  await seedBenchmarkStore(store, 5000, {
    resources: 20,
    actuals: 200,
    percentages: 200,
    calendarDays: 20,
  });
  const team = (await store.read()).data.teams.find((item) => item.lead);
  const password = "Compressed-load-test-only-284!",
    hashed = await hashPassword(password);
  const users = {};
  for (const role of ["admin", "manager", "normal"]) {
    await store.bootstrapUser({
      _id: role,
      username: "load." + role,
      name: role,
      role,
      leaders: role === "admin" ? [] : [team.lead],
      resourceId: role === "normal" ? "bench-r0" : "",
      active: true,
      password: hashed,
      revision: 1,
      version: 1,
    });
    users[role] = await store.findUser({ id: role });
  }
  const server = http.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port;
  const app = createApp(store, { origin });
  server.on("request", app);
  t.after(async () => {
    app.locals.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const sessions = {};
  for (const role of ["admin", "manager", "normal"]) {
    const login = await fetch(origin + "/api/auth/login", {
      method: "POST",
      headers: {
        Origin: origin,
        "X-Requested-With": "KaynakPortal",
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip",
      },
      body: JSON.stringify({ username: users[role].username, password }),
    });
    assert.equal(login.status, 200);
    assert.equal(login.headers.get("content-encoding"), null);
    const auth = await login.json(),
      cookie = login.headers.get("set-cookie").split(";")[0];
    sessions[role] = { cookie, csrf: auth.csrf };
    const plain = await raw(origin, {
      pathname: "/api/data",
      encoding: "identity",
      cookie,
    });
    const zipped = await raw(origin, {
      pathname: "/api/data",
      encoding: "gzip, identity;q=0",
      cookie,
    });
    assert.equal(plain.status, 200);
    assert.equal(zipped.status, 200);
    assert.equal(zipped.headers["content-encoding"], "gzip");
    assert.deepEqual(await decoded(zipped), plain.body);
    const view = JSON.parse(await decoded(zipped));
    assert.deepEqual(
      view,
      JSON.parse(JSON.stringify(await store.view(users[role]))),
    );
    assert.equal(view.data.users !== undefined, role === "admin");
    assert.equal(JSON.stringify(view).includes('"password"'), false);
    assert.equal(JSON.stringify(view).includes('"hash"'), false);
    if (role !== "admin") {
      assert.equal(
        view.data.actualAllocations["bench-r1|bench-p0|2026-01"],
        undefined,
      );
      assert.equal(
        view.data.personCalendar["bench-r1|2026-01-01|leave"],
        undefined,
      );
      assert.equal(view.data.actualTeamTotals !== undefined, true);
    }
    const auto = await fetch(origin + "/api/data", {
      headers: { Cookie: cookie },
    });
    assert.deepEqual(await auto.json(), view);
    const me = await raw(origin, {
      pathname: "/api/auth/me",
      encoding: "gzip",
      cookie,
    });
    assert.equal(me.headers["content-encoding"], undefined);
    assert.equal(JSON.parse(me.body).csrf, auth.csrf);
  }
  const noSession = await raw(origin, {
    pathname: "/api/data",
    encoding: "gzip",
  });
  assert.equal(noSession.status, 401);
  assert.equal(noSession.headers["content-encoding"], undefined);
  const auth = sessions.admin;
  const before = await store.view(users.admin);
  const key = Object.keys(before.data.allocations)[0];
  const write = await fetch(origin + "/api/changes", {
    method: "POST",
    headers: {
      Cookie: auth.cookie,
      Origin: origin,
      "Content-Type": "application/json",
      "X-Requested-With": "KaynakPortal",
      "X-CSRF-Token": auth.csrf,
      "Accept-Encoding": "gzip",
    },
    body: JSON.stringify({
      changes: [{ kind: "allocation", id: key, revision: 1, value: 0.5 }],
    }),
  });
  assert.equal(write.status, 200);
  assert.equal(write.headers.get("content-encoding"), null);
  await write.json();
  const latest = JSON.parse(
    await decoded(
      await raw(origin, {
        pathname: "/api/data",
        encoding: "gzip",
        cookie: auth.cookie,
      }),
    ),
  );
  assert.equal(latest.generation, before.generation + 1);
  assert.equal(latest.data.allocations[key], 0.5);
  assert.deepEqual(latest, await store.view(users.admin));
  const backup = await raw(origin, {
    pathname: "/api/backup",
    encoding: "gzip",
    cookie: auth.cookie,
  });
  assert.equal(backup.status, 200);
  assert.equal(backup.headers["content-encoding"], undefined);
  await store.transaction((c) =>
    store.saveUser({ ...users.normal, active: false, version: 2 }, c),
  );
  const disabled = await raw(origin, {
    pathname: "/api/data",
    encoding: "gzip",
    cookie: sessions.normal.cookie,
  });
  assert.equal(disabled.status, 401);
  assert.equal(disabled.headers["content-encoding"], undefined);
});
