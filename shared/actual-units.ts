export type ActualUnit = "percent" | "days" | "hours";
export const HOURS_PER_WORKDAY = 9;
export const DEFAULT_MONTHLY_HOURS = 180;
export const MAX_RECORDED_MONTHLY_HOURS = 1000;
export const DEFAULT_MONTHLY_DAYS = DEFAULT_MONTHLY_HOURS / HOURS_PER_WORKDAY;
export type CalendarRange = { from: string; to: string };
export type CalendarDay = {
  type: "official" | "religious" | "company";
  label: string;
  fraction: 0.5 | 1;
  range?: CalendarRange;
};
export type WorkCalendar = Record<string, CalendarDay>;
export type PersonDay = {
  type: "leave" | "training";
  hours: number;
  label: string;
  range?: CalendarRange & { hours: number };
};
export type PersonCalendar = Record<string, PersonDay>;

/** Legacy entries retain their IDs; new types get independent per-day records. */
export function personDayKey(
  resourceId: string,
  date: string,
  type: PersonDay["type"],
  calendar: PersonCalendar = {},
): string {
  const legacy = resourceId + "|" + date;
  return calendar[legacy]?.type === type ? legacy : legacy + "|" + type;
}

export function personalDayEntries(
  resourceId: string,
  date: string,
  calendar: PersonCalendar = {},
): PersonDay[] {
  const key = resourceId + "|" + date;
  return [
    calendar[key],
    calendar[key + "|leave"],
    calendar[key + "|training"],
  ].filter((entry): entry is PersonDay => !!entry);
}

/** Historical Monday-Friday capacity, used when converting stored allocations to the 180-hour baseline. */
export function workdaysInMonth(month: string): number {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  let workdays = 0;
  for (let day = 1; day <= lastDay; day++) {
    const weekday = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
    if (weekday >= 1 && weekday <= 5) workdays++;
  }
  return workdays;
}

/** Capacity of one calendar date, shared by range entry and monthly totals. */
export function workingHoursOnDate(
  date: string,
  calendar: WorkCalendar = {},
): number {
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  if (weekday === 0 || weekday === 6) return 0;
  return HOURS_PER_WORKDAY * (1 - (calendar[date]?.fraction || 0));
}

/** Weekends never contribute hours; marked weekdays subtract full or half days. */
export function calendarHoursInMonth(
  month: string,
  calendar: WorkCalendar = {},
): number {
  const year = Number(month.slice(0, 4)),
    monthIndex = Number(month.slice(5, 7)) - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  let hours = 0;
  for (let day = 1; day <= lastDay; day++) {
    const date = month + "-" + String(day).padStart(2, "0");
    hours += workingHoursOnDate(date, calendar);
  }
  return hours;
}

/** Leave reduces capacity; training uses working time and counts as distributed work. */
export function personCalendarHoursInMonth(
  month: string,
  resourceId: string,
  calendar: WorkCalendar = {},
  personal: PersonCalendar = {},
): { baseHours: number; leaveHours: number; trainingHours: number } {
  return personalMonthTotals(month, resourceId, calendar, personal);
}

type CalendarMonthDay = Readonly<{ date: string; available: number }>;

function calendarMonthDays(
  month: string,
  calendar: WorkCalendar,
): CalendarMonthDay[] {
  const year = Number(month.slice(0, 4)),
    monthIndex = Number(month.slice(5, 7)) - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const date = month + "-" + String(index + 1).padStart(2, "0");
    return { date, available: workingHoursOnDate(date, calendar) };
  });
}

function personalMonthTotals(
  month: string,
  resourceId: string,
  calendar: WorkCalendar,
  personal: PersonCalendar,
  days?: readonly CalendarMonthDay[],
) {
  const lastDay =
    days?.length ??
    new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
    ).getUTCDate();
  let baseHours = 0,
    leaveHours = 0,
    trainingHours = 0;
  for (let day = 1; day <= lastDay; day++) {
    const planned = days?.[day - 1];
    const date = planned
      ? planned.date
      : month + "-" + String(day).padStart(2, "0");
    const available = planned
      ? planned.available
      : workingHoursOnDate(date, calendar);
    baseHours += available;
    const entries = personalDayEntries(resourceId, date, personal);
    const leave = Math.min(
      entries
        .filter((entry) => entry.type === "leave")
        .reduce((sum, entry) => sum + entry.hours, 0),
      available,
    );
    const training = Math.min(
      entries
        .filter((entry) => entry.type === "training")
        .reduce((sum, entry) => sum + entry.hours, 0),
      available - leave,
    );
    leaveHours += leave;
    trainingHours += training;
  }
  return { baseHours, leaveHours, trainingHours };
}

export function personHoursInMonth(
  month: string,
  resourceId: string,
  calendar: WorkCalendar = {},
  personal: PersonCalendar = {},
): number {
  const { baseHours, leaveHours } = personCalendarHoursInMonth(
    month,
    resourceId,
    calendar,
    personal,
  );
  return baseHours - leaveHours;
}

export function leaveHoursInMonth(
  month: string,
  resourceId: string,
  calendar: WorkCalendar = {},
  personal: PersonCalendar = {},
): number {
  return personCalendarHoursInMonth(month, resourceId, calendar, personal)
    .leaveHours;
}

export function trainingHoursInMonth(
  month: string,
  resourceId: string,
  calendar: WorkCalendar = {},
  personal: PersonCalendar = {},
): number {
  return personCalendarHoursInMonth(month, resourceId, calendar, personal)
    .trainingHours;
}

/** A manual monthly hour value represents the month before marked holidays and leave. */
export function effectivePersonHoursInMonth(
  month: string,
  resourceId: string,
  manual: number | undefined,
  calendar: WorkCalendar = {},
  personal: PersonCalendar = {},
): number {
  return personMonthHours(month, resourceId, manual, calendar, personal)
    .effectiveHours;
}

/** One calendar calculation supplies display hours, stored-hour conversion and training. */
export function personMonthHours(
  month: string,
  resourceId: string,
  manual: number | undefined,
  calendar: WorkCalendar = {},
  personal: PersonCalendar = {},
) {
  const totals = personCalendarHoursInMonth(
    month,
    resourceId,
    calendar,
    personal,
  );
  return hoursFromTotals(
    totals,
    manual,
    workdaysInMonth(month) * HOURS_PER_WORKDAY,
  );
}

function hoursFromTotals(
  totals: ReturnType<typeof personalMonthTotals>,
  manual: number | undefined,
  workdayHours: number,
) {
  const autoHours = totals.baseHours - totals.leaveHours;
  const nonWorkingHours = workdayHours - totals.baseHours + totals.leaveHours;
  return {
    ...totals,
    autoHours,
    nonWorkingHours,
    effectiveHours:
      manual === undefined ? autoHours : Math.max(0, manual - nonWorkingHours),
    maxEffectiveHours: Math.max(
      0,
      MAX_RECORDED_MONTHLY_HOURS - nonWorkingHours,
    ),
  };
}

type PersonMonthData = {
  actualWorkedHours?: Record<string, number>;
  workCalendar?: WorkCalendar;
  personCalendar?: PersonCalendar;
};

/** Reuse only within one stable snapshot/final batch. Create again after edits. */
export function createPersonMonthHoursIndex(data: PersonMonthData) {
  const cache = new Map<
    string,
    Readonly<ReturnType<typeof personMonthHours>>
  >();
  // Common dates/holidays belong to the stable snapshot, not to an employee.
  // Build lazily, once per requested month; personal totals remain independent.
  const months = new Map<
    string,
    { days: CalendarMonthDay[]; workdayHours: number }
  >();
  return {
    get(resourceId: string, month: string) {
      const key = resourceId + "|" + month;
      let result = cache.get(key);
      if (result === undefined) {
        // Preserve the existing manual-hour lookup before calculating totals.
        const manual = data.actualWorkedHours?.[key];
        let plan = months.get(month);
        if (plan === undefined) {
          plan = {
            days: calendarMonthDays(
              month,
              data.workCalendar === undefined ? {} : data.workCalendar,
            ),
            workdayHours: workdaysInMonth(month) * HOURS_PER_WORKDAY,
          };
          months.set(month, plan);
        }
        result = hoursFromTotals(
          personalMonthTotals(
            month,
            resourceId,
            data.workCalendar === undefined ? {} : data.workCalendar,
            data.personCalendar === undefined ? {} : data.personCalendar,
            plan.days,
          ),
          manual,
          plan.workdayHours,
        );
        cache.set(key, result);
      }
      return result;
    },
  };
}

/** One person-month is 180 hours; a person's recorded hours may include overtime. */
export function actualInputToFte(
  value: number,
  unit: ActualUnit,
  _month: string,
  workedHours?: number,
): number {
  if (unit === "percent")
    return (
      ((value / 100) * (workedHours ?? DEFAULT_MONTHLY_HOURS)) /
      DEFAULT_MONTHLY_HOURS
    );
  if (unit === "days")
    return (value * HOURS_PER_WORKDAY) / DEFAULT_MONTHLY_HOURS;
  return value / DEFAULT_MONTHLY_HOURS;
}

export function fteToActualInput(
  value: number,
  unit: ActualUnit,
  _month: string,
  workedHours?: number,
): number {
  if (unit === "percent") {
    const hours = workedHours ?? DEFAULT_MONTHLY_HOURS;
    return hours === 0 ? 0 : ((value * DEFAULT_MONTHLY_HOURS) / hours) * 100;
  }
  if (unit === "days") return value * DEFAULT_MONTHLY_DAYS;
  return value * DEFAULT_MONTHLY_HOURS;
}
