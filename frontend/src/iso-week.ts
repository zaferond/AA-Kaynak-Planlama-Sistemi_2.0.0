const DAY = 86_400_000;
const isoDate = (value: number) => new Date(value).toISOString().slice(0, 10);
const shortDate = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** ISO 8601 week: Monday start; week 1 holds the year's first Thursday. */
export type IsoWeek = {
  key: string;
  year: number;
  week: number;
  start: string;
  end: string;
};

export function isoWeek(date: string): IsoWeek {
  const day = Date.parse(date + "T00:00:00Z");
  const monday = day - ((new Date(day).getUTCDay() + 6) % 7) * DAY;
  const year = new Date(monday + 3 * DAY).getUTCFullYear();
  const january4 = Date.UTC(year, 0, 4);
  const firstMonday =
    january4 - ((new Date(january4).getUTCDay() + 6) % 7) * DAY;
  const week = Math.round((monday - firstMonday) / (7 * DAY)) + 1;
  return {
    key: `${year}-W${String(week).padStart(2, "0")}`,
    year,
    week,
    start: isoDate(monday),
    end: isoDate(monday + 6 * DAY),
  };
}

export const shiftWeek = (week: IsoWeek, weeks: number) =>
  isoWeek(isoDate(Date.parse(week.start + "T00:00:00Z") + weeks * 7 * DAY));

/** Every ISO week a date range touches, in order. */
export function weeksInRange(start: string, end: string): IsoWeek[] {
  const valid = /^\d{4}-\d{2}-\d{2}$/;
  if (!valid.test(start)) return [];
  const last = valid.test(end) && end > start ? end : start;
  const weeks = [isoWeek(start)];
  while (weeks.at(-1)!.end < last) weeks.push(shiftWeek(weeks.at(-1)!, 1));
  return weeks;
}

/** "W33"; weeks outside the reference year carry their year: "W03 '27". */
export const weekLabel = (week: IsoWeek, referenceYear: number) =>
  `W${String(week.week).padStart(2, "0")}` +
  (week.year === referenceYear ? "" : ` '${String(week.year).slice(2)}`);

export const weekDates = (week: IsoWeek) =>
  shortDate.format(Date.parse(week.start + "T00:00:00Z")) +
  " – " +
  shortDate.format(Date.parse(week.end + "T00:00:00Z")) +
  " " +
  week.end.slice(0, 4);
