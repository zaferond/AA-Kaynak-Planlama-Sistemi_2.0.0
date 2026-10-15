import { ensureLeadershipUnits } from "../shared/leadership-units.ts";
import { z } from "zod";
import { admin, fail } from "./auth.mjs";
import {
  prepareImport,
  validate,
  migrate,
  versionAt,
} from "./domain/index.mjs";
import { assertActualMonthlyLimits } from "../shared/actual-limits.ts";
import { entityCollections as kinds } from "../shared/entity-kinds.ts";
import {
  DIRECTORY_REVISION_KEY,
  directoryRevision,
} from "../shared/directory-policy.ts";

// Store.mutate owns the active account check, final validation, SQL transaction,
// audit and generation. The restore route also checks its opening generation
// inside that transaction before calling restore. These commands retain their
// own admin checks for standalone callers.
export function reset(d, u, expected) {
  admin(u);
  if (!expected || typeof expected !== "object")
    fail(400, "Sürüm bilgisi eksik.");
  expected = z
    .record(
      z.string().startsWith("allocation:"),
      z.number().int().nonnegative(),
    )
    .parse(expected);
  const actual = Object.fromEntries(
    Object.entries(d.revisions).filter(([k]) => k.startsWith("allocation:")),
  );
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  if ([...keys].some((k) => (actual[k] || 0) !== (expected[k] || 0)))
    fail(409, "Dağılımlar değişti. Yenileyip tekrar deneyin.");
  for (const k of Object.keys(d.allocations)) {
    delete d.allocations[k];
    d.revisions["allocation:" + k] = (d.revisions["allocation:" + k] || 0) + 1;
  }
}
const rowsSchema = z
  .array(
    z.object({
      row: z.number().int(),
      values: z.record(z.union([z.string(), z.number(), z.boolean()])),
      problems: z.array(z.string()),
      date1904: z.boolean(),
    }),
  )
  .min(1)
  .max(5000);
export function importRows(d, u, input) {
  admin(u);
  const rows = prepareImport(d, rowsSchema.parse(input));
  const error = rows.find((r) => r.state === "error");
  if (error)
    fail(400, "Satır " + error.source.row + ": " + error.errors.join(" "));
  let imported = 0;
  for (const row of rows) {
    if (row.state !== "ready") continue;
    const r = row.resource;
    d.resources.push(r);
    d.revisions["resource:" + r.id] = 1;
    const t = d.teams.find((t) => t.id === r.versions[0].team);
    if (t && !t.lead) {
      t.lead = row.lead;
      d.revisions["team:" + t.id] = (d.revisions["team:" + t.id] || 0) + 1;
    }
    imported++;
  }
  return { imported, skipped: rows.length - imported };
}
export function restore(d, u, backup) {
  admin(u);
  if (
    backup?.personAllocations &&
    Object.keys(backup.personAllocations).length
  ) {
    const totals = {};
    for (const [key, amount] of Object.entries(backup.personAllocations)) {
      const [resourceId, projectId, month, ...extra] = key.split("|");
      const resource = backup.resources?.find((r) => r.id === resourceId);
      const team = resource && versionAt(resource, month)?.team;
      if (
        extra.length ||
        !team ||
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        amount > 100
      )
        fail(400, "Yedekte geçersiz kişi tahsisi var.");
      const target = team + "|" + projectId + "|" + month;
      totals[target] = (totals[target] || 0) + amount;
    }
    backup = { ...backup, allocations: totals };
  }
  // An existing undated employment period may be restored unchanged; a JSON
  // upload cannot introduce new undated resources/periods or change their policy.
  const restored = migrate(backup);
  if (d.leadershipUnits) ensureLeadershipUnits(restored);
  const next = validate(restored, { previousResources: d.resources });
  assertActualMonthlyLimits(next);
  // Backup counters belong to another point in time. Rebuild from current
  // revisions, including deleted records, so no stale client becomes current.
  next.revisions = {};
  for (const [kind, c] of Object.entries(kinds)) {
    const ids = new Set([
      ...Object.keys(d.revisions)
        .filter((k) => k.startsWith(kind + ":"))
        .map((k) => k.slice(kind.length + 1)),
      ...(kind === "allocation" || kind === "actual"
        ? Object.keys(next[c] || {})
        : next[c].map((x) => x.id)),
    ]);
    for (const id of ids)
      next.revisions[kind + ":" + id] = (d.revisions[kind + ":" + id] || 0) + 1;
  }
  for (const [kind, collection] of [
    ["workedHours", "actualWorkedHours"],
    ["personDay", "personCalendar"],
  ]) {
    const prefix = kind + ":";
    const ids = new Set([
      ...Object.keys(d.revisions)
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length)),
      ...Object.keys(d[collection] || {}),
      ...Object.keys(next[collection] || {}),
    ]);
    for (const id of ids)
      next.revisions[prefix + id] = (d.revisions[prefix + id] || 0) + 1;
  }
  next.revisions["calendar:shared"] = (d.revisions["calendar:shared"] || 0) + 1;
  // Even an identical JSON restore invalidates previously opened catalog drafts.
  next.revisions[DIRECTORY_REVISION_KEY] = directoryRevision(d) + 1;
  // An absent optional archive in the backup must clear the current archive.
  if (!Object.hasOwn(next, "legacyArchive")) delete d.legacyArchive;
  Object.assign(d, next);
}
