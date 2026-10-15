import type { MilestoneRange } from "./model";
import type { TimelinePeriod } from "./timeline-periods";

const daysInMonth = (month: string) =>
  new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();

export type MilestoneBar = {
  range: MilestoneRange;
  left: number;
  width: number;
};

export function dateAtTrackPosition(
  clientX: number,
  left: number,
  width: number,
  months: string[],
): string {
  if (!months.length || width <= 0)
    throw Error("Görünür takvim ayı bulunamadı.");
  const position = Math.min(
    months.length - 1e-9,
    Math.max(0, ((clientX - left) / width) * months.length),
  );
  const monthIndex = Math.floor(position),
    month = months[monthIndex];
  const day = Math.floor((position - monthIndex) * daysInMonth(month)) + 1;
  return month + "-" + String(day).padStart(2, "0");
}

export function calendarDayDifference(first: string, last: string): number {
  return Math.round(
    (Date.parse(last + "T12:00:00Z") - Date.parse(first + "T12:00:00Z")) /
      86400000,
  );
}

export function dateAtPeriodPosition(
  clientX: number,
  left: number,
  width: number,
  periods: readonly TimelinePeriod[],
): string {
  if (!periods.length || width <= 0)
    throw Error("Görünür takvim haftası bulunamadı.");
  const position = Math.min(
    periods.length - 1e-9,
    Math.max(0, ((clientX - left) / width) * periods.length),
  );
  const index = Math.floor(position),
    period = periods[index];
  const days = calendarDayDifference(period.start, period.end) + 1;
  return new Date(
    Date.parse(period.start + "T12:00:00Z") +
      Math.floor((position - index) * days + 1e-9) * 86400000,
  )
    .toISOString()
    .slice(0, 10);
}

/** Position inclusive date ranges in equally sized week columns. */
export function milestoneBarsForPeriods(
  ranges: MilestoneRange[],
  periods: readonly TimelinePeriod[],
): MilestoneBar[] {
  if (!periods.length) return [];
  const first = periods[0].start,
    last = periods.at(-1)!.end;
  return ranges.flatMap((range) => {
    const from = range.start < first ? first : range.start;
    const to = range.end > last ? last : range.end;
    if (from > to) return [];
    const fromIndex = periods.findIndex(
      (period) => from >= period.start && from <= period.end,
    );
    const toIndex = periods.findIndex(
      (period) => to >= period.start && to <= period.end,
    );
    if (fromIndex < 0 || toIndex < 0) return [];
    const startPeriod = periods[fromIndex],
      endPeriod = periods[toIndex];
    const left =
      ((fromIndex +
        calendarDayDifference(startPeriod.start, from) /
          (calendarDayDifference(startPeriod.start, startPeriod.end) + 1)) /
        periods.length) *
      100;
    const right =
      ((toIndex +
        (calendarDayDifference(endPeriod.start, to) + 1) /
          (calendarDayDifference(endPeriod.start, endPeriod.end) + 1)) /
        periods.length) *
      100;
    return [{ range, left, width: right - left }];
  });
}

/** Position each inclusive day range on the shared month track. */
export function milestoneBars(
  ranges: MilestoneRange[],
  months: string[],
): MilestoneBar[] {
  if (!months.length) return [];
  const first = months[0] + "-01",
    lastMonth = months.at(-1)!;
  const last =
    lastMonth + "-" + String(daysInMonth(lastMonth)).padStart(2, "0");
  return ranges.flatMap((range) => {
    const from = range.start < first ? first : range.start;
    const to = range.end > last ? last : range.end;
    if (from > to) return [];
    const fromMonth = from.slice(0, 7),
      toMonth = to.slice(0, 7);
    const fromIndex = months.indexOf(fromMonth),
      toIndex = months.indexOf(toMonth);
    if (fromIndex < 0 || toIndex < 0) return [];
    const left =
      ((fromIndex + (Number(from.slice(8)) - 1) / daysInMonth(fromMonth)) /
        months.length) *
      100;
    const right =
      ((toIndex + Number(to.slice(8)) / daysInMonth(toMonth)) / months.length) *
      100;
    return [{ range, left, width: right - left }];
  });
}
