import { monthsFrom, type Data, type Project } from "../../model";
import {
  affectedTeams,
  applyScenario,
  summarizeScenario,
  type ScenarioResult,
  type ScenarioSummary,
  type ShiftScenario,
} from "../../../../shared/schedule-shift.ts";

/** The comparison never reaches further than this many months. */
const MAX_MONTHS = 72;

export function newScenario(
  name: string,
  fromMonth: string,
  months: number,
): ShiftScenario {
  return {
    id: crypto.randomUUID(),
    name,
    includeTimeline: true,
    shifts: [{ projectId: "", months, fromMonth }],
  };
}

/** First free "Senaryo X" among working and saved scenarios. */
export function nextScenarioName(existing: { name: string }[]) {
  const used = new Set(existing.map((s) => s.name));
  for (const letter of "ABCDEFGHIJKLMNOPRSTUVYZ")
    if (!used.has("Senaryo " + letter)) return "Senaryo " + letter;
  return "Senaryo " + (existing.length + 1);
}

export type ComparisonColumn = {
  key: string;
  name: string;
  summary: ScenarioSummary;
  projectEnds: Record<string, string>;
  moved: number;
};
export type ScenarioComparison = {
  ready: boolean;
  results: ScenarioResult[];
  columns: ComparisonColumn[];
  months: string[];
  teams: string[];
  projects: Project[];
};

const usable = (scenario: ShiftScenario) =>
  scenario.shifts.some((s) => s.projectId && s.months);

const monthDistance = (from: string, to: string) => {
  const [fy, fm] = from.split("-").map(Number),
    [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
};

/** Current plan versus each scenario, over the months the shifts touch. */
export function compareScenarios(
  data: Data,
  scenarios: ShiftScenario[],
  currentMonth: string,
): ScenarioComparison {
  const results = scenarios.map((scenario) => applyScenario(data, scenario));
  const valid = scenarios
    .map((scenario, index) => ({ scenario, result: results[index] }))
    .filter(
      ({ scenario, result }) => usable(scenario) && !result.problems.length,
    );
  const projectIds = [
    ...new Set(
      valid.flatMap(({ scenario }) =>
        scenario.shifts
          .filter((s) => s.projectId && s.months)
          .map((s) => s.projectId),
      ),
    ),
  ];
  if (!valid.length || !projectIds.length)
    return {
      ready: false,
      results,
      columns: [],
      months: [],
      teams: [],
      projects: [],
    };

  const datasets = [data, ...valid.map(({ result }) => result.data)];
  const teams = affectedTeams(datasets, projectIds);
  const from = valid
    .flatMap(({ scenario }) => scenario.shifts.map((s) => s.fromMonth))
    .reduce((min, month) => (month < min ? month : min), currentMonth);
  const to = datasets
    .flatMap((d) =>
      d.projects.filter((p) => projectIds.includes(p.id)).map((p) => p.end),
    )
    .reduce((max, month) => (month > max ? month : max), from);
  const months = monthsFrom(
    from,
    Math.min(MAX_MONTHS, monthDistance(from, to) + 1),
  );
  const ends = (d: Data) =>
    Object.fromEntries(
      d.projects
        .filter((p) => projectIds.includes(p.id))
        .map((p) => [p.id, p.end]),
    );
  const columns: ComparisonColumn[] = [
    {
      key: "base",
      name: "Mevcut",
      summary: summarizeScenario(data, teams, months),
      projectEnds: ends(data),
      moved: 0,
    },
    ...valid.map(({ scenario, result }) => ({
      key: scenario.id,
      name: scenario.name.trim() || "Senaryo",
      summary: summarizeScenario(result.data, teams, months),
      projectEnds: ends(result.data),
      moved: result.moved,
    })),
  ];
  return {
    ready: true,
    results,
    columns,
    months,
    teams,
    projects: data.projects.filter((p) => projectIds.includes(p.id)),
  };
}
