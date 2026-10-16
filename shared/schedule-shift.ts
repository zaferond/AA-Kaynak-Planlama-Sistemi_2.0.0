import { buildCapacityIndex } from "./metrics.ts";
import type {
  Data,
  Milestone,
  MilestoneNote,
  MilestoneRange,
  Project,
} from "./model.ts";

/** One project moved by `months` from `fromMonth` on. Earlier months are the
 * realised past and stay where they are; actual entries never move. */
export type ProjectShift = {
  projectId: string;
  months: number;
  fromMonth: string;
};
export type ShiftScenario = {
  id: string;
  name: string;
  shifts: ProjectShift[];
  /** Phases, headings, notes and milestones move with the plan. */
  includeTimeline: boolean;
};

export function addMonths(month: string, count: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + count, 1)).toISOString().slice(0, 7);
}

/** Same day in the target month, clamped to its length (31 Jan + 1 = 28/29 Feb). */
export function shiftDate(date: string, count: number) {
  const month = addMonths(date.slice(0, 7), count);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Number(date.slice(8, 10)), last);
  return month + "-" + String(day).padStart(2, "0");
}

function shiftKeyed<T>(
  values: Record<string, T> | undefined,
  shift: ProjectShift,
) {
  if (!values) return values;
  return Object.fromEntries(
    Object.entries(values).map(([month, value]) => [
      month >= shift.fromMonth ? addMonths(month, shift.months) : month,
      value,
    ]),
  );
}

function shiftTimelineDates(project: Project, shift: ProjectShift): Project {
  const move = (date: string | undefined) =>
    date && date.slice(0, 7) >= shift.fromMonth
      ? shiftDate(date, shift.months)
      : date;
  const notes = (list: MilestoneNote[] | undefined) =>
    list?.map((note) => ({
      ...note,
      ...(note.start ? { start: move(note.start) } : {}),
      ...(note.end ? { end: move(note.end) } : {}),
    }));
  const range = (r: MilestoneRange): MilestoneRange => ({
    ...r,
    start: move(r.start)!,
    end: move(r.end)!,
    ...(r.notes ? { notes: notes(r.notes) } : {}),
  });
  const milestone = (m: Milestone): Milestone => ({
    ...m,
    start: move(m.start)!,
    end: move(m.end)!,
    ...(m.additionalRanges
      ? { additionalRanges: m.additionalRanges.map(range) }
      : {}),
    ...(m.barNotes ? { barNotes: notes(m.barNotes) } : {}),
  });
  return {
    ...project,
    phases: shiftKeyed(project.phases, shift) || {},
    ...(project.phaseColors
      ? { phaseColors: shiftKeyed(project.phaseColors, shift) }
      : {}),
    ...(project.milestones
      ? { milestones: project.milestones.map(milestone) }
      : {}),
  };
}

export function shiftProject(
  project: Project,
  shift: ProjectShift,
  includeTimeline: boolean,
): Project {
  const moved = (month: string) =>
    month >= shift.fromMonth ? addMonths(month, shift.months) : month;
  const base = includeTimeline ? shiftTimelineDates(project, shift) : project;
  return { ...base, start: moved(project.start), end: moved(project.end) };
}

export type ScenarioResult = {
  data: Data;
  /** Planned entries that changed month. */
  moved: number;
  /** Reasons the scenario cannot be used as entered. */
  problems: string[];
};

/** Apply a scenario to a copy of the planning data; nothing is saved. */
export function applyScenario(
  data: Data,
  scenario: ShiftScenario,
): ScenarioResult {
  const problems: string[] = [];
  const shifts = new Map<string, ProjectShift>();
  for (const shift of scenario.shifts) {
    const project = data.projects.find((p) => p.id === shift.projectId);
    if (!project || !shift.months) continue;
    if (shifts.has(shift.projectId)) {
      problems.push(`${project.name} senaryoda birden fazla kez seçildi.`);
      continue;
    }
    shifts.set(shift.projectId, shift);
  }
  const allocations: Record<string, number> = {};
  let moved = 0;
  for (const [key, value] of Object.entries(data.allocations)) {
    const [team, projectId, month] = key.split("|");
    const shift = shifts.get(projectId);
    if (!shift || month < shift.fromMonth) {
      allocations[key] = (allocations[key] || 0) + value;
      continue;
    }
    const target = addMonths(month, shift.months);
    if (target < shift.fromMonth) {
      const name = data.projects.find((p) => p.id === projectId)!.name;
      const message = `${name}: öne çekme, ${month} planını başlangıç ayından (${shift.fromMonth}) önceye taşır.`;
      if (!problems.includes(message)) problems.push(message);
    }
    const id = team + "|" + projectId + "|" + target;
    allocations[id] = (allocations[id] || 0) + value;
    if (value) moved++;
  }
  const projects = data.projects.map((project) => {
    const shift = shifts.get(project.id);
    return shift
      ? shiftProject(project, shift, scenario.includeTimeline)
      : project;
  });
  return { data: { ...data, allocations, projects }, moved, problems };
}

export type ScenarioSummary = {
  /** Planning units with a planned entry on a shifted project. */
  teamIds: string[];
  /** Σ over affected units and months of max(0, planned − active). */
  shortage: number;
  /** Months in which at least one affected unit is short. */
  shortageMonths: number;
  peak: { month: string; value: number } | null;
  /** Active − planned per `team|month`, for affected units. */
  remaining: Record<string, number>;
  /** Capacity of every unit, so callers can total any group of units. */
  index: Record<string, { current: number; total: number }>;
};

/** Teams touched by the shifted projects, in the current or shifted plan. */
export function affectedTeams(datasets: Data[], projectIds: string[]) {
  const ids = new Set(projectIds);
  const teams = new Set<string>();
  for (const d of datasets)
    for (const [key, value] of Object.entries(d.allocations)) {
      const [team, project] = key.split("|");
      if (value && ids.has(project)) teams.add(team);
    }
  return [...teams];
}

export function summarizeScenario(
  data: Data,
  teamIds: string[],
  months: string[],
): ScenarioSummary {
  const index = buildCapacityIndex(data, months);
  const remaining: Record<string, number> = {};
  let shortage = 0,
    shortageMonths = 0;
  let peak: ScenarioSummary["peak"] = null;
  for (const month of months) {
    let monthShortage = 0;
    for (const team of teamIds) {
      const cell = index[team + "|" + month];
      if (!cell) continue;
      const left = cell.current - cell.total;
      remaining[team + "|" + month] = left;
      if (left < -1e-9) monthShortage -= left;
    }
    if (monthShortage > 1e-9) {
      shortage += monthShortage;
      shortageMonths++;
      if (!peak || monthShortage > peak.value + 1e-9)
        peak = { month, value: monthShortage };
    }
  }
  return { teamIds, shortage, shortageMonths, peak, remaining, index };
}

/** A saved scenario: draft → approved (admin) → applied (admin) → reverted. */
export type ScenarioStatus = "draft" | "approved" | "applied" | "reverted";
export type ScenarioUndo = {
  /** The shifted projects and their planned entries before the transfer. */
  projects: Record<string, Project>;
  allocations: Record<string, number>;
  /** State right after the transfer; undo only while it is unchanged.
   * Projects are compared by revision (the server normalises their content). */
  afterProjectRevisions: Record<string, number>;
  afterAllocations: Record<string, number>;
};
export type SavedScenario = ShiftScenario & {
  status: ScenarioStatus;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  approvedByName?: string;
  approvedAt?: string;
  appliedByName?: string;
  appliedAt?: string;
  revertedByName?: string;
  revertedAt?: string;
  undo?: ScenarioUndo;
};
export const SCENARIO_STATUS_LABELS: Record<ScenarioStatus, string> = {
  draft: "Taslak",
  approved: "Onaylandı",
  applied: "Takvime aktarıldı",
  reverted: "Geri alındı",
};

type PlanChange =
  | { kind: "project"; id: string; value: Project; revision: number }
  | {
      kind: "allocation";
      id: string;
      value: number | null;
      revision: number;
      operation?: "delete";
    };

const scenarioProjectIds = (scenario: ShiftScenario) => [
  ...new Set(
    scenario.shifts
      .filter((s) => s.projectId && s.months)
      .map((s) => s.projectId),
  ),
];
function projectAllocations(data: Data, projectIds: string[]) {
  const ids = new Set(projectIds);
  return Object.fromEntries(
    Object.entries(data.allocations).filter(
      ([key, value]) => value && ids.has(key.split("|")[1]),
    ),
  );
}
const revision = (data: Data, key: string) => data.revisions[key] || 0;

/** Planned-entry and project changes that turn `from` into `to`. */
function planChanges(
  data: Data,
  projects: Record<string, Project>,
  from: Record<string, number>,
  to: Record<string, number>,
): PlanChange[] {
  const changes: PlanChange[] = Object.entries(projects).map(([id, value]) => ({
    kind: "project",
    id,
    value,
    revision: revision(data, "project:" + id),
  }));
  for (const id of Object.keys(from))
    if (!(id in to))
      changes.push({
        kind: "allocation",
        id,
        value: null,
        operation: "delete",
        revision: revision(data, "allocation:" + id),
      });
  for (const [id, value] of Object.entries(to))
    if (from[id] !== value)
      changes.push({
        kind: "allocation",
        id,
        value,
        revision: revision(data, "allocation:" + id),
      });
  return changes;
}

/** Changes that write an approved scenario into the real calendar, plus what
 * is needed to undo it. Built from the complete (admin) snapshot. */
export function scenarioApplyPlan(data: Data, scenario: ShiftScenario) {
  const projectIds = scenarioProjectIds(scenario);
  const result = applyScenario(data, scenario);
  if (result.problems.length) throw Error(result.problems[0]);
  const pick = (d: Data) =>
    Object.fromEntries(
      d.projects.filter((p) => projectIds.includes(p.id)).map((p) => [p.id, p]),
    );
  const before = projectAllocations(data, projectIds);
  const after = projectAllocations(result.data, projectIds);
  const undo: ScenarioUndo = {
    projects: structuredClone(pick(data)),
    allocations: before,
    // Each project change in the transfer raises its revision by exactly one.
    afterProjectRevisions: Object.fromEntries(
      projectIds.map((id) => [id, revision(data, "project:" + id) + 1]),
    ),
    afterAllocations: after,
  };
  return {
    changes: planChanges(data, pick(result.data), before, after),
    undo,
    moved: result.moved,
  };
}

/** Changes that restore the calendar from before the transfer. Refused when the
 * shifted projects or their planned entries changed after the transfer. */
export function scenarioRevertPlan(data: Data, undo: ScenarioUndo) {
  const projectIds = Object.keys(undo.projects);
  const nowAllocations = projectAllocations(data, projectIds);
  const changedProject = projectIds.some(
    (id) =>
      !data.projects.some((p) => p.id === id) ||
      revision(data, "project:" + id) !== undo.afterProjectRevisions[id],
  );
  if (
    changedProject ||
    JSON.stringify(sortKeys(nowAllocations)) !==
      JSON.stringify(sortKeys(undo.afterAllocations))
  )
    throw Error(
      "Aktarmadan sonra bu projelerde değişiklik yapılmış; otomatik geri alma güvenli değil. Değişiklikleri elle düzeltin.",
    );
  return planChanges(data, undo.projects, nowAllocations, undo.allocations);
}
const sortKeys = (record: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
  );
