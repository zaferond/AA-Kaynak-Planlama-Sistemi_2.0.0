import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedPlanningTeam,
  allowedTeam,
  scopeData,
} from "../shared/access.ts";
test("planning grants inherit ancestors, include direct leadership units and fail closed for missing/cyclic paths", () => {
  const data = {
    teams: [
      { id: "direct", lead: "Root", kind: "leadership" },
      { id: "child", lead: "Child" },
      { id: "grand", lead: "Grand" },
      { id: "other", lead: "Other" },
      { id: "orphan", lead: "" },
    ],
    leaderParents: { Child: "Root", Grand: "Child" },
  };
  const manager = { role: "manager", leaders: ["Root"] };
  for (const id of ["direct", "child", "grand"])
    assert(allowedPlanningTeam(data, manager, id));
  for (const id of ["other", "orphan", "missing"])
    assert(!allowedPlanningTeam(data, manager, id));
  assert(!allowedPlanningTeam(data, { ...manager, leaders: [] }, "grand"));
  assert(!allowedPlanningTeam(data, { ...manager, role: "normal" }, "grand"));
  assert(!allowedTeam(data, manager, "grand"));
  assert(allowedPlanningTeam(data, { role: "admin" }, "grand"));
  data.leaderParents = { Child: "Grand", Grand: "Child" };
  assert(!allowedPlanningTeam(data, manager, "grand"));
  data.leaderParents = JSON.parse('{"Grand":"__proto__","__proto__":"Root"}');
  assert(allowedPlanningTeam(data, manager, "grand"));
  data.leaderParents = {};
  assert(
    !allowedPlanningTeam(
      { ...data, teams: [{ id: "x", lead: "constructor" }] },
      manager,
      "x",
    ),
  );
});
test("all planning teams and revisions are visible without widening personal actual/calendar reads", () => {
  const data = {
    teams: [
      { id: "a", lead: "A" },
      { id: "b", lead: "B" },
      { id: "orphan", lead: "" },
    ],
    leaders: ["A", "B"],
    projects: [],
    resources: [
      {
        id: "secret",
        name: "Private outside employee",
        note: "PRIVATE",
        versions: [
          {
            effective: "2026-01",
            start: "2026-01-01",
            end: "",
            status: "Aktif Çalışan",
            team: "b",
            lead: "B",
            included: true,
            amount: 1,
          },
        ],
      },
    ],
    allocations: { "b|p|2026-01": 1 },
    actualAllocations: { "secret|p|2026-01": 0.5 },
    actualWorkedHours: { "secret|2026-01": 150 },
    actualPercentEntries: { "secret|p|2026-01": 50 },
    personCalendar: {
      "secret|2026-01-02|leave": { type: "leave", hours: 8, label: "PRIVATE" },
    },
    revisions: {
      "allocation:b|p|2026-01": 4,
      "actual:secret|p|2026-01": 2,
      "personDay:secret|2026-01-02|leave": 1,
    },
  };
  const before = structuredClone(data);
  for (const leaders of [["A"], []]) {
    const scoped = scopeData(data, {
      role: "manager",
      leaders,
      resourceId: "",
    });
    assert.equal(scoped.teams.length, 3);
    assert.deepEqual(scoped.allocations, data.allocations);
    assert.equal(scoped.revisions["allocation:b|p|2026-01"], 4);
    for (const field of [
      "actualAllocations",
      "actualWorkedHours",
      "actualPercentEntries",
      "personCalendar",
    ])
      assert.deepEqual(scoped[field], {});
    assert.equal(scoped.resources[0].name, "");
    assert.equal(scoped.resources[0].note, "");
    assert.equal(scoped.revisions["actual:secret|p|2026-01"], undefined);
  }
  assert.deepEqual(data, before);
});
