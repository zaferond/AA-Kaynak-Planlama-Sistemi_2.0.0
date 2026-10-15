import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Store } from "../backend/store.mjs";
import { planningContractSuite } from "./planning-contract-suite.mjs";

test("SQL.js: planned cell contract preserves full validation dependencies, normalized commits, first errors and rollback", async (t) => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "aa-planning-contract-db-"),
  );
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
    },
  });
  try {
    await store.connect();
    await planningContractSuite(store, t);
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
