import { fileURLToPath } from "node:url";
import { checkSharedDependencies } from "./domain-boundaries.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { files, violations } = await checkSharedDependencies(root);
if (violations.length) {
  for (const issue of violations)
    console.error(
      `${issue.file}:${issue.line}:${issue.column} — ${issue.reason}`,
    );
  process.exitCode = 1;
} else {
  // Load the existing validation entry only after the static boundary check.
  const { validate } = await import("../shared/server-domain.ts");
  if (typeof validate !== "function")
    throw Error("Domain validation unavailable");
  console.log(
    `Shared domain loaded directly; recursive AST dependency check passed (${files.length} source files).`,
  );
}
