import { ownValue } from "../shared/records.ts";
import {
  validPlanningMonth,
  validPlanningDate,
} from "../shared/planning-dates.ts";
import { assertActualMonthlyLimits } from "../shared/actual-limits.ts";
import {
  MAX_RECORDED_MONTHLY_HOURS,
  createPersonMonthHoursIndex,
} from "../shared/actual-units.ts";
import { z } from "zod";
import {
  calendarDaySchema,
  rangeContainsDate,
} from "../shared/calendar-rules.ts";
import { fail } from "./auth.mjs";
import {
  currentPlanningMonth,
  actualInputToFte,
  effectivePersonHoursInMonth,
  DEFAULT_MONTHLY_HOURS,
  personDaySchema,
} from "./domain/index.mjs";

const actualEntrySchema = z
  .object({
    unit: z.enum(["percent", "days", "hours"]),
    value: z.number().finite().min(0).max(100000),
  })
  .strict();
const workedHoursSchema = z
  .number()
  .finite()
  .min(0)
  .max(MAX_RECORDED_MONTHLY_HOURS);
const calendarSchema = z.record(calendarDaySchema);
const effectiveHours = (d, resourceId, month) =>
  effectivePersonHoursInMonth(
    month,
    resourceId,
    d.actualWorkedHours?.[resourceId + "|" + month],
    d.workCalendar,
    d.personCalendar,
  );
function recalculateActualPercentages(d, affectedMonths) {
  if (affectedMonths.size === 0) return;
  const resources = new Set(d.resources.map((resource) => resource.id));
  const personHours = createPersonMonthHoursIndex(d);
  // Scan once for the entire final batch; a calendar edit may affect every
  // person. Do not cache during the command loop, where calendars/hours change.
  for (const actualKey of Object.keys(d.actualPercentEntries || {})) {
    const [entryResource, , entryMonth] = actualKey.split("|");
    if (
      !resources.has(entryResource) ||
      !affectedMonths.has(entryResource + "|" + entryMonth)
    )
      continue;
    const percent = d.actualPercentEntries[actualKey];
    const hours = personHours.get(entryResource, entryMonth).effectiveHours;
    const nextPercent = hours
      ? (((d.actualAllocations[actualKey] || 0) * DEFAULT_MONTHLY_HOURS) /
          hours) *
        100
      : 0;
    if (Math.abs(percent - nextPercent) > 1e-10) {
      d.actualPercentEntries[actualKey] = nextPercent;
      d.revisions["actual:" + actualKey] =
        (d.revisions["actual:" + actualKey] || 0) + 1;
    }
  }
}
const affectMonth = (months, resourceId, month) =>
  months.add(resourceId + "|" + month);

// Preconditions: stageChanges has checked actor scope, duplicate commands,
// revisions, and allocation deletion targets. All mutations use its owned draft.
export function stageActualChange(d, { id, value, operation }, affectedMonths) {
  if (!operation && id.split("|")[2] > currentPlanningMonth())
    fail(400, "Gelecek aylara gerçekleşen kaynak dağılımı girilemez.");
  d.actualAllocations ??= {};
  d.actualPercentEntries ??= {};
  if (operation) {
    delete d.actualAllocations[id];
    delete d.actualPercentEntries[id];
  } else if (typeof value === "number") {
    d.actualAllocations[id] = value;
    delete d.actualPercentEntries[id];
  } else {
    const entry = actualEntrySchema.parse(value);
    const [resourceId, , month] = id.split("|");
    if (entry.unit === "percent" && entry.value > 100)
      fail(400, "Yüzde girişi %100'ü aşamaz.");
    const amount = actualInputToFte(
      entry.value,
      entry.unit,
      month,
      effectiveHours(d, resourceId, month),
    );
    if (!Number.isFinite(amount) || amount > 100)
      fail(400, "Giriş, izin verilen kaynak sınırını aşıyor.");
    d.actualAllocations[id] = amount;
    if (entry.unit === "percent") d.actualPercentEntries[id] = entry.value;
    else delete d.actualPercentEntries[id];
  }
  const [resourceId, , month] = id.split("|");
  if (resourceId && month) affectMonth(affectedMonths, resourceId, month);
}

// False preserves no-op clears: do not create a revision tombstone.
export function stageWorkedHoursChange(
  d,
  { id, value, operation },
  affectedMonths,
) {
  const [resourceId, month, ...extra] = id.split("|");
  if (extra.length || !resourceId || !validPlanningMonth(month || ""))
    fail(400, "Çalışılan saat kaydı geçersiz.");
  if (!d.resources.some((resource) => resource.id === resourceId))
    fail(404, "Çalışan kaynak bulunamadı.");
  if (!operation && value !== null && month > currentPlanningMonth())
    fail(400, "Gelecek aylara çalışılan saat girilemez.");
  d.actualWorkedHours ??= {};
  if (
    (operation || value === null) &&
    ownValue(d.actualWorkedHours, id) === undefined
  )
    return false;
  if (operation || value === null) delete d.actualWorkedHours[id];
  else d.actualWorkedHours[id] = workedHoursSchema.parse(value);
  affectMonth(affectedMonths, resourceId, month);
  return true;
}

export function stageCalendarChange(
  d,
  { id, value, operation },
  affectedMonths,
) {
  if (id !== "shared" || operation)
    fail(400, "Çalışma takvimi işlemi geçersiz.");
  const previous = d.workCalendar || {};
  const next = calendarSchema.parse(value);
  for (const [date, entry] of Object.entries(next))
    if (!validPlanningDate(date) || !rangeContainsDate(entry.range, date))
      fail(400, "Çalışma takviminde geçersiz tarih/aralık var.");
  const changedMonths = new Set(
    [...new Set([...Object.keys(previous), ...Object.keys(next)])]
      .filter((date) => previous[date]?.fraction !== next[date]?.fraction)
      .map((date) => date.slice(0, 7)),
  );
  d.workCalendar = next;
  for (const key of Object.keys(d.actualAllocations || {})) {
    const [resourceId, , month] = key.split("|");
    if (changedMonths.has(month))
      affectMonth(affectedMonths, resourceId, month);
  }
  for (const key of Object.keys(d.personCalendar || {})) {
    const [resourceId, date] = key.split("|");
    const month = date.slice(0, 7);
    if (changedMonths.has(month))
      affectMonth(affectedMonths, resourceId, month);
  }
}

export function stagePersonDayChange(
  d,
  { id, value, operation },
  affectedMonths,
) {
  const [resourceId, date, type, ...extra] = id.split("|");
  if (
    extra.length ||
    (type !== undefined && !["leave", "training"].includes(type)) ||
    !d.resources.some((resource) => resource.id === resourceId) ||
    !validPlanningDate(date || "")
  )
    fail(400, "Kişisel takvim tarihi geçersiz.");
  d.personCalendar ??= {};
  if (operation && ownValue(d.personCalendar, id) === undefined) return false;
  if (operation) delete d.personCalendar[id];
  else {
    const entry = personDaySchema.parse(value);
    if (
      !rangeContainsDate(entry.range, date, true) ||
      (entry.range && entry.hours > entry.range.hours)
    )
      fail(400, "Kişisel takvim tarihi aralıkla eşleşmiyor.");
    if (type !== undefined && type !== entry.type)
      fail(400, "Takvim kayıt türü kimliğiyle eşleşmiyor.");
    if (d.personCalendar[id] && d.personCalendar[id].type !== entry.type)
      fail(
        400,
        "Bu tarihte farklı türde kayıt var. İzin ve eğitimi ayrı kayıtlar olarak ekleyin.",
      );
    d.personCalendar[id] = entry;
  }
  const month = date.slice(0, 7);
  affectMonth(affectedMonths, resourceId, month);
  return true;
}

// Finalize once, after every explicit revision was checked and all commands
// were staged. Intermediate totals may exceed capacity during a valid transfer.
export function finalizeActualChanges(d, affectedMonths) {
  assertActualMonthlyLimits(d, affectedMonths);
  recalculateActualPercentages(d, affectedMonths);
}
