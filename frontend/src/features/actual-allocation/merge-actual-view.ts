import type { Data } from "../../model";
import { ownValue } from "../../../../shared/records.ts";

// Revision prefix → the snapshot maps that share it.
const RECORDS: [string, (keyof Data)[]][] = [
  ["actual:", ["actualAllocations", "actualPercentEntries"]],
  ["workedHours:", ["actualWorkedHours"]],
  ["personDay:", ["personCalendar"]],
];

/**
 * The actual view is fetched separately and refreshes after each save. Until
 * it does, records the main snapshot holds at a newer revision (the save
 * response) replace the view's copies, so a saved cell neither flashes back to
 * its old value nor reuses an old revision on the next edit. A newer revision
 * without a value is a deletion. Nothing older ever overwrites the view.
 */
export function mergeNewerActuals(view: Data, main: Data): Data {
  let merged: Data | null = null;
  for (const [revisionKey, revision] of Object.entries(main.revisions || {})) {
    const record = RECORDS.find(([prefix]) => revisionKey.startsWith(prefix));
    if (!record || revision <= (ownValue(view.revisions, revisionKey) ?? 0))
      continue;
    const [prefix, maps] = record;
    const id = revisionKey.slice(prefix.length);
    merged ??= { ...view, revisions: { ...view.revisions } };
    merged.revisions[revisionKey] = revision;
    for (const map of maps) {
      const source = main[map] as Record<string, unknown> | undefined;
      const target = { ...((merged[map] as Record<string, unknown>) || {}) };
      const value = ownValue(source, id);
      if (value === undefined) delete target[id];
      else target[id] = value;
      (merged as Record<string, unknown>)[map] = target;
    }
  }
  return merged || view;
}
