import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createDeploymentPackage } from "./deployment-package.mjs";
import {
  verifyDeployment,
  readDeploymentFile,
} from "./deployment-manifest.mjs";

// Reads only verified application/build files; writes only a new temporary package.
// No environment-file loading, account, database, dependency install or server start.
const source = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = await fs.realpath(source);
let temporaryRoot = await fs.realpath(os.tmpdir());
const relative = path.relative(sourceRoot, temporaryRoot);
if (
  !relative ||
  (!path.isAbsolute(relative) &&
    relative !== ".." &&
    !relative.startsWith(".." + path.sep))
)
  temporaryRoot = path.dirname(sourceRoot);
const temporary = await fs.mkdtemp(
  path.join(temporaryRoot, "aa-package-check-"),
);
try {
  const output = path.join(temporary, "release");
  const result = await createDeploymentPackage(source, output);
  const { manifest, ok } = await verifyDeployment(output, {
    includeManifest: true,
  });
  assert(ok);
  const html = (await readDeploymentFile(output, "site/index.html")).toString(
    "utf8",
  );
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.equal(
    references.length,
    2,
    "Review package acceptance when HTML assets change",
  );
  assert(
    references.every((url) =>
      /^\/assets\/app\.[a-f0-9]{12}\.(?:js|css)$/.test(url),
    ),
  );
  assert(references.some((url) => url.endsWith(".js")));
  assert(references.some((url) => url.endsWith(".css")));
  const plainFiles = [
    "site/index.html",
    ...references.map((url) => "site" + url),
  ];
  const expected = [
    ...plainFiles.flatMap((file) => [file, file + ".gz"]),
    "site/assets/otokar-logo.svg",
  ];
  assert.deepEqual(Object.keys(manifest.artifacts).sort(), expected.sort());
  assert.deepEqual(manifest.releaseArtifacts, manifest.artifacts);
  for (const file of plainFiles) {
    assert.deepEqual(
      gunzipSync(await readDeploymentFile(output, file + ".gz")),
      await readDeploymentFile(output, file),
    );
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        sourceFiles: result.sourceFiles,
        artifactFiles: result.artifactFiles,
        excludedHistoricalArtifacts: result.excludedHistoricalArtifacts,
      },
      null,
      2,
    ),
  );
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
