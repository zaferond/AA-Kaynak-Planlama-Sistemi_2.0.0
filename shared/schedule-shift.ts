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
  return { teamIds, shortage, shortageMonths, peak, remaining };
}
