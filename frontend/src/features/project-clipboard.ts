import type { Change } from "../../../shared/commands.ts";
import {
  phaseColor,
  phasePalette,
  type Data,
  type Project,
} from "../../../shared/model.ts";
import {
  milestoneRanges,
  withMilestoneRanges,
} from "../../../shared/milestone-ranges.ts";
import { validPlanningMonth } from "../../../shared/planning-dates.ts";
import type { ProjectSnapshot } from "./project-snapshot.ts";
import {
  copyGridCells,
  pasteGridCells,
  type GridClipboard,
} from "../plan-cell-grid.ts";
export type PhaseTarget = { projectId: string; month: string };
export type MilestoneTarget = {
  projectId: string;
  milestoneId: string;
  rangeIndex: number;
};
export type PhaseClipboard = { text: string; color: string };
export type PhaseCopyKind = "text" | "color" | "bundle";
export type PhaseGridClipboard = GridClipboard<PhaseClipboard>;
export const phaseCellKey = (projectId: string, month: string) =>
  projectId + "|" + month;
export function phaseCellTarget(key: string): PhaseTarget {
  const separator = key.lastIndexOf("|");
  return {
    projectId: key.slice(0, separator),
    month: key.slice(separator + 1),
  };
}
export function phaseCellAvailable(data: Data, key: string) {
  const { projectId, month } = phaseCellTarget(key);
  const project = data.projects.find((project) => project.id === projectId);
  return (
    !!project &&
    validPlanningMonth(month) &&
    month >= project.start &&
    month <= project.end
  );
}
export function copyPhaseCells(
  data: Data,
  rows: string[],
  months: string[],
  selected: string[],
): PhaseGridClipboard {
  return copyGridCells(rows, months, selected, (key) => {
    const { projectId, month } = phaseCellTarget(key);
    if (!phaseCellAvailable(data, key))
      throw Error("Proje dönemi dışındaki aşama hücreleri kopyalanamaz.");
    return phaseClipboard(projectFor(data, projectId), month);
  });
}
export function preparePhaseCellsPaste(
  data: Data,
  rows: string[],
  months: string[],
  anchor: string,
  selected: string[],
  clipboard: PhaseGridClipboard,
  kind: PhaseCopyKind,
): Change<"project">[] {
  const cells = pasteGridCells(
    rows,
    months,
    anchor,
    selected,
    clipboard,
    (key) => phaseCellAvailable(data, key),
  );
  const projects = new Map<string, Project>();
  for (const { key, value } of cells) {
    const { projectId, month } = phaseCellTarget(key);
    let project = projects.get(projectId);
    if (!project) {
      const current = projectFor(data, projectId);
      project = {
        ...current,
        ...(kind !== "color" ? { phases: { ...current.phases } } : {}),
        ...(kind !== "text" ? { phaseColors: { ...current.phaseColors } } : {}),
      };
      projects.set(projectId, project);
    }
    if (kind !== "text") {
      assertColor(value.color);
      project.phaseColors![month] = value.color;
    }
    if (kind !== "color") project.phases[month] = value.text;
  }
  return [...projects.values()].map((project) => projectChange(data, project));
}
export type PhasePaste =
  | { kind: "text"; text: string }
  | { kind: "color"; color: string }
  | ({ kind: "bundle" } & PhaseClipboard);
function projectFor(data: Data, id: string) {
  const project = data.projects.find((project) => project.id === id);
  if (!project)
    throw Error("Proje bulunamadı. Verileri yenileyip tekrar deneyin.");
  return project;
}
function assertColor(color: string) {
  if (!phasePalette.some((value) => value.id === color))
    throw Error("Geçersiz renk seçimi.");
}
function projectChange(data: Data, project: Project): Change<"project"> {
  return {
    kind: "project",
    id: project.id,
    value: project,
    revision: data.revisions["project:" + project.id] || 0,
  };
}
export function phaseClipboard(
  project: Project,
  month: string,
): PhaseClipboard {
  return {
    text: project.phases[month] || "",
    color: phaseColor(project, month).id,
  };
}
export function preparePhasePaste(
  data: Data,
  target: PhaseTarget,
  content: PhasePaste,
): Change<"project"> {
  const project = projectFor(data, target.projectId),
    month = target.month;
  if (
    !validPlanningMonth(month) ||
    month < project.start ||
    month > project.end
  )
    throw Error("Proje dönemi dışına aşama yapıştırılamaz.");
  if (content.kind !== "text") assertColor(content.color);
  return projectChange(data, {
    ...project,
    ...(content.kind !== "color"
      ? { phases: { ...project.phases, [month]: content.text } }
      : {}),
    ...(content.kind !== "text"
      ? { phaseColors: { ...project.phaseColors, [month]: content.color } }
      : {}),
  });
}
function milestoneFor(project: Project, target: MilestoneTarget) {
  if (project.id !== target.projectId)
    throw Error("Proje bulunamadı. Menüyü yeniden açıp tekrar deneyin.");
  const milestone = project.milestones?.find(
    (value) => value.id === target.milestoneId,
  );
  if (!milestone)
    throw Error("Kritik konu bulunamadı. Verileri yenileyip tekrar deneyin.");
  const ranges = milestoneRanges(milestone);
  if (!Number.isInteger(target.rangeIndex) || !ranges[target.rangeIndex])
    throw Error(
      "Kritik konu tarih aralığı bulunamadı. Verileri yenileyip tekrar deneyin.",
    );
  return { project, milestone, ranges };
}
export function milestoneClipboardColor(
  project: Project,
  target: MilestoneTarget,
) {
  return milestoneFor(project, target).ranges[target.rangeIndex].color || "red";
}
export function prepareMilestoneColorPaste(
  { project, revision }: ProjectSnapshot,
  target: MilestoneTarget,
  color: string,
): Change<"project"> {
  assertColor(color);
  const { milestone, ranges } = milestoneFor(project, target);
  const changed = withMilestoneRanges(
    milestone,
    ranges.map((range, index) =>
      index === target.rangeIndex ? { ...range, color } : range,
    ),
  );
  return {
    kind: "project",
    id: project.id,
    revision,
    value: {
      ...project,
      milestones: project.milestones?.map((value) =>
        value.id === milestone.id ? changed : value,
      ),
    },
  };
}
