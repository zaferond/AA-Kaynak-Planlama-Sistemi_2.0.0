import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { fixture } from "./browser-checks/fixture.mjs";
import { checkRiskVisibility } from "./browser-checks/risk-visibility.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The normal build stays hidden. This fixture only touches its synthetic DB.
const f = await fixture();
try {
  await checkRiskVisibility(f);
  assert.deepEqual(f.errors, []);
  await f.report("passed");
} catch (error) {
  await f.report("failed", error);
  throw error;
} finally {
  await f.close();
}

const isolated = await fs.mkdtemp(path.join(os.tmpdir(), "aa-risk-ui-checks-"));
async function run(script) {
  const child = spawn(process.execPath, [script], {
    cwd: isolated,
    stdio: "inherit",
    env: { ...process.env, AA_RISK_UI_ENABLED: "true" },
  });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(Error(`${script}: exit ${code}, signal ${signal}`)),
    );
  });
}
try {
  // Explicit source-only allowlist: never copy .env, data, site or backups.
  for (const dir of ["backend", "shared", "scripts", "tests", "frontend"])
    await fs.cp(path.join(root, dir), path.join(isolated, dir), {
      recursive: true,
      filter: (source) =>
        !path
          .relative(root, source)
          .split(path.sep)
          .some(
            (part) =>
              part === "node_modules" ||
              part === ".compiled" ||
              part.startsWith(".env"),
          ),
    });
  for (const file of [
    "package.json",
    "package-lock.json",
    "baslat-windows.cmd",
    "baslat-mac.sh",
  ])
    await fs.copyFile(path.join(root, file), path.join(isolated, file));
  for (const dir of ["node_modules", "frontend/node_modules"])
    await fs.symlink(
      path.join(root, dir),
      path.join(isolated, dir),
      process.platform === "win32" ? "junction" : "dir",
    );
  await run("frontend/build.mjs");
  await run("scripts/run-browser-checks.mjs");
} finally {
  await fs.rm(isolated, { recursive: true, force: true });
}
