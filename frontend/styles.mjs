import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import workspaceStyleFiles from "./src/styles/manifest.json" with { type: "json" };

const stylesDirectory = fileURLToPath(
  new URL("./src/styles/", import.meta.url),
);

/** Build a single stylesheet in explicit cascade order, never directory order. */
export async function readWorkspaceStyles(
  directory = stylesDirectory,
  files = workspaceStyleFiles,
) {
  if (
    !Array.isArray(files) ||
    !files.length ||
    files.some(
      (file) =>
        typeof file !== "string" ||
        !/^(?:[a-z0-9-]+\/)*[a-z0-9-]+\.css$/.test(file),
    )
  ) {
    throw Error(
      "Stil listesi yalnızca styles/ içindeki göreli CSS dosyalarını içermeli.",
    );
  }
  if (new Set(files).size !== files.length)
    throw Error(
      "Stil listesinde aynı CSS dosyası birden fazla kez yer alıyor.",
    );
  const available = (
    await fs.readdir(directory, { recursive: true, withFileTypes: true })
  )
    .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
    .map((entry) =>
      path
        .relative(directory, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    );
  const unlisted = available.filter((file) => !files.includes(file));
  const missing = files.filter((file) => !available.includes(file));
  if (unlisted.length || missing.length)
    throw Error(
      [
        unlisted.length
          ? "Stil listesine eklenmemiş dosyalar: " + unlisted.join(", ")
          : "",
        missing.length
          ? "Bulunamayan stil dosyaları: " + missing.join(", ")
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  return (
    await Promise.all(
      files.map((file) => fs.readFile(path.join(directory, file), "utf8")),
    )
  ).join("\n");
}
