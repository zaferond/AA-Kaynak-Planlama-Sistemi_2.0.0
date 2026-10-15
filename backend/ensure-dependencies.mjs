import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const [directory, includeDev] of [
  [root, false],
  [path.join(root, "frontend"), true],
]) {
  const options = includeDev ? ["--include=dev"] : ["--omit=dev"];
  const manifest = await fs.readFile(
    path.join(directory, "package.json"),
    "utf8",
  );
  const lock = await fs.readFile(
    path.join(directory, "package-lock.json"),
    "utf8",
  );
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        manifest,
        lock,
        options,
        node: process.versions.node.split(".")[0],
        platform: process.platform,
        arch: process.arch,
      }),
    )
    .digest("hex");
  const marker = path.join(directory, "node_modules", ".aa-dependencies");
  const previous = await fs.readFile(marker, "utf8").catch(() => "");
  const dependencies = JSON.parse(manifest);
  const required = Object.keys({
    ...dependencies.dependencies,
    ...(includeDev ? dependencies.devDependencies : {}),
  });
  const installed = await Promise.all(
    required.map((name) =>
      fs
        .access(path.join(directory, "node_modules", name, "package.json"))
        .then(
          () => true,
          () => false,
        ),
    ),
  );
  if (previous === fingerprint && installed.every(Boolean)) continue;
  console.log(
    path.basename(directory) +
      ": bağımlılıklar kilit dosyasına göre kuruluyor.",
  );
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["ci", ...options], {
    cwd: directory,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  await fs.writeFile(marker, fingerprint);
}
