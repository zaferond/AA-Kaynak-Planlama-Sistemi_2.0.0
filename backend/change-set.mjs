import { ownValue } from "../shared/records.ts";
import { entityCollections } from "../shared/entity-kinds.ts";

const indexed = (items = []) =>
  Object.fromEntries(items.map((item) => [item.id, item]));

export function recordChanges(before = {}, after = {}) {
  const changed = [];
  const compare = (id, previous, value) => {
    if (
      previous === value ||
      JSON.stringify(previous) === JSON.stringify(value)
    )
      return;
    changed.push({ id, before: previous, value });
  };
  // Preserve before-first order without building a combined list and Set.
  // Enumerable membership matters: the other side may own a hidden property.
  for (const id of Object.keys(before))
    compare(id, before[id], ownValue(after, id));
  for (const id of Object.keys(after)) {
    if (Object.prototype.propertyIsEnumerable.call(before, id)) continue;
    compare(id, ownValue(before, id), after[id]);
  }
  return changed;
}

// Full validated snapshots, not the submitted command list: normalization and
// cascading changes must also reach persistence and auditing. No global cache.
export function dataChanges(before, after, { settings } = {}) {
  const changed = {};
  for (const [kind, collection] of Object.entries(entityCollections)) {
    const isMap = kind === "allocation" || kind === "actual";
    changed[kind] = recordChanges(
      isMap ? before[collection] : indexed(before[collection]),
      isMap ? after[collection] : indexed(after[collection]),
    );
  }
  for (const [kind, collection] of [
    ["workedHours", "actualWorkedHours"],
    ["percent", "actualPercentEntries"],
    ["calendar", "workCalendar"],
    ["personDay", "personCalendar"],
  ])
    // Settings only grants equality for these two JSON-backed calendars and
    // this exact, stable, fully validated pair. Every other record is diffed.
    changed[kind] =
      (collection === "workCalendar" || collection === "personCalendar") &&
      settings?.calendarUnchanged?.(before, after, collection) === true
        ? []
        : recordChanges(before[collection], after[collection]);

  const leaders = (data) =>
    Object.fromEntries(
      (data.leaders || []).map((name) => [
        name,
        {
          name,
          managerName: ownValue(data.leaderManagers || {}, name) || "",
          ...(ownValue(data.leaderParents, name)
            ? { parentName: ownValue(data.leaderParents, name) }
            : {}),
        },
      ]),
    );
  changed.leader = recordChanges(leaders(before), leaders(after));
  return changed;
}
