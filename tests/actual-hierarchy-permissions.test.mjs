import test from "node:test";
import assert from "node:assert/strict";
import { allowedActualTeam, allowedTeam } from "../shared/access.ts";
import { actualView } from "../backend/actual-view.mjs";

const directory = () => ({
  leaders: ["Root", "Child", "Grand", "Other"],
  leaderParents: { Child: "Root", Grand: "Child" },
  teams: [
    { id: "root", name: "Root", lead: "Root", kind: "leadership" },
    { id: "child", name: "Child", lead: "Child", kind: "leadership" },
    { id: "grand", name: "Grand team", lead: "Grand" },
    { id: "outside", name: "Other", lead: "Other" },
    { id: "orphan", name: "Orphan", lead: "" },
  ],
});
const manager = { id: "u", role: "manager", leaders: ["Root"], resourceId: "" };
test("actual hierarchy permissions: grants include descendant units and teams, never ancestors, outsiders or normal users", () => {
  const d = directory();
  for (const id of ["root", "child", "grand"])
    assert(allowedActualTeam(d, manager, id));
  for (const id of ["outside", "orphan", "missing"])
    assert(!allowedActualTeam(d, manager, id));
  assert(!allowedActualTeam(d, { ...manager, leaders: [] }, "grand"));
  assert(!allowedActualTeam(d, { ...manager, role: "normal" }, "grand"));
  assert(!allowedActualTeam(d, { ...manager, leaders: ["Grand"] }, "child"));
  assert(
    !allowedTeam(d, manager, "grand"),
    "personal calendar policy is unchanged",
  );
  d.leaderParents = { Child: "Grand", Grand: "Child" };
  assert(
    !allowedActualTeam(d, manager, "grand"),
    "malformed cycles fail closed",
  );
});
test("actual hierarchy view: descendant revisions survive scoping; transferred history, outside revisions and private calendar stay excluded", () => {
  const d = {
    ...directory(),
    projects: [],
    allocations: {},
    actualWorkedHours: {},
    actualPercentEntries: {},
    workCalendar: {},
    risks: [],
    resources: [
      {
        id: "r",
        name: "Synthetic employee",
        versions: [
          {
            effective: "2026-01",
            start: "2026-01-01",
            team: "outside",
            lead: "Other",
            status: "Aktif Çalışan",
            included: true,
            amount: 1,
          },
          {
            effective: "2026-10",
            start: "2026-01-01",
            team: "grand",
            lead: "Grand",
            status: "Aktif Çalışan",
            included: true,
            amount: 1,
          },
        ],
      },
    ],
    actualAllocations: { "r|p|2026-09": 0.1, "r|p|2026-10": 0.2 },
    revisions: {
      "actual:r|p|2026-09": 3,
      "actual:r|p|2026-10": 4,
      "workedHours:r|2026-10": 5,
      "personDay:r|2026-10-01|leave": 2,
    },
    personCalendar: {
      "r|2026-10-01|leave": { type: "leave", hours: 9, label: "PRIVATE" },
    },
  };
  const result = actualView(
    d,
    manager,
    { start: "2026-09", count: 2 },
    "2026-10-13",
  );
  assert.equal(result.data.actualAllocations["r|p|2026-09"], undefined);
  assert.equal(result.data.revisions["actual:r|p|2026-09"], undefined);
  assert.equal(result.data.actualAllocations["r|p|2026-10"], 0.2);
  assert.equal(result.data.revisions["actual:r|p|2026-10"], 4);
  assert.equal(result.data.revisions["workedHours:r|2026-10"], 5);
  assert.equal(
    result.data.revisions["personDay:r|2026-10-01|leave"],
    undefined,
  );
  assert.deepEqual(result.data.personCalendar, {});
});
