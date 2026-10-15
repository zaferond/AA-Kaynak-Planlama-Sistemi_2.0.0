import {
  actualVersionAt,
  isActualStatus,
  type Data,
  type Project,
  type Team,
} from "./model.ts";
import { createActualMonthIndex } from "./actual-months.ts";
import { fteToActualInput, type ActualUnit } from "./actual-units.ts";

export type ActivityMonth = {
  month: string;
  state: "working" | "before-start" | "departed" | "other-team" | "future";
  totalFte: number;
  projectFte: number;
  trainingHours: number;
  effectiveHours: number;
  start: string;
  end: string;
};
export type ActivityRow = {
  key: string;
  resourceId: string;
  name: string;
  teamId: string;
  team: string;
  lead: string;
  cells: ActivityMonth[];
};

/** Input must be the API's scoped snapshot. Historical assignments keep transfers and departures visible. */
export function buildActivityRows(
  data: Data,
  teams: Team[],
  projects: Project[],
  months: string[],
  currentMonth: string,
  ownResourceId?: string,
): ActivityRow[] {
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const projectIds = new Set(projects.map((project) => project.id));
  const selectedActuals: Record<string, number> = {};
  for (const [key, value] of Object.entries(data.actualAllocations || {})) {
    const [, projectId] = key.split("|");
    if (projectIds.has(projectId)) selectedActuals[key] = value;
  }
  const totals = createActualMonthIndex({
    ...data,
    actualAllocations: selectedActuals,
  });
  const rows: ActivityRow[] = [];
  for (const resource of data.resources) {
    // Anonymous colleagues and unmapped normal accounts must never become named report rows.
    if (
      !resource.name ||
      (ownResourceId !== undefined && resource.id !== ownResourceId)
    )
      continue;
    // Visibility follows the current status, never the presence of old activity.
    // Historical assignments/values remain intact for the eligible employee rows.
    const current = actualVersionAt(resource, currentMonth);
    if (!current || !isActualStatus(current.status)) continue;
    const assignments = months.map((month) => actualVersionAt(resource, month));
    const visibleTeamIds = new Set(
      assignments
        .map((v) => v?.team)
        .filter((id): id is string => !!id && teamById.has(id)),
    );
    for (const teamId of visibleTeamIds) {
      const team = teamById.get(teamId)!;
      rows.push({
        key: resource.id + "|" + teamId,
        resourceId: resource.id,
        name: resource.name,
        teamId,
        team: team.name,
        lead: team.lead || "Liderlik eşleştirilmemiş",
        cells: months.map((month, index) => {
          const version = assignments[index];
          const assigned = version?.team === teamId;
          const start = assigned ? version.start : "";
          const end = assigned ? version.end : "";
          const state: ActivityMonth["state"] = !assigned
            ? "other-team"
            : start && month < start.slice(0, 7)
              ? "before-start"
              : (end && month >= end.slice(0, 7)) ||
                  (version.status === "İşten Ayrıldı" && !end)
                ? "departed"
                : month > currentMonth
                  ? "future"
                  : "working";
          // Preserve recorded historical values, even if employment dates/status were later changed.
          const value =
            assigned && month <= currentMonth
              ? totals.get(resource.id, month)
              : undefined;
          return {
            month,
            state,
            start,
            end,
            totalFte: value?.totalFte || 0,
            projectFte: value?.projectFte || 0,
            trainingHours: value?.trainingHours || 0,
            effectiveHours: value?.effectiveHours || 0,
          };
        }),
      });
    }
  }
  const names = new Intl.Collator("tr-TR", {
    sensitivity: "base",
    numeric: true,
  });
  return rows.sort(
    (a, b) =>
      names.compare(a.lead, b.lead) ||
      names.compare(a.team, b.team) ||
      names.compare(a.name, b.name) ||
      a.key.localeCompare(b.key),
  );
}

export function activityValue(
  cell: ActivityMonth,
  unit: ActualUnit,
): number | null {
  if (cell.state === "other-team" || cell.state === "future") return null;
  if (
    cell.totalFte === 0 &&
    (cell.state === "before-start" || cell.state === "departed")
  )
    return null;
  // A recorded value with zero capacity has no meaningful percentage; hours/days remain visible.
  if (unit === "percent" && cell.effectiveHours === 0 && cell.totalFte > 0)
    return null;
  return fteToActualInput(cell.totalFte, unit, cell.month, cell.effectiveHours);
}
