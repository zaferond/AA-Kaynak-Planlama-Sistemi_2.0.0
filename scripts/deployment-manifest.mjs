import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const manifestName = "deployment-manifest.json";
const format = "aa-deployment-v1";
const versionPattern =
  /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/;
const rootFiles = new Set([
  "package.json",
  "package-lock.json",
  "baslat-windows.cmd",
  "baslat-mac.sh",
  "frontend/package.json",
  "frontend/package-lock.json",
  "frontend/tsconfig.json",
  "frontend/build.mjs",
  "frontend/styles.mjs",
]);
const jsonFiles = new Set([
  "backend/compatible-migration-fingerprints.json",
  "shared/catalog.json",
  "shared/data-retention-policy.json",
  "frontend/src/styles/manifest.json",
]);
const directories = [
  "backend",
  "shared",
  "scripts",
  "frontend/src",
  "frontend/components",
  "frontend/lib",
  "frontend/assets",
];
const excluded = new Set(["node_modules", "data", ".compiled", ".git"]);
const codeExtensions = /\.(?:mjs|ts|tsx|css|sql|svg|png)$/;
const artifactExtensions =
  /\.(?:html|js|css|svg|png|ico|jpg|jpeg|webp)(?:\.gz)?$/;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ordered = (entries) =>
  Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b, "en")));

function selectedSource(file) {
  return (
    rootFiles.has(file) ||
    jsonFiles.has(file) ||
    (directories.some((directory) => file.startsWith(directory + "/")) &&
      codeExtensions.test(file))
  );
}

async function normalFile(root, relative) {
  // Check every component before reading: a selected directory must not escape via a symlink.
  const segments = relative.split("/");
  for (let i = 1; i <= segments.length; i++) {
    const stat = await fs.lstat(path.join(root, ...segments.slice(0, i)));
    if (
      stat.isSymbolicLink() ||
      (i < segments.length ? !stat.isDirectory() : !stat.isFile())
    )
      throw Error(
        "Dağıtım dosyaları normal dosya/dizin olmalıdır: " + relative,
      );
  }
  return fs.readFile(path.join(root, relative));
}

// Callers must use paths from a verified manifest, never user-supplied paths.
export const readDeploymentFile = normalFile;

async function inventory(root, directory, select, strict = false) {
  const stat = await fs.lstat(path.join(root, directory));
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw Error("Dağıtım dizini normal bir dizin olmalıdır: " + directory);
  const entries = [];
  for (const entry of await fs.readdir(path.join(root, directory), {
    withFileTypes: true,
  })) {
    if (entry.name.startsWith(".") || excluded.has(entry.name)) {
      if (strict) throw Error("Derleme dizininde beklenmeyen dosya/dizin var.");
      continue;
    }
    const relative = directory + "/" + entry.name;
    if (entry.isSymbolicLink())
      throw Error("Dağıtım içinde sembolik bağlantı kullanılamaz: " + relative);
    if (entry.isDirectory())
      entries.push(...(await inventory(root, relative, select, strict)));
    else if (select(relative))
      entries.push([relative, digest(await normalFile(root, relative))]);
    else if (strict) throw Error("Derleme dizininde desteklenmeyen dosya var.");
  }
  return entries;
}

/** Only application/build inputs. Never enumerate the root, data, .env or node_modules. */
export async function deploymentSources(root) {
  const entries = [];
  for (const file of rootFiles)
    entries.push([file, digest(await normalFile(root, file))]);
  for (const directory of directories)
    entries.push(...(await inventory(root, directory, selectedSource)));
  const files = ordered(entries);
  for (const file of [
    "backend/server.mjs",
    "shared/server-domain.ts",
    "frontend/src/main.tsx",
    "scripts/deployment-manifest.mjs",
    "scripts/verify-deployment.mjs",
  ])
    if (!files[file]) throw Error("Gerekli kaynak dosyası bulunamadı: " + file);
  return files;
}

async function deploymentArtifacts(root) {
  const files = ordered(
    await inventory(
      root,
      "site",
      (file) => artifactExtensions.test(file),
      true,
    ),
  );
  if (!files["site/index.html"])
    throw Error("Derlenmiş site/index.html bulunamadı.");
  return files;
}

function commitAt(root) {
  // Informational label only. Verification depends on file hashes, not Git availability.
  const env = Object.fromEntries(
    ["PATH", "SystemRoot", "WINDIR"]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  const result = spawnSync("git", ["rev-parse", "--show-toplevel", "HEAD"], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 2000,
    windowsHide: true,
  });
  const [directory, sha] = result.stdout?.trim().split(/\r?\n/) || [];
  return result.status === 0 &&
    directory &&
    path.resolve(directory) === path.resolve(root) &&
    /^[a-f0-9]{40}$/.test(sha)
    ? sha
    : null;
}

/** Called after a successful build with the input hashes captured BEFORE compilation. */
export async function writeDeploymentManifest(
  root,
  beforeBuild,
  { releaseFiles } = {},
) {
  const sources = await deploymentSources(root);
  if (!same(sources, beforeBuild))
    throw Error(
      "Derleme sırasında kaynaklar değişti. Derlemeyi tekrar çalıştırın.",
    );
  const artifacts = await deploymentArtifacts(root);
  // The build explicitly declares its outputs, including assets referenced from JS.
  // Do not infer this list from HTML alone or silently include historical bundles.
  let releaseArtifacts;
  if (releaseFiles !== undefined) {
    if (
      !Array.isArray(releaseFiles) ||
      releaseFiles.length > 10000 ||
      releaseFiles.some((file) => typeof file !== "string") ||
      new Set(releaseFiles).size !== releaseFiles.length
    )
      throw Error("Güncel derleme dosyası listesi geçersiz.");
    releaseArtifacts = ordered(
      releaseFiles.map((file) => [file, artifacts[file]]),
    );
    if (!validReleaseArtifacts(releaseArtifacts, artifacts))
      throw Error("Güncel derleme dosyası listesi eksik veya geçersiz.");
  }
  const { version } = JSON.parse(await normalFile(root, "package.json"));
  if (typeof version !== "string" || !versionPattern.test(version))
    throw Error("Paket sürümü geçersiz.");
  const manifest = {
    format,
    version,
    commit: commitAt(root),
    sources,
    artifacts,
    ...(releaseArtifacts ? { releaseArtifacts } : {}),
  };
  const stage = path.join(
    root,
    ".deployment-manifest-" + randomUUID() + ".tmp",
  );
  let created = false;
  try {
    await fs.writeFile(stage, JSON.stringify(manifest, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    created = true;
    await fs.rename(stage, path.join(root, manifestName));
  } finally {
    if (created) await fs.rm(stage, { force: true });
  }
  return manifest;
}

function validFiles(files, select) {
  return (
    files &&
    !Array.isArray(files) &&
    typeof files === "object" &&
    Object.keys(files).length > 0 &&
    Object.keys(files).length <= 10000 &&
    Object.entries(files).every(
      ([file, hash]) =>
        file.length <= 500 &&
        !file.includes("\\") &&
        !file
          .split("/")
          .some(
            (part) =>
              !part || part === "." || part === ".." || part.startsWith("."),
          ) &&
        select(file) &&
        typeof hash === "string" &&
        /^[a-f0-9]{64}$/.test(hash),
    )
  );
}

function validReleaseArtifacts(files, artifacts) {
  return (
    validFiles(
      files,
      (file) => file.startsWith("site/") && artifactExtensions.test(file),
    ) &&
    Object.hasOwn(files, "site/index.html") &&
    Object.entries(files).every(([file, hash]) => artifacts[file] === hash)
  );
}

function differences(expected, actual) {
  return {
    changed: Object.keys(expected).filter(
      (file) => actual[file] && actual[file] !== expected[file],
    ),
    missing: Object.keys(expected).filter((file) => !actual[file]),
    added: Object.keys(actual).filter((file) => !Object.hasOwn(expected, file)),
  };
}

/** Read-only pre-deployment check; no .env, Store, DB, account or running process access. */
export async function verifyDeployment(root, { includeManifest = false } = {}) {
  let manifest;
  try {
    const bytes = await normalFile(root, manifestName);
    if (bytes.length > 8 * 1024 * 1024) throw Error("Manifest çok büyük.");
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if (error.code === "ENOENT")
      throw Error(
        "Dağıtım manifesti bulunamadı. Önce npm run build çalıştırın.",
      );
    throw Error("Dağıtım manifesti okunamadı veya geçersiz.");
  }
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    manifest.format !== format ||
    typeof manifest.version !== "string" ||
    !versionPattern.test(manifest.version) ||
    !(
      manifest.commit === null ||
      (typeof manifest.commit === "string" &&
        /^[a-f0-9]{40}$/.test(manifest.commit))
    ) ||
    !validFiles(manifest.sources, selectedSource) ||
    !validFiles(
      manifest.artifacts,
      (file) => file.startsWith("site/") && artifactExtensions.test(file),
    ) ||
    (Object.hasOwn(manifest, "releaseArtifacts") &&
      !validReleaseArtifacts(manifest.releaseArtifacts, manifest.artifacts))
  )
    throw Error("Dağıtım manifestinin biçimi geçersiz.");
  const sourceDifferences = differences(
    manifest.sources,
    await deploymentSources(root),
  );
  const artifactDifferences = differences(
    manifest.artifacts,
    await deploymentArtifacts(root),
  );
  const ok = [
    ...Object.values(sourceDifferences),
    ...Object.values(artifactDifferences),
  ].every((files) => !files.length);
  return {
    ok,
    version: manifest.version,
    commit: manifest.commit,
    sourceDifferences,
    artifactDifferences,
    ...(includeManifest ? { manifest } : {}),
  };
}
