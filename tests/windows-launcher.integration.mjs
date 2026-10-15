import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { startupFixture } from "./startup-fixture.mjs";

if (process.platform !== "win32")
  throw Error("Windows launcher integration requires actual Windows cmd.exe.");

async function fixture(t) {
  const f = await startupFixture(t, { launcher: true });
  await fs.writeFile(path.join(f.root, ".env"), "SYNTHETIC_ENV_SENTINEL\r\n");
  return f;
}
async function preserved(f) {
  assert.equal(
    await fs.readFile(path.join(f.root, ".env"), "utf8"),
    "SYNTHETIC_ENV_SENTINEL\r\n",
  );
  assert.deepEqual(
    await fs.readFile(path.join(f.root, "data/synthetic.sqlite")),
    f.sentinel,
  );
}

test("real Windows launcher handles Unicode/special paths, installs production build tools and reuses successful installs", async (t) => {
  const f = await fixture(t);
  const first = await f.runLauncher();
  assert.equal(first.code, 0, first.stdout + first.stderr);
  assert.deepEqual(
    (await f.commands()).map((entry) => entry.stage),
    ["root-ci", "frontend-ci", "build", "start"],
  );
  for (const entry of await f.commands())
    assert.equal(
      entry.cwd,
      entry.stage === "frontend-ci" ? path.join(f.root, "frontend") : f.root,
    );
  const second = await f.runLauncher();
  assert.equal(second.code, 0, second.stdout + second.stderr);
  assert.deepEqual(
    (await f.commands()).map((entry) => entry.stage),
    ["root-ci", "frontend-ci", "build", "start", "build", "start"],
  );
  await preserved(f);
});

for (const stage of ["root-ci", "frontend-ci", "build", "start"])
  test(
    "real Windows launcher stops on " +
      stage +
      " failure and preserves existing configuration/data",
    async (t) => {
      const f = await fixture(t);
      await f.fail(stage);
      const result = await f.runLauncher();
      assert.equal(result.code, 1, result.stdout + result.stderr);
      const stages = ["root-ci", "frontend-ci", "build", "start"];
      assert.deepEqual(
        (await f.commands()).map((entry) => entry.stage),
        stages.slice(0, stages.indexOf(stage) + 1),
      );
      await preserved(f);
    },
  );

test("real Windows launcher detects missing npm before setup or installation", async (t) => {
  const f = await fixture(t);
  await fs.rm(path.join(f.bin, "npm.cmd"));
  const result = await f.runLauncher();
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /npm bulunamadi/);
  assert.deepEqual(await f.commands(), []);
  await preserved(f);
});

test("real Windows launcher rejects invalid .env before installing or building", async (t) => {
  const f = await fixture(t);
  await fs.rm(path.join(f.root, ".env"));
  await fs.mkdir(path.join(f.root, ".env"));
  const result = await f.runLauncher();
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /\.env okunamıyor/);
  assert.deepEqual(await f.commands(), []);
  assert((await fs.stat(path.join(f.root, ".env"))).isDirectory());
  assert.deepEqual(
    await fs.readFile(path.join(f.root, "data/synthetic.sqlite")),
    f.sentinel,
  );
});
