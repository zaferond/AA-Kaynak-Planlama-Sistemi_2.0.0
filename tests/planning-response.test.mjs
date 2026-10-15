import test from "node:test";
import assert from "node:assert/strict";
import { mergePlanningDelta } from "../shared/planning-response.ts";

test("invalid delta bases, permissions, duplicate cells and malformed values require a full snapshot", () => {
  const cached = {
    generation: 1,
    user: { id: "u", role: "admin" },
    data: {
      allocations: { "t|p|2026-09": 1 },
      revisions: { "allocation:t|p|2026-09": 1 },
    },
  };
  const entry = { id: "t|p|2026-09", value: 0, revision: 2 };
  const patch = {
    responseMode: "planning-delta-v1",
    baseGeneration: 1,
    generation: 2,
    user: cached.user,
    allocations: [entry],
  };
  const original = structuredClone(cached);
  for (const invalid of [
    { ...patch, baseGeneration: 0 },
    { ...patch, generation: 5 },
    { ...patch, user: { ...cached.user, role: "normal" } },
    { ...patch, allocations: null },
    { ...patch, allocations: [entry, entry] },
    ...[NaN, Infinity, -1, 10001, "1", undefined].map((value) => ({
      ...patch,
      allocations: [{ ...entry, value }],
    })),
    ...[0, 1, 2.5, Infinity].map((revision) => ({
      ...patch,
      allocations: [{ ...entry, revision }],
    })),
    { ...patch, allocations: [{ ...entry, id: "__proto__" }] },
  ])
    assert.equal(mergePlanningDelta(cached, invalid), null);
  assert.equal(mergePlanningDelta({ ...cached, user: undefined }, patch), null);
  assert.deepEqual(cached, original);
});
