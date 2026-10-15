import type { Data } from "./model.ts";
import { invalidSnapshot as bad } from "./snapshot-validation-error.ts";
import { validPlanningDate } from "./planning-dates.ts";
import { rangeContainsDate } from "./calendar-rules.ts";
import { HOURS_PER_WORKDAY } from "./actual-units.ts";

export function validateSnapshotCalendarKeys(d: Data) {
  if (Object.keys(d.workCalendar || {}).length > 5000)
    throw bad("Çalışma takviminde en fazla 5000 tarih bulunabilir.");
  for (const date of Object.keys(d.workCalendar || {}))
    if (
      !validPlanningDate(date) ||
      !rangeContainsDate(d.workCalendar![date].range, date)
    )
      throw bad("Çalışma takviminde geçersiz tarih var.");
  if (Object.keys(d.personCalendar || {}).length > 100000)
    throw bad("Kişisel takvimde çok fazla kayıt var.");
}

export function validateSnapshotPersonalCalendar(
  d: Data,
  resourcesById: ReadonlyMap<string, Data["resources"][number]>,
) {
  const personalTypes = new Set<string>(),
    dailyPersonalHours = new Map<string, number>();
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
    const total = (dailyPersonalHours.get(dayKey) || 0) + entry.hours;
    if (total > HOURS_PER_WORKDAY)
      throw bad(
        `${date}: İzin ve eğitim toplamı günde ${HOURS_PER_WORKDAY} saati aşamaz.`,
      );
    dailyPersonalHours.set(dayKey, total);
  }
}
