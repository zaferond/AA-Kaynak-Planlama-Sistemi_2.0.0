import type {
  CalendarDay,
  PersonDay,
  PersonCalendar,
  WorkCalendar,
} from "../../../../shared/actual-units.ts";
import {
  workingHoursOnDate,
  personalDayEntries,
} from "../../../../shared/actual-units.ts";

export type SharedCalendarRange = {
  from: string;
  to: string;
  keys: string[];
  entry: CalendarDay;
};
export type PersonalCalendarRange = {
  from: string;
  to: string;
  keys: string[];
  entry: PersonDay;
  hours: number;
  totalHours: number;
  days: number;
};
export const nextCalendarDate = (date: string) =>
  new Date(Date.parse(date + "T12:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
const distance = (from: string, to: string) =>
  (Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 86400000;

/** Stored ranges stay separate. Older consecutive equal entries remain editable without rewriting data. */
export function sharedCalendarRanges(
  calendar: WorkCalendar,
): SharedCalendarRange[] {
  const explicit = new Map<string, SharedCalendarRange>();
  const legacy = new Map<string, SharedCalendarRange>();
  const groups: SharedCalendarRange[] = [];
  for (const [date, entry] of Object.entries(calendar).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const signature = JSON.stringify([
      entry.type,
      entry.label,
      entry.fraction,
      entry.range,
    ]);
    let group = entry.range ? explicit.get(signature) : legacy.get(signature);
    if (
      !entry.range &&
      group &&
      (nextCalendarDate(group.to) !== date || distance(group.from, date) >= 62)
    )
      group = undefined;
    if (!group) {
      group = {
        from: entry.range?.from || date,
        to: entry.range?.to || date,
        keys: [],
        entry,
      };
      groups.push(group);
      (entry.range ? explicit : legacy).set(signature, group);
    }
    group.keys.push(date);
    if (!entry.range) group.to = date;
  }
  return groups.sort(
    (a, b) =>
      a.from.localeCompare(b.from) || a.keys[0].localeCompare(b.keys[0]),
  );
}

function nonWorkingGap(from: string, to: string, calendar: WorkCalendar) {
  if (distance(from, to) > 366) return false;
  for (
    let date = nextCalendarDate(from);
    date < to;
    date = nextCalendarDate(date)
  )
    if (workingHoursOnDate(date, calendar) > 0) return false;
  return true;
}

export function personalEntryHours(
  resourceId: string,
  date: string,
  entry: PersonDay,
  personal: PersonCalendar,
  calendar: WorkCalendar,
) {
  const available = workingHoursOnDate(date, calendar);
  const leave =
    entry.type === "training"
      ? Math.min(
          available,
          personalDayEntries(resourceId, date, personal)
            .filter((item) => item.type === "leave")
            .reduce((sum, item) => sum + item.hours, 0),
        )
      : 0;
  return Math.min(entry.hours, available - leave);
}

export function personalCalendarRanges(
  resourceId: string,
  personal: PersonCalendar,
  calendar: WorkCalendar,
): PersonalCalendarRange[] {
  const explicit = new Map<string, PersonalCalendarRange>();
  const legacy = new Map<
    string,
    { group: PersonalCalendarRange; minimum: number; fixed?: number }
  >();
  const groups: PersonalCalendarRange[] = [];
  for (const [key, entry] of Object.entries(personal)
    .filter(([key]) => key.split("|")[0] === resourceId)
    .sort(([a], [b]) => a.localeCompare(b))) {
    const date = key.split("|")[1],
      available = workingHoursOnDate(date, calendar);
    const signature = JSON.stringify([entry.type, entry.label, entry.range]);
    let group: PersonalCalendarRange | undefined;
    if (entry.range) group = explicit.get(signature);
    else {
      const current = legacy.get(signature);
      const minimum = Math.min(available, entry.hours);
      const fixed = available > entry.hours ? entry.hours : undefined;
      if (
        current &&
        nonWorkingGap(
          current.group.keys.at(-1)!.split("|")[1],
          date,
          calendar,
        ) &&
        distance(current.group.from, date) < 366 &&
        (current.fixed === undefined || current.fixed >= minimum) &&
        (fixed === undefined || fixed >= current.minimum) &&
        (current.fixed === undefined ||
          fixed === undefined ||
          current.fixed === fixed)
      ) {
        group = current.group;
        current.minimum = Math.max(current.minimum, minimum);
        current.fixed ??= fixed;
        group.hours = current.fixed ?? Math.max(group.hours, entry.hours);
      }
    }
    if (!group) {
      group = {
        from: entry.range?.from || date,
        to: entry.range?.to || nextCalendarDate(date),
        keys: [],
        entry,
        hours: entry.range?.hours || entry.hours,
        totalHours: 0,
        days: 0,
      };
      groups.push(group);
      if (entry.range) explicit.set(signature, group);
      else
        legacy.set(signature, {
          group,
          minimum: Math.min(available, entry.hours),
          fixed: available > entry.hours ? entry.hours : undefined,
        });
    }
    group.keys.push(key);
    if (!entry.range) group.to = nextCalendarDate(date);
    group.totalHours += personalEntryHours(
      resourceId,
      date,
      entry,
      personal,
      calendar,
    );
    if (available > 0) group.days++;
  }
  return groups.sort(
    (a, b) =>
      a.from.localeCompare(b.from) || a.keys[0].localeCompare(b.keys[0]),
  );
}
