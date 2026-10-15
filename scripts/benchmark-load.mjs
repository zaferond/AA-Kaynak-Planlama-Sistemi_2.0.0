import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { Store } from "../backend/store.mjs";
import { createApp } from "../backend/app.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { seedBenchmarkStore } from "./benchmark-fixture.mjs";

// No .env, provider or existing database argument. Only temporary synthetic data.
const options = new Map(
  process.argv.slice(2).map((arg) => {
    const match =
      /^--(samples|size|resources|actuals|percentages|calendar-days|roles|output)=(.+)$/.exec(
        arg,
      );
    if (!match)
      throw Error(
        "Use --samples=7 --size=100000 --resources=400 --actuals=48000 --percentages=48000 --calendar-days=2000 --roles=admin,manager,normal --output=/tmp/result.json",
      );
    return [match[1], match[2]];
  }),
);
const integer = (key, fallback, min, max) => {
  const value = Number(options.get(key) ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw Error(`Invalid --${key}: ${min}–${max}.`);
  return value;
};
const samples = integer("samples", 7, 1, 20);
const size = integer("size", 100000, 1, 100000);
const resources = integer("resources", 400, 1, 10000);
const actuals = integer("actuals", 48000, 0, 100000);
const percentages = integer("percentages", actuals, 0, actuals);
const calendarDays = integer("calendar-days", 2000, 0, 100000);
const roles = (options.get("roles") || "admin").split(",");
if (
  !roles.length ||
  new Set(roles).size !== roles.length ||
  roles.some((role) => !["admin", "manager", "normal"].includes(role))
)
  throw Error("Expected unique --roles=admin,manager,normal.");
const unzip = promisify(gunzip);
const round = (value) => Math.round(value * 100) / 100;
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length / 2) - 1];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-load-benchmark-"));
const store = new Store({
  env: {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
  },
});
const server = http.createServer();
let app, current;
const originalView = store.view,
  originalRead = store.read,
  originalProjection = store.projectView;
const originalRaw = store.db.raw;
store.db.raw = function (sql, values, consume) {
  const result = originalRaw.call(this, sql, values, consume);
  if (current && /^SELECT\b/i.test(sql)) {
    const name = /\bFROM\s+\[?(kp_[a-z_]+)\]?/i.exec(sql)?.[1];
    if (name)
      current.sqlRows[name] = (current.sqlRows[name] || 0) + result.rowCount;
  }
  return result;
};
store.view = async function (...args) {
  const start = performance.now();
  try {
    return await originalView.apply(this, args);
  } finally {
    if (current) current.viewMs += performance.now() - start;
  }
};
store.read = async function (...args) {
  const start = performance.now();
  try {
    return await originalRead.apply(this, args);
  } finally {
    if (current) {
      current.readMs += performance.now() - start;
      current.readCalls++;
    }
  }
};
store.projectView = async function (...args) {
  const start = performance.now();
  try {
    return await originalProjection.apply(this, args);
  } finally {
    if (current) current.projectMs += performance.now() - start;
  }
};
const results = [];
try {
  await store.connect();
  const password = "Synthetic-load-test-only-284!";
  await seedBenchmarkStore(store, size, {
    resources,
    actuals,
    percentages,
    calendarDays,
  });
  const leader = (await store.read()).data.teams.find((team) => team.lead).lead;
  const hashed = await hashPassword(password);
  for (const role of roles) {
    await store.bootstrapUser({
      _id: "bench-" + role,
      username: "bench." + role,
      name: "Synthetic " + role,
      role,
      leaders: role === "admin" ? [] : [leader],
      resourceId: role === "normal" ? "bench-r0" : "",
      active: true,
      password: hashed,
      revision: 1,
      version: 1,
    });
  }
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port;
  app = createApp(store, { origin });
  server.on("request", app);
  for (const role of roles) {
    const user = await store.findUser({ id: "bench-" + role });
    const expected = JSON.parse(JSON.stringify(await store.view(user)));
    // Reference the full read, independently of any view-only SQL narrowing.
    const reference = await store.transaction(async (c) => {
      const { data, generation } = await originalRead.call(store, c);
      return originalProjection.call(store, data, generation, user, c);
    }, true);
    assert.deepEqual(expected, JSON.parse(JSON.stringify(reference)));
    const expectedBytes = Buffer.from(JSON.stringify(expected));
    const login = await fetch(origin + "/api/auth/login", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-Requested-With": "KaynakPortal",
      },
      body: JSON.stringify({ username: user.username, password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    await login.json();
    async function load(encoding) {
      const start = performance.now();
      return new Promise((resolve, reject) => {
        const request = http.get(
          origin + "/api/data",
          {
            agent: false,
            headers: { Cookie: cookie, "Accept-Encoding": encoding },
          },
          (response) => {
            const headersMs = performance.now() - start,
              chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("error", reject);
            response.on("end", () =>
              resolve({
                status: response.statusCode,
                headers: response.headers,
                bytes: Buffer.concat(chunks),
                headersMs,
                httpMs: performance.now() - start,
              }),
            );
          },
        );
        request.on("error", reject);
      });
    }
    // Alternate encodings within each sample to reduce fixed run-order effects.
    for (const encoding of ["identity", "gzip"]) await load(encoding);
    const observations = { identity: [], gzip: [] };
    for (let i = 0; i < samples; i++) {
      for (const encoding of i % 2
        ? ["gzip", "identity"]
        : ["identity", "gzip"]) {
        const observation = (current = {
          readMs: 0,
          viewMs: 0,
          projectMs: 0,
          readCalls: 0,
          sqlRows: {},
        });
        const response = await load(encoding);
        current = undefined;
        assert.equal(response.status, 200);
        assert.equal(response.headers["cache-control"], "no-store");
        const decodeStart = performance.now();
        const decoded =
          response.headers["content-encoding"] === "gzip"
            ? await unzip(response.bytes)
            : response.bytes;
        observation.decodeMs = performance.now() - decodeStart;
        const parseStart = performance.now(),
          value = JSON.parse(decoded);
        observation.parseMs = performance.now() - parseStart;
        assert.deepEqual(value, expected);
        assert.equal(digest(decoded), digest(expectedBytes));
        observations[encoding].push({
          ...observation,
          headersMs: response.headersMs,
          httpMs: response.httpMs,
          wireBytes: response.bytes.length,
          decodedBytes: decoded.length,
          contentEncoding: response.headers["content-encoding"] || "identity",
          snapshotSha256: digest(decoded),
        });
      }
    }
    for (const encoding of ["identity", "gzip"]) {
      const rows = observations[encoding];
      results.push({
        role,
        requestedEncoding: encoding,
        contentEncoding: rows[0].contentEncoding,
        wireBytes: rows[0].wireBytes,
        decodedBytes: rows[0].decodedBytes,
        snapshotSha256: rows[0].snapshotSha256,
        readCalls: rows[0].readCalls,
        sqlRows: rows[0].sqlRows,
        medians: Object.fromEntries(
          [
            "httpMs",
            "headersMs",
            "viewMs",
            "readMs",
            "projectMs",
            "decodeMs",
            "parseMs",
          ].map((key) => [key, round(median(rows.map((row) => row[key])))]),
        ),
        observations: rows,
      });
    }
    assert.deepEqual(
      JSON.parse(JSON.stringify(await store.view(user))),
      expected,
    );
  }
} finally {
  current = undefined;
  app?.locals.close();
  if (server.listening) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await store.close();
  await fs.rm(dir, { recursive: true, force: true });
}
const report = {
  measuredAt: new Date().toISOString(),
  node: process.version,
  provider: "sqljs",
  samples,
  size,
  resources,
  actuals,
  percentages,
  calendarDays,
  roles,
  scope:
    "Synthetic authenticated first data load over local raw HTTP. Includes auth lookup, SQL view, response encoding and local transfer. Decode/JSON parsing measured separately; no browser, WAN, native MSSQL, peak memory or concurrent capacity claim.",
  sourceSha256: Object.fromEntries(
    await Promise.all(
      [
        "backend/app.mjs",
        "backend/data-response.mjs",
        "backend/store.mjs",
        "backend/identity-repository.mjs",
        "backend/planning-reader.mjs",
        "backend/planning-writer.mjs",
        "backend/schema-migrations.mjs",
        "backend/migration-catalog.mjs",
        "backend/read-records.mjs",
        "shared/access.ts",
        "shared/model.ts",
        "shared/records.ts",
        "scripts/benchmark-load.mjs",
        "scripts/benchmark-fixture.mjs",
      ].map(async (name) => [
        name,
        digest(await fs.readFile(new URL("../" + name, import.meta.url))),
      ]),
    ),
  ),
  results,
};
console.log(JSON.stringify(report));
if (options.has("output"))
  await fs.writeFile(
    path.resolve(options.get("output")),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
