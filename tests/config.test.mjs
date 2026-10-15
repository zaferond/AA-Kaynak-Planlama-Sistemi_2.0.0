import test from "node:test";
import assert from "node:assert/strict";
import { sqlConfig } from "../backend/adapters/mssql.mjs";
import { Store } from "../backend/store.mjs";
test("Production TLS validation cannot be disabled; named instance and NTLM configuration", () => {
  assert.throws(
    () =>
      sqlConfig({
        NODE_ENV: "production",
        DB_TRUST_SERVER_CERTIFICATE: "true",
      }),
    /sertifika/,
  );
  assert.throws(
    () => new Store({ env: { NODE_ENV: "production", DB_PROVIDER: "sqljs" } }),
    /Canlı/,
  );
  const c = sqlConfig({
    DB_AUTH: "ntlm",
    DB_DOMAIN: "EXAMPLE",
    DB_USER: "test",
    DB_PASSWORD: "unused",
    DB_INSTANCE: "DEV",
  });
  assert.equal(c.authentication.type, "ntlm");
  assert.equal(c.options.instanceName, "DEV");
  assert.equal(c.port, undefined);
  assert.equal(c.options.encrypt, true);
  assert.equal(c.options.trustServerCertificate, false);
  assert.throws(() => sqlConfig({ DB_PORT: "abc" }), /DB_PORT/);
});
