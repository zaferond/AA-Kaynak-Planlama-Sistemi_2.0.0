import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  deploymentSources,
  writeDeploymentManifest,
  verifyDeployment,
} from "../scripts/deployment-manifest.mjs";
import { createDeploymentPackage } from "../scripts/deployment-package.mjs";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aa-deployment-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const files = {
    "package.json": JSON.stringify({ version: "3.0.0" }),
    "package-lock.json": "{}",
    "baslat-windows.cmd": "@echo off\r\n",
    "baslat-mac.sh": "#!/bin/bash\n",
    "frontend/package.json": "{}",
    "frontend/package-lock.json": "{}",
    "frontend/tsconfig.json": "{}",
    "frontend/build.mjs": "// synthetic build",
    "frontend/styles.mjs": "// synthetic styles",
    "backend/server.mjs": "// synthetic server; never executed",
    "shared/model.ts": "export const synthetic = 1;",
    "shared/server-domain.ts": "// synthetic domain",
    "scripts/deployment-manifest.mjs": "// synthetic deployment source",
    "scripts/verify-deployment.mjs": "// synthetic deployment command",
    "frontend/src/main.tsx": "// synthetic frontend",
    "frontend/components/ui/table.tsx": "// synthetic UI component",
    "frontend/lib/utils.ts": "// synthetic UI helper",
    "frontend/assets/base.css": "body {}",
    "site/index.html": '<script src="/assets/app.js"></script>',
    "site/assets/app.js": "console.log('synthetic');",
    ".env": "SYNTHETIC_SECRET_NOT_FOR_MANIFEST",
    "data/synthetic.sqlite": "SYNTHETIC_DATABASE_NOT_FOR_MANIFEST",
  };
  for (const [file, value] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), value);
  }
  const manifest = path.join(root, "deployment-manifest.json");
  const build = async () =>
    writeDeploymentManifest(root, await deploymentSources(root), {
      releaseFiles: ["site/index.html", "site/assets/app.js"],
    });
  return { root, manifest, files, build };
}

test("built package verifies without Git and excludes secrets, database and dependency directories", async (t) => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.root, "frontend/src/node_modules"));
  await fs.writeFile(
    path.join(f.root, "frontend/src/node_modules/private.ts"),
    "SYNTHETIC_DEPENDENCY_SECRET",
  );
  await f.build();
  const result = await verifyDeployment(f.root);
  assert.equal(result.ok, true);
  assert.equal(result.commit, null);
  const bytes = await fs.readFile(f.manifest, "utf8");
  for (const file of [".env", "data/synthetic.sqlite"]) {
    assert.equal(
      await fs.readFile(path.join(f.root, file), "utf8"),
      f.files[file],
    );
    const hash = createHash("sha256").update(f.files[file]).digest("hex");
    assert(!bytes.includes(hash));
    assert(!bytes.includes(f.files[file]));
  }
  assert(!bytes.includes("node_modules"));
  const before = await fs.readFile(f.manifest);
  await verifyDeployment(f.root);
  assert.deepEqual(await fs.readFile(f.manifest), before);
});

test("source, dependency lock and build artifact drift are reported separately", async (t) => {
  const f = await fixture(t);
  await f.build();
  await fs.appendFile(
    path.join(f.root, "frontend/src/main.tsx"),
    "\n// changed",
  );
  await fs.appendFile(path.join(f.root, "frontend/package-lock.json"), "\n");
  await fs.appendFile(
    path.join(f.root, "frontend/components/ui/table.tsx"),
    "\n// changed component",
  );
  await fs.writeFile(
    path.join(f.root, "site/assets/app.js"),
    "// different build",
  );
  const result = await verifyDeployment(f.root);
  assert.equal(result.ok, false);
  assert.deepEqual(result.sourceDifferences.changed, [
    "frontend/components/ui/table.tsx",
    "frontend/package-lock.json",
    "frontend/src/main.tsx",
  ]);
  assert.deepEqual(result.artifactDifferences.changed, ["site/assets/app.js"]);
});

test("missing and added source/artifact files cannot pass verification", async (t) => {
  const f = await fixture(t);
  await f.build();
  await fs.unlink(path.join(f.root, "shared/model.ts"));
  await fs.unlink(path.join(f.root, "site/assets/app.js"));
  await fs.writeFile(path.join(f.root, "backend/new-module.mjs"), "// added");
  await fs.writeFile(path.join(f.root, "site/assets/new.js"), "// added");
  const result = await verifyDeployment(f.root);
  assert.equal(result.ok, false);
  assert.deepEqual(result.sourceDifferences.missing, ["shared/model.ts"]);
  assert.deepEqual(result.sourceDifferences.added, ["backend/new-module.mjs"]);
  assert.deepEqual(result.artifactDifferences.missing, ["site/assets/app.js"]);
  assert.deepEqual(result.artifactDifferences.added, ["site/assets/new.js"]);
});

test("sources changing during compilation refuse a new stamp and preserve the previous manifest", async (t) => {
  const f = await fixture(t);
  await f.build();
  const previous = await fs.readFile(f.manifest);
  const before = await deploymentSources(f.root);
  await fs.appendFile(
    path.join(f.root, "backend/server.mjs"),
    "\n// edited during build",
  );
  await assert.rejects(
    writeDeploymentManifest(f.root, before),
    /Derleme sırasında kaynaklar değişti/,
  );
  assert.deepEqual(await fs.readFile(f.manifest), previous);
  assert(!(await fs.readdir(f.root)).some((file) => file.endsWith(".tmp")));
});

test("missing, malformed and path-traversal manifests are refused without following their paths", async (t) => {
  const f = await fixture(t);
  await assert.rejects(verifyDeployment(f.root), /Önce npm run build/);
  await f.build();
  const good = JSON.parse(await fs.readFile(f.manifest, "utf8"));
  for (const value of [
    null,
    [],
    { ...good, sources: { "../.env": "0".repeat(64) } },
    { ...good, artifacts: { "/site/app.js": "0".repeat(64) } },
  ]) {
    await fs.writeFile(f.manifest, JSON.stringify(value));
    await assert.rejects(verifyDeployment(f.root), /biçimi geçersiz/);
  }
  assert.equal(
    await fs.readFile(path.join(f.root, ".env"), "utf8"),
    f.files[".env"],
  );
});

test("a failed or incomplete build cannot replace a good manifest", async (t) => {
  const f = await fixture(t);
  await f.build();
  const previous = await fs.readFile(f.manifest);
  await fs.unlink(path.join(f.root, "site/index.html"));
  await assert.rejects(f.build(), /site\/index.html/);
  assert.deepEqual(await fs.readFile(f.manifest), previous);
});

test("symlinked code directories are refused before hashing outside the package", async (t) => {
  const f = await fixture(t);
  const outside = await fs.mkdtemp(
    path.join(os.tmpdir(), "aa-deployment-outside-"),
  );
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(outside, "private.ts"),
    "SYNTHETIC_OUTSIDE_SECRET",
  );
  await fs.symlink(
    outside,
    path.join(f.root, "frontend/src/linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(deploymentSources(f.root), /sembolik bağlantı/);
  await assert.rejects(fs.access(f.manifest), /ENOENT/);
});

test("deployment package creates one verified source/build tree and excludes settings, databases and dependencies", async (t) => {
  const f = await fixture(t);
  await f.build();
  const output = f.root + "-package";
  t.after(() => fs.rm(output, { recursive: true, force: true }));
  await fs.mkdir(path.join(f.root, "node_modules/synthetic"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(f.root, "node_modules/synthetic/private.txt"),
    "DEPENDENCY_SENTINEL",
  );
  const result = await createDeploymentPackage(f.root, output);
  assert.equal(result.directory, await fs.realpath(output));
  assert.equal((await verifyDeployment(output)).ok, true);
  for (const name of [".env", "data", "node_modules", ".git"])
    await assert.rejects(fs.access(path.join(output, name)), {
      code: "ENOENT",
    });
  assert.equal(
    await fs.readFile(path.join(f.root, ".env"), "utf8"),
    f.files[".env"],
  );
  assert.deepEqual(
    await fs.readFile(path.join(output, "deployment-manifest.json")),
    await fs.readFile(f.manifest),
  );
});

test("deployment packaging refuses existing installations, nested or stale source targets without touching their data", async (t) => {
  const f = await fixture(t);
  await f.build();
  const output = f.root + "-existing";
  t.after(() => fs.rm(output, { recursive: true, force: true }));
  await fs.mkdir(output);
  await fs.writeFile(path.join(output, ".env"), "EXISTING_CONFIG");
  await assert.rejects(createDeploymentPackage(f.root, output), {
    code: "EEXIST",
  });
  assert.equal(
    await fs.readFile(path.join(output, ".env"), "utf8"),
    "EXISTING_CONFIG",
  );
  await assert.rejects(
    createDeploymentPackage(f.root, path.join(f.root, "new")),
    /kaynak klasörünün dışında/,
  );
  await fs.appendFile(path.join(f.root, "frontend/src/main.tsx"), "// drift");
  const fresh = f.root + "-stale";
  await assert.rejects(
    createDeploymentPackage(f.root, fresh),
    /Kaynak paket doğrulanamadı/,
  );
  await assert.rejects(fs.access(fresh), { code: "ENOENT" });
});

test("packaging excludes historical bundles, includes declared runtime assets and remains bounded across releases", async (t) => {
  const f = await fixture(t);
  const active = [
    "site/index.html",
    "site/index.html.gz",
    "site/assets/app.js",
    "site/assets/app.js.gz",
    "site/assets/app.css",
    "site/assets/app.css.gz",
    "site/assets/otokar-logo.svg",
  ];
  for (const file of active.filter((file) => !f.files[file]))
    await fs.writeFile(path.join(f.root, file), "synthetic " + file);
  for (let release = 0; release < 3; release++) {
    await fs.writeFile(
      path.join(f.root, `site/assets/old-${release}.js`),
      "old bundle",
    );
    await writeDeploymentManifest(f.root, await deploymentSources(f.root), {
      releaseFiles: active,
    });
    const before = await fs.readFile(f.manifest);
    const output = f.root + "-release-" + release;
    t.after(() => fs.rm(output, { recursive: true, force: true }));
    const result = await createDeploymentPackage(f.root, output);
    assert.equal(result.artifactFiles, 7);
    assert.equal(result.excludedHistoricalArtifacts, release + 1);
    const packaged = JSON.parse(
      await fs.readFile(path.join(output, "deployment-manifest.json"), "utf8"),
    );
    assert.deepEqual(Object.keys(packaged.artifacts).sort(), active.sort());
    assert.deepEqual(packaged.releaseArtifacts, packaged.artifacts);
    assert.equal((await verifyDeployment(output)).ok, true);
    for (const file of active)
      assert.deepEqual(
        await fs.readFile(path.join(output, file)),
        await fs.readFile(path.join(f.root, file)),
      );
    await assert.rejects(
      fs.access(path.join(output, `site/assets/old-${release}.js`)),
      { code: "ENOENT" },
    );
    assert.deepEqual(await fs.readFile(f.manifest), before);
    assert.equal((await verifyDeployment(f.root)).ok, true);
    await fs.access(path.join(f.root, `site/assets/old-${release}.js`));
  }
});

test("legacy manifests still verify but cannot silently package unbounded history", async (t) => {
  const f = await fixture(t);
  await writeDeploymentManifest(f.root, await deploymentSources(f.root));
  assert.equal((await verifyDeployment(f.root)).ok, true);
  const output = f.root + "-legacy";
  await assert.rejects(
    createDeploymentPackage(f.root, output),
    /Önce npm run build/,
  );
  await assert.rejects(fs.access(output), { code: "ENOENT" });
});

test("invalid release declarations preserve the manifest and cannot bypass inventory checks", async (t) => {
  const f = await fixture(t);
  await f.build();
  const previous = await fs.readFile(f.manifest);
  for (const releaseFiles of [
    [],
    ["site/assets/app.js"],
    ["site/index.html", "site/missing.js"],
    ["site/index.html", "../.env"],
    ["site/index.html", "site/index.html"],
    [null],
  ]) {
    await assert.rejects(
      writeDeploymentManifest(f.root, await deploymentSources(f.root), {
        releaseFiles,
      }),
      /Güncel derleme/,
    );
    assert.deepEqual(await fs.readFile(f.manifest), previous);
  }
  const good = JSON.parse(previous);
  for (const releaseArtifacts of [
    null,
    [],
    {},
    { "site/index.html": "0".repeat(64) },
    { ...good.releaseArtifacts, "site/unknown.js": "0".repeat(64) },
    { "../.env": "0".repeat(64) },
  ]) {
    await fs.writeFile(
      f.manifest,
      JSON.stringify({ ...good, releaseArtifacts }),
    );
    await assert.rejects(verifyDeployment(f.root), /biçimi geçersiz/);
  }
});

test("historical files are excluded from output but drift still refuses packaging before creating a target", async (t) => {
  const f = await fixture(t);
  const old = path.join(f.root, "site/assets/old.js");
  await fs.writeFile(old, "old bundle");
  await f.build();
  await fs.writeFile(old, "changed old bundle");
  const output = f.root + "-drift";
  await assert.rejects(
    createDeploymentPackage(f.root, output),
    /Kaynak paket doğrulanamadı/,
  );
  await assert.rejects(fs.access(output), { code: "ENOENT" });
});
