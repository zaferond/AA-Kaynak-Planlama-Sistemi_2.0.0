import type { Change } from "../../../shared/commands.ts";
import type { Data, Project } from "../../../shared/model.ts";
import type { ProjectSnapshot } from "./project-snapshot.ts";
import {
  changeMilestoneNoteDates,
  milestoneRanges,
  rangeNotes,
  resizeMilestoneRange,
  shiftMilestoneRange,
  withMilestoneRanges,
} from "../../../shared/milestone-ranges.ts";

/** Keep the project and revision captured when the menu opened as one snapshot. */
export function prepareMilestoneReportChange(
  project: Project,
  revision: number,
  milestoneId: string,
  rangeIndex: number,
  noteIndex: number,
  includeInReport: boolean,
): Change<"project"> {
  const milestone = project.milestones?.find((item) => item.id === milestoneId);
  const range = milestone && milestoneRanges(milestone)[rangeIndex];
  const notes = range ? rangeNotes(range) : [];
  if (
    !milestone ||
    !Number.isInteger(rangeIndex) ||
    !Number.isInteger(noteIndex) ||
    !notes[noteIndex]
  )
    throw Error("Detay not bulunamadı. Menüyü yeniden açıp tekrar deneyin.");
  if (includeInReport && !notes[noteIndex].text.trim())
    throw Error("Rapora eklenecek detay not boş olamaz.");
  const nextNotes = notes.map((note, index) =>
    index === noteIndex ? { ...note, includeInReport } : note,
  );
  const changed =
    rangeIndex === 0
      ? { ...milestone, barNotes: nextNotes }
      : {
          ...milestone,
          additionalRanges: milestone.additionalRanges?.map((item, index) =>
            index === rangeIndex - 1 ? { ...item, notes: nextNotes } : item,
          ),
        };
  return {
    kind: "project",
    id: project.id,
    revision,
    value: {
      ...project,
      milestones: project.milestones?.map((item) =>
        item.id === milestoneId ? changed : item,
      ),
    },
  };
}

/** Reorder only topics within one project; dates and nested notes stay intact. */
export function prepareMilestoneReorder(
  data: Data,
  projectId: string,
  sourceId: string,
  targetId: string,
  after: boolean,
  expectedOrder: readonly string[],
): Change<"project"> | null {
  const project = data.projects.find((item) => item.id === projectId);
  const milestones = project?.milestones || [];
  if (
    !project ||
    !milestones.some((m) => m.id === sourceId) ||
    !milestones.some((m) => m.id === targetId)
  )
    throw Error("Kritik konu bulunamadı. Verileri yenileyip tekrar deneyin.");
  if (
    milestones.length !== expectedOrder.length ||
    milestones.some((m, i) => m.id !== expectedOrder[i])
  )
    throw Error("Kritik konu sıralaması değişmiş. Tekrar deneyin.");
  if (sourceId === targetId) return null;
  const source = milestones.find((m) => m.id === sourceId)!;
  const reordered = milestones.filter((m) => m.id !== sourceId);
  const target = reordered.findIndex((m) => m.id === targetId);
  reordered.splice(target + (after ? 1 : 0), 0, source);
  if (reordered.every((m, i) => m.id === milestones[i].id)) return null;
  return {
    kind: "project",
    id: project.id,
    revision: data.revisions["project:" + project.id] || 0,
    value: { ...project, milestones: reordered },
  };
}

type DateAdjustment = {
  rangeIndex: number;
  mode: "move" | "start" | "end";
  days: number;
} & ({ target: "range" } | { target: "note"; noteIndex: number });

/** Never rebase an index-based drag onto a project received after pointer down. */
export function prepareTimelineChange(
  { project, revision }: ProjectSnapshot,
  milestoneId: string,
  adjustment: DateAdjustment,
): Change<"project"> {
  const milestone = project.milestones?.find((item) => item.id === milestoneId);
  if (!milestone)
    throw Error("Kritik konu bulunamadı. Verileri yenileyip tekrar deneyin.");
  const { rangeIndex, mode, days } = adjustment;
  const changed =
    adjustment.target === "note"
      ? changeMilestoneNoteDates(
          project,
          milestone,
          rangeIndex,
          adjustment.noteIndex,
          mode,
          days,
        )
      : mode === "move"
        ? shiftMilestoneRange(project, milestone, rangeIndex, days)
        : resizeMilestoneRange(project, milestone, rangeIndex, mode, days);
  const ordered = withMilestoneRanges(
    changed,
    milestoneRanges(changed).sort(
      (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
    ),
  );
  return {
    kind: "project",
    id: project.id,
    revision,
    value: {
      ...project,
      milestones: project.milestones?.map((item) =>
        item.id === milestone.id ? ordered : item,
      ),
    },
  };
}
