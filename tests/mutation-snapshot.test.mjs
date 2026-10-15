import test from "node:test";
import assert from "node:assert/strict";
import {
  cloneMutationSnapshot,
  clonePlanningMutationDraft,
} from "../backend/mutation-snapshot.mjs";

const data = () => ({
  allocations: { "t|p|2026-09": 0, "t|p|2026-10": 0.25 },
  actualAllocations: { "r|p|2026-09": 0.5 },
  actualWorkedHours: { "r|2026-09": 144 },
  actualPercentEntries: { "r|p|2026-09": 50 },
  revisions: { "allocation:t|p|2026-09": 4, "risk:deleted": 5 },
  projects: [
    {
      id: "p",
      phases: { "2026-09": "Analysis" },
      milestones: [
        {
          id: "m",
          barNotes: [{ text: "Detail", completed: true }],
          additionalRanges: [
            { description: "Range", notes: [{ text: "Nested" }] },
          ],
        },
      ],
    },
  ],
  risks: [{ id: "risk", actionPlan: "Plan" }],
  resources: [{ id: "r", versions: [{ team: "t", amount: 1 }] }],
  workCalendar: { "2026-09-01": { label: "Holiday", fraction: 0.5 } },
  personCalendar: { "r|2026-09-02|leave": { hours: 2, label: "Leave" } },
  legacyArchive: { teams: [{ id: "old" }], allocations: { old: 0.5 } },
});

test("mutation snapshots match full cloning and isolate every numeric map and nested metadata", () => {
  const original = data();
  const expected = structuredClone(original);
  const copy = cloneMutationSnapshot(original);
  assert.deepEqual(copy, expected);
  for (const key of [
    "allocations",
    "actualAllocations",
    "actualWorkedHours",
    "actualPercentEntries",
    "revisions",
  ]) {
    assert.notEqual(copy[key], original[key]);
    copy[key].added = 2;
    delete copy[key][Object.keys(original[key])[0]];
  }
  copy.projects[0].phases["2026-09"] = "Changed";
  copy.projects[0].milestones[0].barNotes[0].completed = false;
  copy.projects[0].milestones[0].additionalRanges[0].notes[0].text = "Changed";
  copy.resources[0].versions[0].amount = 2;
  copy.risks[0].actionPlan = "Changed";
  copy.workCalendar["2026-09-01"].fraction = 1;
  copy.personCalendar["r|2026-09-02|leave"].hours = 4;
  copy.legacyArchive.teams[0].id = "Changed";
  assert.deepEqual(original, expected);
});

test("numeric maps stay outside deep cloning while metadata is cloned once", (t) => {
  const original = data(),
    native = structuredClone;
  const calls = [];
  t.mock.method(globalThis, "structuredClone", (value) => {
    calls.push(value);
    return native(value);
  });
  assert.deepEqual(cloneMutationSnapshot(original), native(original));
  assert.equal(calls.length, 1);
  for (const key of [
    "allocations",
    "actualAllocations",
    "actualWorkedHours",
    "actualPercentEntries",
    "revisions",
  ])
    assert.equal(Object.hasOwn(calls[0], key), false);
  assert.equal(calls[0].projects, original.projects);
});

test("unexpected numeric map values fall back to full cloning and preserve shared references", () => {
  for (const invalid of [
    null,
    [],
    "unexpected",
    new Map(),
    new Date(),
    { nested: { value: 2 } },
  ]) {
    const original = data();
    original.allocations = invalid;
    original.shared = invalid;
    const copy = cloneMutationSnapshot(original);
    assert.deepEqual(copy, structuredClone(original));
    assert.equal(copy.allocations, copy.shared);
    if (invalid && typeof invalid === "object")
      assert.notEqual(copy.allocations, invalid);
  }
  const original = data();
  original.allocations.invalid = () => 1;
  assert.throws(() => cloneMutationSnapshot(original), {
    name: "DataCloneError",
  });
});

test("zero, special numeric values, own reserved names and absent maps keep clone semantics", () => {
  const original = data();
  original.allocations = JSON.parse(
    '{"__proto__":0,"constructor":1,"toString":2}',
  );
  original.actualWorkedHours.special = NaN;
  original.actualWorkedHours.infinity = Infinity;
  original.actualWorkedHours.negativeZero = -0;
  Object.setPrototypeOf(original.revisions, null);
  delete original.actualPercentEntries;
  original.future = { nested: [{ text: "Türkçe açıklama" }] };
  const copy = cloneMutationSnapshot(original);
  assert.deepEqual(copy, structuredClone(original));
  assert.equal(Object.hasOwn(copy.allocations, "__proto__"), true);
  assert.equal(Object.getPrototypeOf(copy.allocations), Object.prototype);
  assert.equal(Object.hasOwn(copy, "actualPercentEntries"), false);
  assert.notEqual(copy.future.nested, original.future.nested);
  assert(Object.is(copy.actualWorkedHours.negativeZero, -0));
});

test("owned planning drafts copy values/revisions without cloning unrelated snapshot metadata", () => {
  const original = data(),
    before = structuredClone(original);
  const draft = clonePlanningMutationDraft(original);
  assert.deepEqual(draft, before);
  for (const key of ["allocations", "revisions"])
    assert.notEqual(draft[key], original[key]);
  for (const key of Object.keys(original).filter(
    (k) => !["allocations", "revisions"].includes(k),
  ))
    assert.equal(draft[key], original[key]);
  draft.allocations["t|p|2026-09"] = 3;
  delete draft.allocations["t|p|2026-10"];
  draft.revisions["allocation:t|p|2026-09"]++;
  assert.deepEqual(original, before);
  const reserved = JSON.parse('{"__proto__":0,"constructor":1}');
  original.allocations = reserved;
  assert.equal(
    Object.hasOwn(
      clonePlanningMutationDraft(original).allocations,
      "__proto__",
    ),
    true,
  );
  original.revisions.invalid = { nested: true };
  const fallback = clonePlanningMutationDraft(original);
  assert.deepEqual(fallback, structuredClone(original));
  assert.notEqual(fallback.projects, original.projects);
});
