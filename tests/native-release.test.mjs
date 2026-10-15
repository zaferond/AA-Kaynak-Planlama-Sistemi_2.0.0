import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { checkedNativeContext } from "./mssql-native-suite.mjs";
import { nativeReleaseSuite } from "./native-release-suite.mjs";
import { nativeReleaseChecks } from "../scripts/native-evidence.mjs";

test("release checks exercise synthetic SQL.js behavior without claiming native pools or TLS", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-release-checks-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
    },
  });
  t.after(async () => {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await store.connect();
  const checks = await nativeReleaseSuite(
    [store, store],
    checkedNativeContext(t),
  );
  assert.deepEqual(
    checks,
    Object.fromEntries(
      nativeReleaseChecks.map((key) => [
        key,
        key !== "encryptedNativeConnection",
      ]),
    ),
  );
});
