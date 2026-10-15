import type { Project } from "./model.ts";
import {
  assertMilestoneDateRanges,
  datedNotes,
  milestoneRanges,
  noteDates,
  rangeNotes,
  expandRangeToNoteDates,
  withMilestoneRanges,
} from "./milestone-ranges.ts";

export type ReportTopic = {
  text: string;
  start: string;
  end: string;
  rangeIndex: number;
  noteIndex: number;
  completed?: boolean;
};
export type ReportInfo = { id: string; name: string; topics: ReportTopic[] };
export type ReportProject = {
  id: string;
  name: string;
  responsibleName: string;
  infos: ReportInfo[];
};

/** Keep only descriptions explicitly selected in the project editor. */
export function buildProjectInfoReport(projects: Project[]): ReportProject[] {
  return projects
    .map((project) => {
      const infos = (project.milestones || [])
        .map((milestone) => {
          const topics = milestoneRanges(milestone)
            .map((range, rangeIndex) => ({ range, rangeIndex }))
            .sort(
              (a, b) =>
                a.range.start.localeCompare(b.range.start) ||
                a.range.end.localeCompare(b.range.end),
            )
            .flatMap(({ range, rangeIndex }) =>
              rangeNotes(range).flatMap((note, noteIndex) =>
                note.includeInReport && note.text.trim()
                  ? [
                      {
                        text: note.text.trim(),
                        ...noteDates(note, range),
                        rangeIndex,
                        noteIndex,
                        ...(note.completed ? { completed: true } : {}),
                      },
                    ]
                  : [],
              ),
            )
            .sort(
              (a, b) =>
                a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
            );
          return { id: milestone.id, name: milestone.name, topics };
        })
        .filter((info) => info.topics.length);
      return {
        id: project.id,
        name: project.name,
        responsibleName: project.responsibleName?.trim() || "",
        infos,
      };
    })
    .filter((project) => project.infos.length);
}

/** Edit the underlying project note, or uncheck it without deleting its bar text. */
export function updateReportedTopic(
  project: Project,
  infoId: string,
  topic: ReportTopic,
  change:
    | { text: string; start?: string; end?: string }
    | { includeInReport: false }
    | { completed: boolean },
): Project {
  const milestones = project.milestones || [];
  const index = milestones.findIndex((item) => item.id === infoId);
  if (index < 0) throw Error("Kritik konu kaydı bulunamadı.");
  const milestone = milestones[index];
  const ranges = milestoneRanges(milestone);
  const range = ranges[topic.rangeIndex];
  const note = range && rangeNotes(range)[topic.noteIndex];
  const dates = range && note ? noteDates(note, range) : null;
  if (
    !range ||
    !note ||
    !note.includeInReport ||
    note.text.trim() !== topic.text ||
    dates?.start !== topic.start ||
    dates?.end !== topic.end ||
    !!note.completed !== !!topic.completed
  )
    throw Error("Açıklama değişmiş. Raporu yenileyip tekrar deneyin.");
  if ("text" in change && !change.text.trim())
    throw Error("Açıklama boş olamaz.");
  const start = "text" in change ? (change.start ?? topic.start) : topic.start;
  const end = "text" in change ? (change.end ?? topic.end) : topic.end;
  const notes = datedNotes(range).map((item, noteIndex) =>
    noteIndex === topic.noteIndex
      ? "text" in change
        ? { ...item, text: change.text.trim(), start, end }
        : "completed" in change
          ? { ...item, completed: change.completed }
          : { ...item, includeInReport: false }
      : item,
  );
  const changedDates = start !== topic.start || end !== topic.end;
  const updatedRange = changedDates
    ? expandRangeToNoteDates(range, notes)
    : { ...range, notes, description: notes[0]?.text || "" };
  const updatedRanges = ranges.map((item, rangeIndex) =>
    rangeIndex === topic.rangeIndex ? updatedRange : item,
  );
  assertMilestoneDateRanges(project, updatedRanges);
  const updated = withMilestoneRanges(milestone, updatedRanges);
  return {
    ...project,
    milestones: milestones.map((item, milestoneIndex) =>
      milestoneIndex === index ? updated : item,
    ),
  };
}
