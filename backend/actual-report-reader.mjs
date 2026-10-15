import { readSnapshotMetadata } from "./snapshot-metadata-model.mjs";
import {
  readCompositeMap,
  readRecordMap,
  revisionRecordKey,
} from "./read-records.mjs";
import {
  actualViewQuery,
  actualViewTeams,
  actualViewResources,
} from "./actual-view.mjs";
import { activityReportResources } from "./activity-report.mjs";
import { activityTeamScope } from "../shared/employee-directory.ts";
import { canReadPersonalCalendar } from "../shared/access.ts";
import { filterOwnRecords } from "../shared/records.ts";
import { currentPlanningDate } from "../shared/resource-dates.ts";
import { monthsFrom } from "../shared/model.ts";

// Partial read model only. Never use this data for validation, persistence,
// backup or a mutation callback. Caller owns the authenticated shared transaction.
export async function readActualReportData(
  c,
  provider,
  user,
  query,
  kind,
  date = currentPlanningDate(),
) {
  if (!["actual", "activity"].includes(kind))
    throw Error("Unknown actual report");
  const periodQuery = actualViewQuery.parse({
    start: query.start,
    count: query.count,
  });
  const { data } = await readSnapshotMetadata(c, { report: kind });
  const month = date.slice(0, 7);
  const months = monthsFrom(periodQuery.start, periodQuery.count).filter(
    (m) => m <= month,
  );
  const teams =
    kind === "actual"
      ? actualViewTeams(data, user, date)
      : activityTeamScope(data, user, month);
  const resources =
    kind === "actual"
      ? actualViewResources(data, user, teams, month)
      : activityReportResources(data, teams, month);
  const owners = resources.map((resource) => resource.id);
  // Legacy separators can change interpretation of composite record keys.
  // Preserve the complete numeric read for those datasets; final projection
  // remains authoritative. Large scopes also retain the existing SQL fallback.
  const legacy =
    data.resources.some((r) => r.id.includes("|")) ||
    data.projects.some((p) => p.id.includes("|"));
  const period = legacy
    ? undefined
    : [months[0] || periodQuery.start, months.at(-1) || periodQuery.start];
  const scope = legacy ? undefined : months.length ? owners : [];
  const projects =
    kind === "activity" && !legacy && query.projects.length
      ? query.projects
      : undefined;
  data.actualAllocations = await readCompositeMap(
    c,
    provider,
    "actual_allocations",
    "amount",
    scope,
    period,
    projects,
  );
  data.actualWorkedHours = await readCompositeMap(
    c,
    provider,
    "actual_worked_hours",
    "hours",
    scope,
    period,
  );
  if (kind === "actual") {
    data.actualPercentEntries = await readCompositeMap(
      c,
      provider,
      "actual_percent_entries",
      "percent",
      scope,
      period,
    );
    const suffix =
      provider === "sqljs" ? "substr(record_id,-7)" : "RIGHT(record_id,7)";
    const numericDate = period ? ` AND ${suffix}>=@p0 AND ${suffix}<=@p1` : "";
    data.revisions = await readRecordMap(
      c,
      "SELECT kind,record_id,revision FROM kp_revisions WHERE kind='allocation' AND (" +
        "((record_id LIKE '@actual:%' OR record_id LIKE '@worked:%')" +
        numericDate +
        ")" +
        " OR record_id LIKE '@person:%' OR record_id='@calendar:shared')" +
        (provider === "sqljs" ? " ORDER BY rowid" : ""),
      ["kind", "record_id", "revision"],
      revisionRecordKey,
      Number,
      period || [],
    );
  }
  const ownerSet = new Set(owners),
    monthSet = new Set(months);
  data.personCalendar = filterOwnRecords(data.personCalendar, (key) => {
    const parts = key.split("|");
    return (
      (kind === "actual" && canReadPersonalCalendar(user, parts[0])) ||
      legacy ||
      (ownerSet.has(parts[0]) && monthSet.has(parts[1]?.slice(0, 7)))
    );
  });
  data.resources = resources;
  return data;
}
