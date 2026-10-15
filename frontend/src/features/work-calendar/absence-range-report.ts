import type { Data } from "../../model.ts";
import { actualVersionAt } from "../../model.ts";
import type { PersonCalendar } from "../../actual-units.ts";
import { workingHoursOnDate } from "../../actual-units.ts";
import {
  personalCalendarRanges,
  personalEntryHours,
} from "./calendar-ranges.ts";

/** Group complete source ranges once; filters restrict the reported hours, never the edit/delete target. */
export function absenceRangeRows(
  data: Data,
  teamIds: string[],
  months: string[],
) {
  const resources = new Map(
    data.resources.map((resource) => [resource.id, resource]),
  );
  const teams = new Map(data.teams.map((team) => [team.id, team]));
  const selectedTeams = new Set(teamIds),
    selectedMonths = new Set(months);
  const byResource = new Map<string, PersonCalendar>();
  for (const [key, entry] of Object.entries(data.personCalendar || {})) {
    const id = key.split("|")[0];
    if (!resources.has(id)) continue;
    let entries = byResource.get(id);
    if (!entries) {
      entries = {};
      byResource.set(id, entries);
    }
    entries[key] = entry;
  }
  const rows = [];
  for (const [resourceId, entries] of byResource) {
    const resource = resources.get(resourceId)!;
    for (const range of personalCalendarRanges(
      resourceId,
      entries,
      data.workCalendar || {},
    )) {
      const names = new Set<string>();
      let hours = 0,
        days = 0,
        matches = 0;
      for (const key of range.keys) {
        const date = key.split("|")[1],
          month = date.slice(0, 7);
        if (!selectedMonths.has(month)) continue;
        const team = teams.get(actualVersionAt(resource, month)?.team || "");
        if (!team || !selectedTeams.has(team.id)) continue;
        matches++;
        names.add(team.name);
        hours += personalEntryHours(
          resourceId,
          date,
          entries[key],
          entries,
          data.workCalendar || {},
        );
        if (workingHoursOnDate(date, data.workCalendar) > 0) days++;
      }
      if (matches)
        rows.push({
          key: range.keys[0],
          range,
          resource,
          teamNames: [...names],
          hours,
          days,
          partial: matches !== range.keys.length,
        });
    }
  }
  return rows.sort(
    (a, b) =>
      a.range.from.localeCompare(b.range.from) ||
      a.resource.name.localeCompare(b.resource.name, "tr") ||
      a.key.localeCompare(b.key),
  );
}
