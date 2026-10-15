import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readWorkspaceStyles } from "../frontend/styles.mjs";

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-styles-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, "feature"));
  await fs.writeFile(path.join(dir, "z-base.css"), ".same { color: red; }\n");
  await fs.writeFile(
    path.join(dir, "feature/a-override.css"),
    ".same { color: blue; }\n",
  );
  return dir;
}
test("stylesheet assembly retains manifest precedence and produces one stylesheet", async (t) => {
  const dir = await fixture(t);
  const css = await readWorkspaceStyles(dir, [
    "z-base.css",
    "feature/a-override.css",
  ]);
  assert.equal(css, ".same { color: red; }\n\n.same { color: blue; }\n");
});
test("stylesheet assembly prevents silently omitted or missing feature styles", async (t) => {
  const dir = await fixture(t);
  await assert.rejects(
    () => readWorkspaceStyles(dir, ["z-base.css"]),
    /eklenmemiş.*feature\/a-override/,
  );
  await assert.rejects(
    () =>
      readWorkspaceStyles(dir, [
        "z-base.css",
        "feature/a-override.css",
        "missing.css",
      ]),
    /Bulunamayan.*missing/,
  );
});
test("stylesheet manifest rejects duplicates and paths outside its directory", async (t) => {
  const dir = await fixture(t);
  for (const files of [["../outside.css"], ["/absolute.css"], [], [null]])
    await assert.rejects(() => readWorkspaceStyles(dir, files), /göreli CSS/);
  await assert.rejects(
    () => readWorkspaceStyles(dir, ["z-base.css", "z-base.css"]),
    /birden fazla/,
  );
});
