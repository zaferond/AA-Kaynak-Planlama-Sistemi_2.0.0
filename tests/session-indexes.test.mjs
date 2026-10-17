import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";

test("schema 41: a SQL.js database has the session indexes MSSQL always kept", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-session-index-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
    },
  });
  try {
    await store.connect();
    const names = (await store.db.query("PRAGMA index_list(kp_sessions)")).rows
      .map((row) => row.name)
      .sort();
    assert(names.includes("kp_sessions_user_idx"), names.join(","));
    assert(names.includes("kp_sessions_expiry_idx"), names.join(","));
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
