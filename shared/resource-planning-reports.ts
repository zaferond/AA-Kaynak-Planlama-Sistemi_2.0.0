import type { Data, Team } from "./model.ts";
import {
  buildCapacityIndex,
  sumCapacityMetrics,
  type Metric,
} from "./metrics.ts";
import { monthEndDate, normalizeResourceDate } from "./resource-dates.ts";

export function capacityTrend(
  cache: Record<string, Metric>,
  ids: string[],
  months: string[],
) {
  return months.map((month) => ({
    month,
    ...sumCapacityMetrics(cache, ids, month),
  }));
}

/** Null means no capacity: never disguise a positive demand / zero capacity as 0%. */
export function utilization(metric: Metric) {
  return metric.current > 0 ? (metric.total / metric.current) * 100 : null;
}

/** Average each team's positive monthly deficit over all selected months, including zero months. */
export function rankTeamShortages(
  cache: Record<string, Metric>,
  teams: Team[],
  months: string[],
) {
  return teams
    .map((team) => ({
      team,
      averageShortage: months.length
        ? months.reduce((sum, month) => {
            const cell = cache[team.id + "|" + month];
            return sum + (cell ? Math.max(0, cell.total - cell.current) : 0);
          }, 0) / months.length
        : 0,
    }))
    .filter((row) => row.averageShortage > 0)
    .sort(
      (a, b) =>
        b.averageShortage - a.averageShortage ||
        a.team.name.localeCompare(b.team.name, "tr"),
    );
}

/** Preserve the day, clamping to the last day of the target month. */
export function delayStartDate(start: string, delay: number) {
  const date = normalizeResourceDate(start, "start");
  const target = new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1 + delay, 1),
  );
  const month = target.toISOString().slice(0, 7);
  return (
    month +
    "-" +
    String(
      Math.min(
        Number(date.slice(8, 10)),
        Number(monthEndDate(month).slice(8, 10)),
      ),
    ).padStart(2, "0")
  );
}

/** Read-only scenario. Only included active postings with today/future start dates move.
 * Effective versions, team transfers, end dates and working statuses retain planning semantics.
 */
export function hiringScenario(
  data: Data,
  cache: Record<string, Metric>,
  ids: string[],
  months: string[],
  delay: number,
  asOfDate: string,
) {
  const shifted: Data = {
    ...data,
    resources: data.resources.map((resource) => ({
      ...resource,
      versions: resource.versions.map((version) =>
        version.included &&
        version.status === "Aktif İlan" &&
        version.start &&
        normalizeResourceDate(version.start, "start") >= asOfDate
          ? { ...version, start: delayStartDate(version.start, delay) }
          : version,
      ),
    })),
  };
  const delayed = buildCapacityIndex(shifted, months);
  return capacityTrend(cache, ids, months).map((point) => {
    const delayedCapacity = sumCapacityMetrics(
      delayed,
      ids,
      point.month,
    ).current;
    return {
      month: point.month,
      plannedShortage: Math.max(0, point.total - point.current),
      delayedShortage: Math.max(0, point.total - delayedCapacity),
    };
  });
}

export type ProjectResourceComparison = {
  project: Data["projects"][number];
  plannedTotal: number;
  actualTotal: number;
  plannedAverage: number;
  actualAverage: number;
};

/** Aggregate the authorized team/project records once; statuses never erase historical actuals.
 * The same selected months (including zero months) are used for both averages.
 */
export function resourceAllocationComparison(
  data: Pick<Data, "projects" | "allocations">,
  actualTeamTotals: Record<string, number>,
  teamIds: string[],
  months: string[],
) {
  const selectedTeams = new Set(teamIds);
  const selectedMonths = [...new Set(months)];
  const monthRows = new Map(
    selectedMonths.map((month) => [month, { month, planned: 0, actual: 0 }]),
  );
  const projects = new Map(
    data.projects.map((project) => [project.id, project]),
  );
  const totals = new Map<string, ProjectResourceComparison>();
  function collect(
    entries: Record<string, number>,
    kind: "planned" | "actual",
  ) {
    for (const [key, value] of Object.entries(entries)) {
      const [teamId, projectId, month] = key.split("|");
      const point = monthRows.get(month),
        project = projects.get(projectId);
      if (
        !selectedTeams.has(teamId) ||
        !point ||
        !project ||
        !Number.isFinite(value) ||
        value <= 0
      )
        continue;
      point[kind] += value;
      let row = totals.get(projectId);
      if (!row) {
        row = {
          project,
          plannedTotal: 0,
          actualTotal: 0,
          plannedAverage: 0,
          actualAverage: 0,
        };
        totals.set(projectId, row);
      }
      if (kind === "planned") row.plannedTotal += value;
      else row.actualTotal += value;
    }
  }
  collect(data.allocations, "planned");
  collect(actualTeamTotals, "actual");
  for (const row of totals.values()) {
    row.plannedAverage = row.plannedTotal / selectedMonths.length;
    row.actualAverage = row.actualTotal / selectedMonths.length;
  }
  return { months: [...monthRows.values()], projects: [...totals.values()] };
}

/** Rank the displayed measure; both series use actuals first and planned values to break ties. */
export function topResourceProjects(
  rows: ProjectResourceComparison[],
  showPlanned: boolean,
  showActual: boolean,
  limit = 10,
) {
  if (!showPlanned && !showActual) return [];
  return rows
    .filter(
      (row) =>
        (showPlanned && row.plannedTotal > 0) ||
        (showActual && row.actualTotal > 0),
    )
    .sort(
      (a, b) =>
        (showActual ? b.actualTotal - a.actualTotal : 0) ||
        (showPlanned ? b.plannedTotal - a.plannedTotal : 0) ||
        a.project.name.localeCompare(b.project.name, "tr") ||
        a.project.id.localeCompare(b.project.id),
    )
    .slice(0, limit);
}

/** Ratios of aggregated actual/planned resources. Undefined months stay absent, not zero.
 * The period ratio is the ratio of totals, never the average of monthly percentages.
 */
export function planningEffectiveness(
  points: { month: string; planned: number; actual: number }[],
) {
  function percentage(actual: number, planned: number): number | null {
    if (
      !Number.isFinite(actual) ||
      !Number.isFinite(planned) ||
      actual < 0 ||
      planned <= 0
    )
      return null;
    const value = (actual / planned) * 100;
    return Number.isFinite(value) ? value : null;
  }
  let plannedTotal = 0,
    actualTotal = 0;
  const months = points.map((point) => {
    if (
      Number.isFinite(point.planned) &&
      Number.isFinite(point.actual) &&
      point.planned >= 0 &&
      point.actual >= 0
    ) {
      plannedTotal += point.planned;
      actualTotal += point.actual;
    }
    return { ...point, percent: percentage(point.actual, point.planned) };
  });
  return {
    months,
    plannedTotal,
    actualTotal,
    percent: percentage(actualTotal, plannedTotal),
  };
}
