import type { Data } from "./model.ts";
import { invalidSnapshot as bad } from "./snapshot-validation-error.ts";
import { validPlanningDate } from "./planning-dates.ts";
import { rangeContainsDate } from "./calendar-rules.ts";
import { HOURS_PER_WORKDAY } from "./actual-units.ts";

/** Leave/training days one person may hold in a calendar year (365 days plus
 * room for leave and training on the same day). Per person, so nobody can
 * exhaust the calendar for everyone else. */
export const PERSONAL_DAYS_PER_YEAR = 400;
/** Personal calendar additions/edits accepted in one request. */
export const PERSONAL_DAYS_PER_REQUEST = 400;

export function validateSnapshotCalendarKeys(d: Data) {
  if (Object.keys(d.workCalendar || {}).length > 5000)
    throw bad("Çalışma takviminde en fazla 5000 tarih bulunabilir.");
  for (const date of Object.keys(d.workCalendar || {}))
    if (
      !validPlanningDate(date) ||
      !rangeContainsDate(d.workCalendar![date].range, date)
    )
      throw bad("Çalışma takviminde geçersiz tarih var.");
}

export function validateSnapshotPersonalCalendar(
  d: Data,
  resourcesById: ReadonlyMap<string, Data["resources"][number]>,
) {
  const personalTypes = new Set<string>(),
    dailyPersonalHours = new Map<string, number>(),
    daysPerYear = new Map<string, number>();
  for (const [key, entry] of Object.entries(d.personCalendar || {})) {
    const [resourceId, date, type, ...extra] = key.split("|");
    if (
      extra.length ||
      !resourcesById.has(resourceId) ||
      !validPlanningDate(date) ||
      !rangeContainsDate(entry.range, date, true) ||
      (entry.range && entry.hours > entry.range.hours) ||
      (type !== undefined && type !== entry.type)
    )
      throw bad("Geçersiz kişisel takvim kaydı.");
    const dayKey = resourceId + "|" + date,
      typedKey = dayKey + "|" + entry.type;
    if (personalTypes.has(typedKey))
      throw bad("Aynı gün ve tür için birden fazla izin/eğitim kaydı olamaz.");
    personalTypes.add(typedKey);
    const yearKey = resourceId + "|" + date.slice(0, 4),
      days = (daysPerYear.get(yearKey) || 0) + 1;
    if (days > PERSONAL_DAYS_PER_YEAR)
      throw bad(
        `${resourcesById.get(resourceId)!.name}: ${date.slice(0, 4)} yılında en fazla ${PERSONAL_DAYS_PER_YEAR} izin/eğitim kaydı girilebilir.`,
      );
    daysPerYear.set(yearKey, days);
    const total = (dailyPersonalHours.get(dayKey) || 0) + entry.hours;
    if (total > HOURS_PER_WORKDAY)
      throw bad(
        `${date}: İzin ve eğitim toplamı günde ${HOURS_PER_WORKDAY} saati aşamaz.`,
      );
    dailyPersonalHours.set(dayKey, total);
  }
}
