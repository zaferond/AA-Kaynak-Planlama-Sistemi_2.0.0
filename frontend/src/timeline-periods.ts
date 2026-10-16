import type { Project } from "./model";
import { isoWeek } from "./iso-week.ts";

const DAY = 86_400_000;
const isoDate = (value: number) => new Date(value).toISOString().slice(0, 10);
const dayStamp = (value: string) => Date.parse(value + "T00:00:00Z");
const shortDate = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fullDate = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export type TimelinePeriod = {
  key: string;
  kind: "month" | "week";
  start: string;
  end: string;
  month: string;
  year: string;
  label: string;
  fullLabel: string;
  weekNumber?: number;
};

export const periodOverlapsProject = (
  period: TimelinePeriod,
  project: Pick<Project, "start" | "end">,
) =>
  period.end.slice(0, 7) >= project.start &&
  period.start.slice(0, 7) <= project.end;
export const phaseMonthForPeriod = (
  period: TimelinePeriod,
  project: Pick<Project, "start" | "end">,
) =>
  period.month < project.start
    ? project.start
    : period.month > project.end
      ? project.end
      : period.month;
export const phaseInitial = (text: string) =>
  (text.match(/\p{L}/u)?.[0] || Array.from(text)[0] || "").toLocaleUpperCase(
    "tr-TR",
  );

export function projectTimelinePeriods(
  months: string[],
  weekly: boolean,
): TimelinePeriod[] {
  if (!months.length) return [];
  if (!weekly)
    return months.map((month) => {
      const end = isoDate(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
      );
      return {
        key: month,
        kind: "month",
        start: month + "-01",
        end,
        month,
        year: month.slice(0, 4),
        label: month,
        fullLabel: month,
      } as TimelinePeriod;
    });
  const first = dayStamp(months[0] + "-01");
  const last = Date.UTC(
    Number(months.at(-1)!.slice(0, 4)),
    Number(months.at(-1)!.slice(5, 7)),
    0,
  );
  const periods: TimelinePeriod[] = [];
  for (let cursor = first; cursor <= last;) {
    const monday = cursor - ((new Date(cursor).getUTCDay() + 6) % 7) * DAY;
    const end = Math.min(monday + 6 * DAY, last);
    const { year: weekYear, week: weekNumber } = isoWeek(isoDate(monday));
    const year = String(weekYear);
    const startDate = isoDate(cursor),
      endDate = isoDate(end);
    periods.push({
      key: startDate,
      kind: "week",
      start: startDate,
      end: endDate,
      month: isoDate(monday + 3 * DAY).slice(0, 7),
      year,
      weekNumber,
      label: shortDate.format(cursor) + "–" + shortDate.format(end),
      fullLabel: fullDate.format(cursor) + " – " + fullDate.format(end),
    });
    cursor = end + DAY;
  }
  return periods;
}
