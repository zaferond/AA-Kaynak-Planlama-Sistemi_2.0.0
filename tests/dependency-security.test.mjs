import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const frontendRequire = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const postcssRequire = createRequire(frontendRequire.resolve("postcss"));
const { SourceMapConsumer, SourceMapGenerator } =
  postcssRequire("source-map-js");
const flatMap = {
  version: 3,
  sources: ["synthetic.css"],
  names: [],
  mappings: "AAAA",
};
const indexed = (line, map = flatMap, column = 0) => ({
  version: 3,
  sections: [{ offset: { line, column }, map }],
});

test("PostCSS's installed source-map dependency rejects excessive, nested and invalid offsets before expansion", () => {
  // Only construct consumers: never expand malicious mappings into large text.
  for (const map of [
    indexed(1e9),
    indexed(6e6, indexed(6e6)),
    indexed(Infinity),
    indexed(-1),
    indexed(0.5),
    indexed("100"),
    indexed(0, flatMap, -1),
  ])
    assert.throws(() => new SourceMapConsumer(map), /offset/i);
});

test("the patched source-map dependency preserves ordinary CSS mapping round trips", () => {
  const generator = new SourceMapGenerator({ file: "synthetic.css" });
  generator.addMapping({
    generated: { line: 2, column: 0 },
    original: { line: 7, column: 2 },
    source: "kaynak.css",
  });
  generator.setSourceContent("kaynak.css", "/* Türkçe: ıİşğ */");
  const original = new SourceMapConsumer(generator.toJSON());
  const rebuilt = new SourceMapConsumer(
    SourceMapGenerator.fromSourceMap(original).toJSON(),
  );
  assert.deepEqual(rebuilt.originalPositionFor({ line: 2, column: 0 }), {
    source: "kaynak.css",
    line: 7,
    column: 2,
    name: null,
  });
  assert.equal(rebuilt.sourceContentFor("kaynak.css"), "/* Türkçe: ıİşğ */");
});

// M4 replaces the temporary literal-format mitigation with upstream removal.
// Both the lock and the installed mssql resolution must retain that removal.
const require = createRequire(import.meta.url);
const mssqlRequire = createRequire(require.resolve("mssql"));
const tediousRequire = createRequire(mssqlRequire.resolve("tedious"));

test("the locked dependency graph excludes sprintf-js and pins the reviewed Tedious release", async () => {
  const root = JSON.parse(
    await fs.readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const lock = JSON.parse(
    await fs.readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
  );
  assert.equal(root.overrides?.mssql?.tedious, "20.3.8");
  assert.equal(
    lock.packages["node_modules/tedious"].version,
    root.overrides.mssql.tedious,
  );
  for (const [name, pkg] of Object.entries(lock.packages)) {
    assert(
      !/(?:^|\/)node_modules\/sprintf-js$/.test(name),
      "Vulnerable package returned: " + name,
    );
    for (const field of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ])
      assert(
        !Object.hasOwn(pkg[field] || {}, "sprintf-js"),
        "Vulnerable dependency returned: " + name,
      );
  }
});

test("installed mssql resolves the locked Tedious version with no sprintf-js dependency or remaining imports", async () => {
  const lock = JSON.parse(
    await fs.readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
  );
  const pkg = mssqlRequire("tedious/package.json");
  assert.equal(pkg.version, lock.packages["node_modules/tedious"].version);
  assert.equal(pkg.dependencies["sprintf-js"], undefined);
  assert.throws(() => tediousRequire.resolve("sprintf-js"), {
    code: "MODULE_NOT_FOUND",
  });
  const lib = path.dirname(mssqlRequire.resolve("tedious"));
  for (const relative of await fs.readdir(lib, { recursive: true })) {
    if (!relative.endsWith(".js")) continue;
    const source = await fs.readFile(path.join(lib, relative), "utf8");
    assert(
      !/["']sprintf-js["']/.test(source),
      "Unexpected vulnerable import: " + relative,
    );
  }
});

test("Tedious Login7 debug output redacts synthetic passwords and preserves the serialized login payload", () => {
  const Login7Payload = tediousRequire("./login7-payload");
  const payload = new Login7Payload({
    tdsVersion: 0x74000004,
    packetSize: 4096,
    clientProgVer: 0,
    clientPid: 1,
    connectionId: 0,
    clientTimeZone: 0,
    clientLcid: 1033,
  });
  Object.assign(payload, {
    userName: "Synthetic %.101f Türkçe",
    password: "Synthetic-login-secret-only-284!",
    changePassword: "Synthetic-change-secret-only-284!",
    serverName: "sql.example.test",
    hostname: "synthetic",
    appName: "synthetic",
    libraryName: "synthetic",
    database: "synthetic_test",
    clientId: Buffer.alloc(6),
  });
  const before = payload.toBuffer();
  const debug = payload.toString();
  assert.equal(debug.includes(payload.password), false);
  assert.equal(debug.includes(payload.changePassword), false);
  assert.match(debug, /Password:'\*+'/);
  assert.match(debug, /ChangePassword:'\*+'/);
  assert(debug.includes(payload.userName));
  assert.deepEqual(payload.toBuffer(), before);
});

test("Tedious rejects encryption downgrade and requests TLS with certificate verification for ON and REQ", async () => {
  const { Connection } = tediousRequire("./tedious");
  const negotiate = Connection.prototype.performTlsNegotiation;
  let calls = 0;
  const context = {
    config: {
      server: "sql.example.test",
      options: { encrypt: true, trustServerCertificate: false },
    },
    secureContextOptions: { minVersion: "TLSv1.2" },
    STATE: { SENT_TLSSSLNEGOTIATION: "synthetic-tls-state" },
    transitionTo(state) {
      assert.equal(state, this.STATE.SENT_TLSSSLNEGOTIATION);
    },
    messageIo: {
      async startTls(options, hostname, trust) {
        calls++;
        assert.equal(options.minVersion, "TLSv1.2");
        assert.equal(hostname, "sql.example.test");
        assert.equal(trust, false);
      },
    },
  };
  for (const encryptionString of ["OFF", "NOT_SUP", undefined])
    await assert.rejects(
      negotiate.call(
        context,
        { encryptionString },
        new AbortController().signal,
      ),
      { code: "EENCRYPT" },
    );
  assert.equal(calls, 0);
  for (const encryptionString of ["ON", "REQ"])
    await negotiate.call(
      context,
      { encryptionString },
      new AbortController().signal,
    );
  assert.equal(calls, 2);
  // Only an in-memory protocol context is used: no Connection.connect, socket,
  // DNS, certificate file, SQL credentials or database is involved.
});
