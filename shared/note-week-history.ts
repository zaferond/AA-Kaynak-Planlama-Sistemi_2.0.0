import type { Milestone, MilestoneNote, Project } from "./model.ts";
import { weeksInRange } from "./iso-week.ts";

/** Ten years of weeks; keys sort chronologically, the oldest drop first. */
const MAX_HISTORY = 520;

type Located = {
  note: MilestoneNote;
  start: string;
  end: string;
  slot: number;
  index: number;
};

// barNotes inherit the milestone's dates; additional range notes their range's.
function located(milestone: Milestone): Located[] {
  const lists: [MilestoneNote[] | undefined, string, string][] = [
    [milestone.barNotes, milestone.start, milestone.end],
    ...(milestone.additionalRanges || []).map(
      (range) =>
        [range.notes, range.start, range.end] as [
          MilestoneNote[] | undefined,
          string,
          string,
        ],
    ),
  ];
  return lists.flatMap(([notes, start, end], slot) =>
    (notes || []).map((note, index) => ({
      note,
      start: note.start ?? start,
      end: note.end ?? end,
      slot,
      index,
    })),
  );
}

const sameHistory = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && a.every((key, i) => key === b[i]);

/**
 * Carries each note's week history from the stored project into the incoming
 * one. When a note's dates change, the weeks it covered before join its
 * history. Notes have no ids: they match by text within the same critical
 * topic, then by position. Editors that drop the field cannot erase history.
 */
export function withWeekHistory(
  previous: Project | undefined,
  next: Project,
): Project {
  if (!previous?.milestones?.length || !next.milestones?.length) return next;
  let changed = false;
  const milestones = next.milestones.map((milestone) => {
    const before = previous.milestones!.find((m) => m.id === milestone.id);
    if (!before) return milestone;
    const old = located(before);
    const used = new Set<Located>();
    const match = (item: Located) => {
      const text = item.note.text.trim();
      const found =
        old.find((o) => !used.has(o) && o.note.text.trim() === text) ??
        old.find(
          (o) => !used.has(o) && o.slot === item.slot && o.index === item.index,
        );
      if (found) used.add(found);
      return found;
    };
    const histories = new Map<string, string[]>();
    for (const item of located(milestone)) {
      const prior = match(item);
      if (!prior) continue;
      const weeks = new Set([
        ...(prior.note.weekHistory || []),
        ...(item.note.weekHistory || []),
      ]);
      if (prior.start !== item.start || prior.end !== item.end)
        for (const week of weeksInRange(prior.start, prior.end))
          weeks.add(week.key);
      const history = [...weeks].sort().slice(-MAX_HISTORY);
      if (!sameHistory(history, item.note.weekHistory))
        histories.set(item.slot + ":" + item.index, history);
    }
    if (!histories.size) return milestone;
    changed = true;
    const patch = (notes: MilestoneNote[] | undefined, slot: number) =>
      notes?.map((note, index) => {
        const history = histories.get(slot + ":" + index);
        return history ? { ...note, weekHistory: history } : note;
      });
    return {
      ...milestone,
      ...(milestone.barNotes ? { barNotes: patch(milestone.barNotes, 0) } : {}),
      ...(milestone.additionalRanges
        ? {
            additionalRanges: milestone.additionalRanges.map((range, i) =>
              range.notes
                ? { ...range, notes: patch(range.notes, i + 1) }
                : range,
            ),
          }
        : {}),
    };
  });
  return changed ? { ...next, milestones } : next;
}
