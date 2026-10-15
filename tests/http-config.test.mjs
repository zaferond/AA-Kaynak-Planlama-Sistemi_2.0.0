import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { applicationAddress, httpConfig } from "../backend/http-config.mjs";

test("application origin uses browser scheme, authority and default-port normalization", () => {
  for (const [input, origin, authority, secure] of [
    [
      "http://localhost:3000/",
      "http://localhost:3000",
      "localhost:3000",
      false,
    ],
    [
      " HTTPS://EXAMPLE.INVALID:443/ ",
      "https://example.invalid",
      "example.invalid",
      true,
    ],
    [
      "http://example.invalid:80",
      "http://example.invalid",
      "example.invalid",
      false,
    ],
    ["https://[::1]:8443/", "https://[::1]:8443", "[::1]:8443", true],
  ])
    assert.deepEqual(applicationAddress(input), { origin, authority, secure });
});

test("invalid origins fail without reflecting configured credentials or URL data", () => {
  const sensitive = "synthetic-private-marker";
  for (const value of [
    undefined,
    "",
    "https://",
    "example.invalid",
    "https:example.invalid",
    "ftp://example.invalid",
    "https://example.invalid:70000",
    `https://user:${sensitive}@example.invalid`,
    `https://example.invalid/${sensitive}`,
    `https://example.invalid?${sensitive}`,
    `https://example.invalid#${sensitive}`,
    "https://example.invalid?",
    "https://example.invalid#",
    "https://example.invalid/../",
    "https://example.invalid\\",
    "https://exam\nple.invalid",
  ])
    assert.throws(
      () => applicationAddress(value),
      (error) => {
        assert.match(error.message, /APP_ORIGIN/);
        assert(!error.message.includes(sensitive));
        assert.equal(error.cause, undefined);
        return true;
      },
    );
});

test("HTTP config requires production HTTPS, a valid listening port and explicit proxy addresses", () => {
  assert.deepEqual(httpConfig({}), {
    origin: "http://localhost:3000",
    port: 3000,
    host: "127.0.0.1",
    trustedProxies: [],
  });
  assert.deepEqual(
    httpConfig({
      NODE_ENV: "production",
      APP_ORIGIN: "HTTPS://EXAMPLE.INVALID:443/",
      PORT: " 8443 ",
      HOST: "127.0.0.1",
      TRUST_PROXY: "loopback,192.0.2.10/32",
    }),
    {
      origin: "https://example.invalid",
      port: 8443,
      host: "127.0.0.1",
      trustedProxies: ["loopback", "192.0.2.10/32"],
    },
  );
  assert.throws(() => httpConfig({ NODE_ENV: "production" }), /HTTPS/);
  for (const PORT of ["", "0", "-1", "65536", "1.5", "1e3", "0xBB8", "3000abc"])
    assert.throws(() => httpConfig({ PORT }), /PORT/);
  assert.throws(() => httpConfig({ TRUST_PROXY: "true" }), /TRUST_PROXY/);
});

test("server rejects HTTP configuration before constructing the database store", async (t) => {
  // Only the real server entry point and pure config are copied. The database,
  // password hashing and HTTP app are replaced by tripwires, not real services.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-http-preflight-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const name of [
    "backend",
    "shared",
    "scripts",
    "frontend/src",
    "frontend/components",
    "frontend/lib",
    "frontend/assets",
    "site",
  ])
    await fs.mkdir(path.join(dir, name), { recursive: true });
  await fs.copyFile(
    new URL("../scripts/deployment-manifest.mjs", import.meta.url),
    path.join(dir, "scripts/deployment-manifest.mjs"),
  );
  for (const [name, value] of Object.entries({
    "package.json": '{"version":"3.0.0"}',
    "package-lock.json": "{}",
    "baslat-mac.sh": "# synthetic",
    "baslat-windows.cmd": "rem synthetic",
    "frontend/package.json": "{}",
    "frontend/package-lock.json": "{}",
    "frontend/tsconfig.json": "{}",
    "frontend/build.mjs": "// synthetic",
    "frontend/styles.mjs": "// synthetic",
    "frontend/src/main.tsx": "// synthetic",
    "shared/server-domain.ts": "// synthetic",
    "scripts/verify-deployment.mjs": "// synthetic",
    "site/index.html": "synthetic site",
  }))
    await fs.writeFile(path.join(dir, name), value);
  for (const name of [
    "server.mjs",
    "http-config.mjs",
    "trusted-proxies.mjs",
    "mutation-admission.mjs",
  ])
    await fs.copyFile(
      new URL("../backend/" + name, import.meta.url),
      path.join(dir, "backend", name),
    );
  await fs.writeFile(
    path.join(dir, "shared/access.ts"),
    'export const ROOT_ADMIN_ID = "synthetic-admin";',
  );
  await fs.writeFile(
    path.join(dir, "backend/store.mjs"),
    `
    import fs from "node:fs";
    export class Store {
      constructor() {
        fs.writeFileSync("db-accessed.txt", "synthetic tripwire");
        throw Error("STORE_TRIPWIRE");
      }
    }
  `,
  );
  await fs.writeFile(
    path.join(dir, "backend/app.mjs"),
    'export function createApp() { throw Error("APP_TRIPWIRE"); }',
  );
  await fs.writeFile(
    path.join(dir, "backend/auth.mjs"),
    'export function hashPassword() { throw Error("PASSWORD_TRIPWIRE"); }',
  );
  const { deploymentSources, writeDeploymentManifest } =
    await import("../scripts/deployment-manifest.mjs");
  await writeDeploymentManifest(dir, await deploymentSources(dir));
  const run = async (settings) => {
    const env = {
      NODE_ENV: "production",
      APP_ORIGIN: "https://synthetic.invalid",
      ...settings,
    };
    for (const key of ["SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "TMPDIR"])
      if (process.env[key]) env[key] = process.env[key];
    try {
      await promisify(execFile)(process.execPath, ["backend/server.mjs"], {
        cwd: dir,
        env,
        timeout: 10000,
      });
      assert.fail("The isolated tripwire fixture must exit with an error");
    } catch (error) {
      assert.equal(error.code, 1);
      return error.stderr;
    }
  };
  for (const [settings, message] of [
    [{ APP_ORIGIN: "https://" }, /APP_ORIGIN/],
    [
      { APP_ORIGIN: "https://user:synthetic-private-marker@synthetic.invalid" },
      /APP_ORIGIN/,
    ],
    [{ APP_ORIGIN: "http://synthetic.invalid" }, /HTTPS/],
    [{ PORT: "65536" }, /PORT/],
    [{ TRUST_PROXY: "true" }, /TRUST_PROXY/],
    [{ MUTATION_ACTIVE_LIMIT: "synthetic-private-marker" }, /MUTATION/],
    [{ MUTATION_PENDING_LIMIT: "33" }, /kabul/],
  ]) {
    const stderr = await run(settings);
    assert.match(stderr, message);
    assert(!stderr.includes("synthetic-private-marker"));
    await assert.rejects(fs.access(path.join(dir, "db-accessed.txt")), {
      code: "ENOENT",
    });
  }
  // A valid config must reach the tripwire, proving that it was installed.
  assert.match(
    await run({ APP_ORIGIN: "HTTPS://SYNTHETIC.INVALID:443/" }),
    /STORE_TRIPWIRE/,
  );
  assert.equal(
    await fs.readFile(path.join(dir, "db-accessed.txt"), "utf8"),
    "synthetic tripwire",
  );
  await fs.rm(path.join(dir, "db-accessed.txt"));
  for (const file of [
    "deployment-manifest.json",
    "backend/app.mjs",
    "site/index.html",
  ]) {
    const original = await fs.readFile(path.join(dir, file));
    if (file === "deployment-manifest.json") await fs.rm(path.join(dir, file));
    else await fs.appendFile(path.join(dir, file), "\n// drift");
    const stderr = await run({ APP_ORIGIN: "HTTPS://SYNTHETIC.INVALID:443/" });
    assert.match(stderr, /dağıtım doğrulanamadı/);
    await assert.rejects(fs.access(path.join(dir, "db-accessed.txt")), {
      code: "ENOENT",
    });
    await fs.writeFile(path.join(dir, file), original);
  }
});
