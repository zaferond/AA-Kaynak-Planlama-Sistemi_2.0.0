import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { startupFixture } from "./startup-fixture.mjs";

test("production startup installs build dependencies, caches success and repairs missing packages/changed locks", async (t) => {
  const f = await startupFixture(t);
  const run = () => f.runTool("ensure-dependencies.mjs");
  assert.equal((await run()).code, 0);
  assert.deepEqual(
    (await f.commands()).map((entry) => entry.args),
    [
      ["ci", "--omit=dev"],
      ["ci", "--include=dev"],
    ],
  );
  await fs.access(
    path.join(f.root, "frontend/node_modules/build-probe/package.json"),
  );
  await assert.rejects(
    fs.access(path.join(f.root, "node_modules/build-probe/package.json")),
    /ENOENT/,
  );
  assert.equal((await run()).code, 0);
  assert.equal((await f.commands()).length, 2);
  await fs.rm(path.join(f.root, "frontend/node_modules/build-probe"), {
    recursive: true,
  });
  assert.equal((await run()).code, 0);
  assert.deepEqual(
    (await f.commands()).map((entry) => entry.stage),
    ["root-ci", "frontend-ci", "frontend-ci"],
  );
  await fs.access(
    path.join(f.root, "frontend/node_modules/build-probe/package.json"),
  );
  await fs.appendFile(path.join(f.root, "frontend/package-lock.json"), "\n");
  assert.equal((await run()).code, 0);
  assert.deepEqual(
    (await f.commands()).map((entry) => entry.stage),
    ["root-ci", "frontend-ci", "frontend-ci", "frontend-ci"],
  );
});

test("failed startup install stops before frontend and does not write a success marker; retry works", async (t) => {
  const f = await startupFixture(t);
  await f.fail("root-ci");
  assert.equal((await f.runTool("ensure-dependencies.mjs")).code, 17);
  assert.deepEqual(
    (await f.commands()).map((entry) => entry.stage),
    ["root-ci"],
  );
  await assert.rejects(
    fs.access(path.join(f.root, "node_modules/.aa-dependencies")),
    /ENOENT/,
  );
  await f.fail("");
  assert.equal((await f.runTool("ensure-dependencies.mjs")).code, 0);
  assert.deepEqual(
    (await f.commands()).map((entry) => entry.stage),
    ["root-ci", "root-ci", "frontend-ci"],
  );
});

test("setup preserves an existing .env and data without interactive input", async (t) => {
  const f = await startupFixture(t);
  const content = Buffer.from("SYNTHETIC_SETUP_SENTINEL\r\n");
  await fs.writeFile(path.join(f.root, ".env"), content);
  assert.equal((await f.runTool("setup.mjs")).code, 0);
  assert.deepEqual(await fs.readFile(path.join(f.root, ".env")), content);
  assert.deepEqual(
    await fs.readFile(path.join(f.root, "data/synthetic.sqlite")),
    f.sentinel,
  );
  assert.deepEqual(await f.commands(), []);
});

test("setup rejects a directory named .env instead of silently continuing", async (t) => {
  const f = await startupFixture(t);
  await fs.mkdir(path.join(f.root, ".env"));
  const result = await f.runTool("setup.mjs");
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /\.env okunamıyor/);
  assert((await fs.stat(path.join(f.root, ".env"))).isDirectory());
});

test("headless first setup refuses account creation and leaves no .env or database changes", async (t) => {
  const f = await startupFixture(t);
  const result = await f.runTool("setup.mjs");
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Terminal penceresinde/);
  await assert.rejects(fs.access(path.join(f.root, ".env")), /ENOENT/);
  assert.deepEqual(
    await fs.readFile(path.join(f.root, "data/synthetic.sqlite")),
    f.sentinel,
  );
});
