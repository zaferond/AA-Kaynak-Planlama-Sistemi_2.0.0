import test from "node:test";
import assert from "node:assert/strict";
import { mergeNewerActuals } from "../frontend/src/features/actual-allocation/merge-actual-view.ts";

const view = {
  revisions: {
    "actual:r|p|2026-01": 1,
    "actual:r|p|2026-02": 2,
    "workedHours:r|2026-01": 1,
    "allocation:t|p|2026-01": 4,
  },
  actualAllocations: { "r|p|2026-01": 0.25, "r|p|2026-02": 0.5 },
  actualPercentEntries: { "r|p|2026-01": 25 },
  actualWorkedHours: { "r|2026-01": 160 },
  personCalendar: {},
  resources: [{ id: "r" }],
};

test("a save response's newer actual records replace the view until it refreshes", () => {
  const main = {
    revisions: {
      "actual:r|p|2026-01": 2, // edited
      "actual:r|p|2026-02": 3, // cleared
      "workedHours:r|2026-01": 1, // unchanged
      "personDay:r|2026-01-05|leave": 1, // added
      "allocation:t|p|2026-01": 9, // not an actual record
    },
    actualAllocations: { "r|p|2026-01": 0.4 },
    actualPercentEntries: { "r|p|2026-01": 40 },
    actualWorkedHours: { "r|2026-01": 999 },
    personCalendar: { "r|2026-01-05|leave": { type: "leave", hours: 8 } },
  };
  const merged = mergeNewerActuals(view, main);
  assert.deepEqual(merged.actualAllocations, { "r|p|2026-01": 0.4 });
  assert.deepEqual(merged.actualPercentEntries, { "r|p|2026-01": 40 });
  // Same revision: the view keeps its own copy.
  assert.deepEqual(merged.actualWorkedHours, { "r|2026-01": 160 });
  assert.deepEqual(merged.personCalendar, {
    "r|2026-01-05|leave": { type: "leave", hours: 8 },
  });
  assert.equal(merged.revisions["actual:r|p|2026-01"], 2);
  assert.equal(merged.revisions["actual:r|p|2026-02"], 3);
  assert.equal(merged.revisions["allocation:t|p|2026-01"], 4);
  // Everything else is the view's own data; the view itself is not mutated.
  assert.equal(merged.resources, view.resources);
  assert.equal(view.actualAllocations["r|p|2026-02"], 0.5);
});

test("an older or equal snapshot never overwrites the view", () => {
  const main = {
    revisions: { "actual:r|p|2026-01": 1, "actual:r|p|2026-02": 1 },
    actualAllocations: {},
  };
  assert.equal(mergeNewerActuals(view, main), view);
});
