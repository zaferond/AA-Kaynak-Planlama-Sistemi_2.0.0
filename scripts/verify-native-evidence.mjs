import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  nativeEvidenceContext,
  verifyNativeEvidence,
} from "./native-evidence.mjs";
// File-only acceptance: never loads .env, opens a DB or calls a network service.
try {
  const { values } = parseArgs({
    options: { report: { type: "string" }, commit: { type: "string" } },
  });
  if (!values.report || !values.commit)
    throw Error("Use --report <native JSON> --commit <full SHA>.");
  const stat = await fs.stat(values.report);
  if (!stat.isFile() || stat.size > 10 * 1024 * 1024)
    throw Error("Invalid evidence file size/type.");
  const bytes = await fs.readFile(values.report);
  const report = JSON.parse(bytes.toString("utf8"));
  const expected = await nativeEvidenceContext(
    fileURLToPath(new URL("../", import.meta.url)),
    values.commit,
  );
  console.log(
    JSON.stringify(
      {
        ...verifyNativeEvidence(report, expected),
        reportSha256: createHash("sha256").update(bytes).digest("hex"),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error instanceof SyntaxError
      ? "Native evidence JSON is invalid."
      : error.code
        ? "Native evidence could not be read."
        : error.message,
  );
  process.exitCode = 1;
}
