import type { MilestoneRange } from "./model";
import type { TimelinePeriod } from "./timeline-periods";
import {
  calendarDayDifference,
  dateAtPeriodPosition,
} from "./milestone-bars.ts";
import { noteDates, rangeNotes } from "./milestone-ranges.ts";

export type WeeklyNoteBar = {
  rangeIndex: number;
  noteIndex: number;
  text: string;
  completed: boolean;
  start: string;
  end: string;
  left: number;
  width: number;
  firstPeriodIndex: number;
  lastPeriodIndex: number;
  lane: number;
  color?: string;
};
export type UndatedWeeklyNote = {
  rangeIndex: number;
  noteIndex: number;
  text: string;
  completed: boolean;
};

/** Stack each week's overlapping note lane below the tallest wrapped box above it. */
export function weeklyLaneGeometry(
  laneCount: number,
  measuredHeights: readonly number[],
): { tops: number[]; height: number } {
  const tops: number[] = [];
  let bottom = 5;
  for (let lane = 0; lane < laneCount; lane++) {
    tops.push(bottom);
    bottom += Math.max(39, measuredHeights[lane] || 0) + 7;
  }
  return { tops, height: Math.max(36, bottom) };
}

/** Read the day under each pointer position, including partial weeks at month edges. */
export function daysForWeekDrag(
  fromX: number,
  toX: number,
  trackLeft: number,
  trackWidth: number,
  periods: readonly TimelinePeriod[],
): number {
  if (trackWidth <= 0 || !periods.length) return 0;
  return calendarDayDifference(
    dateAtPeriodPosition(fromX, trackLeft, trackWidth, periods),
    dateAtPeriodPosition(toX, trackLeft, trackWidth, periods),
  );
}

/** Layout dated descriptions independently of their enclosing bar dates. */
export function weeklyNoteLayout(
  ranges: MilestoneRange[],
  periods: readonly TimelinePeriod[],
): { bars: WeeklyNoteBar[]; undated: UndatedWeeklyNote[]; laneCount: number } {
  const bars: WeeklyNoteBar[] = [],
    undated: UndatedWeeklyNote[] = [];
  for (const [rangeIndex, range] of ranges.entries()) {
    if (range.displayKind === "milestone") continue;
    for (const [noteIndex, note] of rangeNotes(range).entries()) {
      const text = note.text.trim();
      if (!text) continue;
      if (!note.start && !note.end) {
        undated.push({
          rangeIndex,
          noteIndex,
          text,
          completed: !!note.completed,
        });
        continue;
      }
      const { start, end } = noteDates(note, range);
      const firstPeriodIndex = periods.findIndex(
        (period) => period.end >= start && period.start <= end,
      );
      if (firstPeriodIndex < 0) continue;
      let lastPeriodIndex = firstPeriodIndex;
      for (
        let index = firstPeriodIndex + 1;
        index < periods.length && periods[index].start <= end;
        index++
      )
        lastPeriodIndex = index;
      bars.push({
        rangeIndex,
        noteIndex,
        text,
        completed: !!note.completed,
        start,
        end,
        left: (firstPeriodIndex / periods.length) * 100,
        width:
          ((lastPeriodIndex - firstPeriodIndex + 1) / periods.length) * 100,
        firstPeriodIndex,
        lastPeriodIndex,
        lane: 0,
        color: range.color,
      });
    }
  }
  bars.sort(
    (a, b) =>
      a.firstPeriodIndex - b.firstPeriodIndex ||
      a.start.localeCompare(b.start) ||
      a.end.localeCompare(b.end) ||
      a.rangeIndex - b.rangeIndex ||
      a.noteIndex - b.noteIndex,
  );
  const laneEnds: number[] = [];
  for (const bar of bars) {
    let lane = laneEnds.findIndex((end) => end < bar.firstPeriodIndex);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = bar.lastPeriodIndex;
    bar.lane = lane;
  }
  return { bars, undated, laneCount: laneEnds.length };
}
