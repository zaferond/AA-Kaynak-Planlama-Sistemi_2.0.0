import type { Version } from "./model.ts";

/** Current planning month in the organisation's local time zone. */
export function currentPlanningMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  return (
    parts.find((part) => part.type === "year")!.value +
    "-" +
    parts.find((part) => part.type === "month")!.value
  );
}

export function currentPlanningDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  return part("year") + "-" + part("month") + "-" + part("day");
}

/** Place the marker in the middle of today's calendar day within its month. */
export function todayMonthProgress(date: string) {
  const day = Number(date.slice(8, 10));
  const days = Number(monthEndDate(date.slice(0, 7)).slice(8, 10));
  return (day - 0.5) / days;
}

export function currentYearStartDate(date = new Date()) {
  return currentPlanningMonth(date).slice(0, 4) + "-01-01";
}

export function monthEndDate(month: string) {
  return new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
}

export function normalizeResourceDate(value: string, edge: "start" | "end") {
  return value.length === 7
    ? edge === "start"
      ? value + "-01"
      : monthEndDate(value)
    : value;
}

/** Fraction of calendar days employed in the selected month, with both boundary dates included. */
export function resourceMonthFraction(version: Version, month: string) {
  const first = month + "-01",
    last = monthEndDate(month);
  const start = version.start
    ? normalizeResourceDate(version.start, "start")
    : first;
  const end = version.end ? normalizeResourceDate(version.end, "end") : last;
  const from = start > first ? start : first,
    to = end < last ? end : last;
  if (from > to) return 0;
  const ordinal = (date: string) =>
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8)),
    ) / 86400000;
  return (
    (ordinal(to) - ordinal(from) + 1) / (ordinal(last) - ordinal(first) + 1)
  );
}
