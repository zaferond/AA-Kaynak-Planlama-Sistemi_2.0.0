import { ident } from "./tables.mjs";

// Fixed columns and keys; never accept submitted SQL identifiers. JSON equality
// belongs to this validated transaction pair only, not a cross-request cache.
const fields = [
  ["legacy_archive", "legacyArchive", "null"],
  ["calendar_days", "workCalendar", "{}"],
  ["person_calendar", "personCalendar", "{}"],
  ["leader_parents", "leaderParents", "{}"],
  ["leadership_units", "leadershipUnits", "{}"],
];

export function prepareMutationSettings(
  before,
  valid,
  { validatedCalendars = false } = {},
) {
  const assignments = ["generation=generation+1"],
    values = [],
    metadataEquality = new Map();
  for (const [column, key, fallbackJson] of fields) {
    const oldValue = before[key],
      newValue = valid[key],
      oldRaw = JSON.stringify(oldValue),
      newRaw = JSON.stringify(newValue);
    // Raw equality differs from storage equality when a default is inserted.
    metadataEquality.set(key, oldRaw === newRaw);
    const oldJson = oldValue ? oldRaw : fallbackJson,
      newJson = newValue ? newRaw : fallbackJson;
    if (oldJson === newJson) continue;
    assignments.push(ident(column) + "=@p" + values.length);
    values.push(!newValue && fallbackJson === "null" ? null : newJson);
  }
  const workCalendarUnchanged = metadataEquality.get("workCalendar") === true;
  const personCalendarUnchanged =
    metadataEquality.get("personCalendar") === true;
  return {
    assignments,
    values,
    metadataEquality,
    // Only Store's fully validated pair can avoid calendar record diffing.
    // Capture booleans privately; a caller changing the public Map cannot
    // conceal an edit. Identity checks prevent reuse with another snapshot.
    calendarUnchanged: (previous, next, key) =>
      validatedCalendars &&
      previous === before &&
      next === valid &&
      ((key === "workCalendar" && workCalendarUnchanged) ||
        (key === "personCalendar" && personCalendarUnchanged)),
  };
}
