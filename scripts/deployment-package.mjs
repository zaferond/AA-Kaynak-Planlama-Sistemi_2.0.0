import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  verifyDeployment,
  readDeploymentFile,
} from "./deployment-manifest.mjs";

/** Creates a new, verified code/build package. Never merges into a running installation. */
export async function createDeploymentPackage(source, destination) {
  source = await fs.realpath(source);
  destination = path.resolve(destination);
  const parent = await fs.realpath(path.dirname(destination));
  destination = path.join(parent, path.basename(destination));
  const relative = path.relative(source, destination);
  if (
    !relative ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  )
    throw Error(
      "Dağıtım hedefi kaynak klasörünün dışında yeni bir klasör olmalıdır.",
    );
  const verified = await verifyDeployment(source, { includeManifest: true });
  if (!verified.ok)
    throw Error("Kaynak paket doğrulanamadı. Önce npm run build çalıştırın.");
  if (!verified.manifest.releaseArtifacts)
    throw Error(
      "Güncel derleme dosyası listesi bulunamadı. Önce npm run build çalıştırın.",
    );
  // Keep the source inventory strict, but package only this build's declared outputs.
  const manifest = {
    ...verified.manifest,
    artifacts: verified.manifest.releaseArtifacts,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
  // EEXIST aborts without touching any existing configuration or user data.
  await fs.mkdir(destination);
  try {
    for (const [name, expected] of Object.entries({
      ...manifest.sources,
      ...manifest.artifacts,
    })) {
      const bytes = await readDeploymentFile(source, name);
      if (createHash("sha256").update(bytes).digest("hex") !== expected)
        throw Error(
          "Paketleme sırasında kaynak değişti. Yeniden derleyip deneyin.",
        );
      const target = path.join(destination, name);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes, { flag: "wx" });
    }
    await fs.writeFile(
      path.join(destination, "deployment-manifest.json"),
      manifestBytes,
      { flag: "wx" },
    );
    if (
      !(await verifyDeployment(source)).ok ||
      !(await verifyDeployment(destination)).ok
    )
      throw Error("Dağıtım paketi doğrulanamadı.");
    return {
      directory: destination,
      version: manifest.version,
      sourceFiles: Object.keys(manifest.sources).length,
      artifactFiles: Object.keys(manifest.artifacts).length,
      excludedHistoricalArtifacts:
        Object.keys(verified.manifest.artifacts).length -
        Object.keys(manifest.artifacts).length,
    };
  } catch (error) {
    // This invocation exclusively created the directory; existing targets never enter this block.
    await fs.rm(destination, { recursive: true, force: true });
    throw error;
  }
}
