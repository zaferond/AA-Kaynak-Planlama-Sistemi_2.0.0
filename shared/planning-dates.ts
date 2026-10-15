/** Supported domain dates. Keep filtering, calendars and import validation aligned. */
export const MIN_PLANNING_YEAR = 2000;
export const MAX_PLANNING_YEAR = 2199;
export const MIN_PLANNING_MONTH = `${MIN_PLANNING_YEAR}-01`;
export const MAX_PLANNING_MONTH = `${MAX_PLANNING_YEAR}-12`;
export const MIN_PLANNING_DATE = `${MIN_PLANNING_MONTH}-01`;
export const MAX_PLANNING_DATE = `${MAX_PLANNING_MONTH}-31`;
export const PLANNING_PERIODS = [6, 12, 24, 36, 48, 60];
export const MAX_FILTER_START = `${MAX_PLANNING_YEAR - Math.max(...PLANNING_PERIODS) / 12 + 1}-01`;

export function validPlanningMonth(value: string): boolean {
  return (
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
    value >= MIN_PLANNING_MONTH &&
    value <= MAX_PLANNING_MONTH
  );
}
export function validPlanningDate(value: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < MIN_PLANNING_DATE ||
    value > MAX_PLANNING_DATE
  )
    return false;
  const parsed = new Date(value + "T12:00:00Z");
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export function clampFilterStart(value: string): string {
  return value < MIN_PLANNING_MONTH
    ? MIN_PLANNING_MONTH
    : value > MAX_FILTER_START
      ? MAX_FILTER_START
      : value;
}
