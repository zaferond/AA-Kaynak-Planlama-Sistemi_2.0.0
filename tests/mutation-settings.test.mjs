import test from "node:test";
import assert from "node:assert/strict";
import { prepareMutationSettings } from "../backend/mutation-settings.mjs";
import { Store } from "../backend/store.mjs";

const keys = ["legacyArchive", "workCalendar", "personCalendar"];
const referenceSettings = (before, valid) => {
  const assignments = ["generation=generation+1"],
    values = [];
  for (const [column, oldValue, newValue] of [
    [
      "legacy_archive",
      before.legacyArchive || null,
      valid.legacyArchive || null,
    ],
    ["calendar_days", before.workCalendar || {}, valid.workCalendar || {}],
    [
      "person_calendar",
      before.personCalendar || {},
      valid.personCalendar || {},
    ],
  ]) {
    const oldJson = JSON.stringify(oldValue),
      newJson = JSON.stringify(newValue);
    if (oldJson === newJson) continue;
    assignments.push("[" + column + "]=@p" + values.length);
    values.push(newValue === null ? null : newJson);
  }
  return { assignments, values };
};
const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
function viewHarness() {
  const c = {},
    fresh = { fresh: true },
    delta = { patch: true };
  let reads = 0,
    projections = 0,
    unchanged;
  const receiver = {
    projectPlanningDelta(options) {
      unchanged = options.metadataUnchanged;
      return unchanged ? delta : null;
    },
    async read(connection) {
      assert.equal(connection, c);
      reads++;
      return { data: fresh };
    },
    async projectView(data, generation, active, connection) {
      assert.equal(data, fresh);
      assert.equal(generation, 8);
      assert.equal(connection, c);
      projections++;
      return { data, active };
    },
  };
  return {
    c,
    receiver,
    delta,
    stats: () => ({ reads, projections, unchanged }),
  };
}

test("settings serialization matches previous SQL values, order and fallbacks for immutable pairs", () => {
  const values = [
    undefined,
    null,
    false,
    0,
    "",
    {},
    [],
    { text: "Türkçe & < >\n'" },
    { a: 1, b: 2 },
    { b: 2, a: 1 },
    { toJSON: () => null },
  ];
  for (let i = 0; i < values.length; i++)
    for (let j = 0; j < values.length; j++) {
      const before = freeze(
        Object.fromEntries(
          keys.map((key, k) => [key, values[(i + k) % values.length]]),
        ),
      );
      const valid = freeze(
        Object.fromEntries(
          keys.map((key, k) => [key, values[(j + k) % values.length]]),
        ),
      );
      const actual = prepareMutationSettings(before, valid);
      assert.deepEqual(
        { assignments: actual.assignments, values: actual.values },
        referenceSettings(before, valid),
      );
      for (const key of keys)
        assert.equal(
          actual.metadataEquality.get(key),
          JSON.stringify(before[key]) === JSON.stringify(valid[key]),
        );
    }
  assert.deepEqual(prepareMutationSettings({}, {}).values, []);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(
    () => prepareMutationSettings({ personCalendar: cyclic }, {}),
    TypeError,
  );
});

test("JSON equality reuse halves calendar encoding calls and still compares future metadata", async (t) => {
  const before = {
    workCalendar: {},
    personCalendar: {
      "r|2026-01-02|leave": { type: "leave", hours: 2, label: "" },
    },
    future: { label: "same" },
    allocations: {},
  };
  const valid = structuredClone(before),
    calls = new Map(),
    original = JSON.stringify;
  t.mock.method(JSON, "stringify", function (value, ...args) {
    calls.set(value, (calls.get(value) || 0) + 1);
    return original.call(this, value, ...args);
  });
  const settings = prepareMutationSettings(before, valid),
    h = viewHarness();
  const result = await Store.prototype.prepareMutationView.call(h.receiver, {
    before,
    valid,
    generation: 7,
    c: h.c,
    metadataEquality: settings.metadataEquality,
  });
  assert.equal(result, h.delta);
  for (const source of [before, valid])
    for (const key of ["workCalendar", "personCalendar"])
      assert.equal(calls.get(source[key]), 1);
  assert.equal(calls.get(before.future), 1);
  assert.equal(calls.get(valid.future), 1);
  assert.deepEqual(h.stats(), { reads: 0, projections: 0, unchanged: true });
});

test("storage fallback equality cannot conceal raw default normalization in response metadata", async () => {
  for (const [before, valid] of [
    [{}, { workCalendar: {}, personCalendar: {} }],
    [{ legacyArchive: undefined }, { legacyArchive: null }],
    [{ workCalendar: null }, { workCalendar: {} }],
  ]) {
    const settings = prepareMutationSettings(before, valid),
      h = viewHarness();
    assert.deepEqual(settings.assignments, ["generation=generation+1"]);
    assert.deepEqual(settings.values, []);
    await Store.prototype.prepareMutationView.call(h.receiver, {
      before,
      valid,
      generation: 7,
      c: h.c,
      metadataEquality: settings.metadataEquality,
    });
    assert.deepEqual(h.stats(), { reads: 1, projections: 1, unchanged: false });
  }
});

test("cached calendar equality does not bypass unrelated metadata or unknown key changes", async () => {
  for (const changed of [
    { future: { label: "updated" } },
    { projects: [{ id: "p", name: "updated" }] },
    { leaders: ["new"] },
  ]) {
    const before = {
        workCalendar: {},
        personCalendar: {},
        future: { label: "same" },
        projects: [{ id: "p", name: "original" }],
      },
      valid = { ...structuredClone(before), ...changed };
    const settings = prepareMutationSettings(before, valid),
      h = viewHarness();
    await Store.prototype.prepareMutationView.call(h.receiver, {
      before,
      valid,
      generation: 7,
      c: h.c,
      metadataEquality: settings.metadataEquality,
    });
    assert.deepEqual(h.stats(), { reads: 1, projections: 1, unchanged: false });
  }
});

test("settings equality is local to a pair and submitted values remain SQL parameters", () => {
  const before = { personCalendar: { day: "old" } },
    valid = structuredClone(before);
  const first = prepareMutationSettings(before, valid);
  valid.personCalendar.day = "'; DROP TABLE kp_users; --";
  const second = prepareMutationSettings(before, valid);
  assert.notEqual(first.metadataEquality, second.metadataEquality);
  assert.equal(first.metadataEquality.get("personCalendar"), true);
  assert.equal(second.metadataEquality.get("personCalendar"), false);
  assert.deepEqual(second.assignments, [
    "generation=generation+1",
    "[person_calendar]=@p0",
  ]);
  assert.equal(second.values[0], JSON.stringify(valid.personCalendar));
});
