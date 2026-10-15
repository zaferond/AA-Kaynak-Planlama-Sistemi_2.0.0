import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

// The CLI tools are copied into an owned fixture. No real .env, npm config,
// application database, registry or server is used by these subprocesses.
export async function startupFixture(t, { launcher = false } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-startup-test-"));
  // Windows can briefly retain the copied node.exe handle after cmd closes.
  // Retry only supported transient filesystem errors; persistent errors fail.
  t.after(() =>
    fs.rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    }),
  );
  const root = path.join(dir, "AA Deneme Türkçe & (1) !");
  const bin = path.join(dir, "bin");
  for (const relative of ["backend", "frontend", "data"])
    await fs.mkdir(path.join(root, relative), { recursive: true });
  await fs.mkdir(bin);
  for (const relative of [
    "backend/setup.mjs",
    "backend/ensure-dependencies.mjs",
    ...(launcher ? ["baslat-windows.cmd"] : []),
  ])
    await fs.copyFile(
      new URL("../" + relative, import.meta.url),
      path.join(root, relative),
    );
  for (const [relative, name] of [
    ["", "runtime"],
    ["frontend", "frontend"],
  ]) {
    const manifest = {
      name: "synthetic-" + name,
      version: "1.0.0",
      dependencies: { "runtime-probe": "1.0.0" },
      devDependencies: { "build-probe": "1.0.0" },
    };
    await fs.writeFile(
      path.join(root, relative, "package.json"),
      JSON.stringify(manifest),
    );
    await fs.writeFile(
      path.join(root, relative, "package-lock.json"),
      JSON.stringify({ lockfileVersion: 3, fixture: name }),
    );
  }
  const sentinel = Buffer.from("SYNTHETIC DATABASE SENTINEL; not a database");
  await fs.writeFile(path.join(root, "data/synthetic.sqlite"), sentinel);
  const log = path.join(dir, "commands.ndjson");
  const failure = path.join(dir, "failure.json");
  await fs.writeFile(
    path.join(bin, "fake-npm.mjs"),
    `import fs from "node:fs/promises";
import path from "node:path";
const args = process.argv.slice(2), cwd = process.cwd();
const stage = args[0] === "ci"
  ? (path.basename(cwd) === "frontend" ? "frontend-ci" : "root-ci")
  : args[1] === "build" ? "build" : "start";
await fs.appendFile(${JSON.stringify(log)}, JSON.stringify({stage, args, cwd}) + "\\n");
let failed = "";
try { failed = JSON.parse(await fs.readFile(${JSON.stringify(failure)}, "utf8")); } catch {}
if (failed === stage) process.exit(17);
if (args[0] === "ci") {
  const manifest = JSON.parse(await fs.readFile(path.join(cwd, "package.json"), "utf8"));
  const dev = args.includes("--include=dev") || (!args.includes("--omit=dev") && process.env.NODE_ENV !== "production");
  await fs.rm(path.join(cwd, "node_modules"), { recursive: true, force: true });
  const required = {...manifest.dependencies, ...(dev ? manifest.devDependencies : {})};
  for (const name of Object.keys(required)) {
    const target = path.join(cwd, "node_modules", name);
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, "package.json"), JSON.stringify({name}));
  }
} else if (stage === "build") {
  await fs.access(path.join(cwd, "frontend/node_modules/build-probe/package.json"));
}
`,
  );
  if (process.platform === "win32") {
    await fs.writeFile(
      path.join(bin, "npm.cmd"),
      `@echo off\r\n"${process.execPath}" "%~dp0fake-npm.mjs" %*\r\nexit /b %errorlevel%\r\n`,
    );
    if (launcher)
      await fs.copyFile(process.execPath, path.join(bin, "node.exe"));
  } else {
    const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
    await fs.writeFile(
      path.join(bin, "npm"),
      "#!/bin/sh\nexec " +
        quote(process.execPath) +
        " " +
        quote(path.join(bin, "fake-npm.mjs")) +
        ' "$@"\n',
      { mode: 0o700 },
    );
  }
  const env = { NODE_ENV: "production" };
  for (const key of [
    "SystemRoot",
    "SYSTEMROOT",
    "ComSpec",
    "WINDIR",
    "PATHEXT",
    "TEMP",
    "TMP",
    "TMPDIR",
  ])
    if (process.env[key]) env[key] = process.env[key];
  env.PATH = [
    bin,
    ...(process.platform === "win32"
      ? [
          path.join(
            process.env.SystemRoot || process.env.SYSTEMROOT,
            "System32",
          ),
        ]
      : ["/usr/bin", "/bin"]),
  ].join(path.delimiter);
  async function run(command, args, options = {}) {
    const child = spawn(command, args, {
      cwd: dir,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      ...options,
    });
    let stdout = "",
      stderr = "";
    child.stdout.setEncoding("utf8").on("data", (data) => (stdout += data));
    child.stderr.setEncoding("utf8").on("data", (data) => (stderr += data));
    // Feed pause on failure without allowing interactive account setup.
    child.stdin.on("error", () => {});
    child.stdin.end("\n");
    const timer = setTimeout(() => child.kill(), 15000);
    try {
      const code = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
      return { code, stdout, stderr };
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    root,
    bin,
    sentinel,
    runTool: (name) =>
      run(process.execPath, [path.join(root, "backend", name)]),
    // cmd /s removes the outer quote pair; the path must remain quoted.
    runLauncher: () =>
      run(
        process.env.ComSpec || "cmd.exe",
        ["/d", "/s", "/c", '""' + path.join(root, "baslat-windows.cmd") + '""'],
        { windowsVerbatimArguments: true },
      ),
    fail: (stage) => fs.writeFile(failure, JSON.stringify(stage)),
    commands: async () => {
      const text = await fs.readFile(log, "utf8").catch(() => "");
      return text.trim()
        ? text
            .trim()
            .split("\n")
            .map((row) => JSON.parse(row))
        : [];
    },
  };
}
