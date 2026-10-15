import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { concurrencySuite } from "./concurrency-suite.mjs";

test("sql.js: concurrent HTTP mutations stay atomic and survive restart", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-concurrency-"));
  const env = {
    DB_PROVIDER: "sqljs",
    NODE_ENV: "test",
    SQLJS_FILE: path.join(dir, "test.sqlite"),
  };
  let store = new Store({ env });
  try {
    await store.connect();
    const result = await concurrencySuite(store, t);
    await t.test(
      "restart keeps committed values, revisions, generation and audit",
      async () => {
        await store.close();
        store = new Store({ env });
        await store.connect();
        const user = await store.findUser({ id: "concurrency-admin" });
        const view = await store.view(user);
        assert.deepEqual(view.data, result.data);
        assert.equal(view.generation, result.generation);
        assert.equal((await store.auditLog(user)).total, result.auditTotal);
      },
    );
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
