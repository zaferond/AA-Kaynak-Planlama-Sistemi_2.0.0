import test from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  affectedTeams,
  applyScenario,
  shiftDate,
  summarizeScenario,
} from "../shared/schedule-shift.ts";
import { monthsFrom } from "../shared/model.ts";

const version = (team) => ({
  effective: "2026-01",
  start: "2026-01-01",
  end: "",
  team,
  lead: "Lead",
  status: "Aktif Çalışan",
  included: true,
  amount: 1,
});
function sample() {
  return {
    leaders: ["Lead"],
    leaderParents: {},
    leadershipUnits: {},
    leaderManagers: {},
    teams: [
      { id: "a", name: "Team A", lead: "Lead", excelCapacity: 0 },
      { id: "b", name: "Team B", lead: "Lead", excelCapacity: 0 },
    ],
    // Team A: 2 people, Team B: 1 person.
    resources: [
      { id: "r1", name: "R1", note: "", versions: [version("a")] },
      { id: "r2", name: "R2", note: "", versions: [version("a")] },
      { id: "r3", name: "R3", note: "", versions: [version("b")] },
    ],
    projects: [
      {
        id: "p",
        name: "Proje P",
        start: "2026-01",
        end: "2026-12",
        phases: { "2026-09": "Tasarım", "2026-10": "Prototip" },
        phaseColors: { "2026-10": "red" },
        milestones: [
          {
            id: "m",
            name: "Başlık",
            start: "2026-08-15",
            end: "2026-11-30",
            additionalRanges: [{ start: "2026-10-31", end: "2026-10-31" }],
            barNotes: [
              { text: "n", includeInReport: true, start: "2026-07-01" },
            ],
          },
        ],
      },
      {
        id: "q",
        name: "Proje Q",
        start: "2026-01",
        end: "2026-12",
        phases: {},
      },
      {
        id: "s",
        name: "Proje S",
        start: "2027-03",
        end: "2027-12",
        phases: {},
      },
    ],
    allocations: {
      "a|p|2026-09": 1,
      "a|p|2026-10": 2,
      "a|p|2026-12": 1,
      "a|q|2026-10": 1,
      "b|q|2027-01": 1,
      "b|s|2027-03": 1,
    },
    actualAllocations: { "r1|p|2026-10": 0.5 },
    hiddenAllocationTotals: {},
    revisions: {},
    risks: [],
  };
}

test("month and date arithmetic clamps to the target month", () => {
  assert.equal(addMonths("2026-11", 3), "2027-02");
  assert.equal(addMonths("2026-02", -3), "2025-11");
  assert.equal(shiftDate("2026-01-31", 1), "2026-02-28");
  assert.equal(shiftDate("2027-11-30", 3), "2028-02-29");
  assert.equal(shiftDate("2026-10-15", -2), "2026-08-15");
});

test("a delay moves the plan and timeline from the chosen month, never the past or actuals", () => {
  const data = sample();
  const {
    data: next,
    moved,
    problems,
  } = applyScenario(data, {
    id: "s1",
    name: "+3",
    includeTimeline: true,
    shifts: [{ projectId: "p", months: 3, fromMonth: "2026-10" }],
  });
  assert.deepEqual(problems, []);
  assert.equal(moved, 2);
  assert.deepEqual(next.allocations, {
    "a|p|2026-09": 1, // before the chosen month: realised, stays
    "a|p|2027-01": 2,
    "a|p|2027-03": 1,
    "a|q|2026-10": 1, // other projects are untouched
    "b|q|2027-01": 1,
    "b|s|2027-03": 1,
  });
  const p = next.projects.find((x) => x.id === "p");
  assert.equal(p.start, "2026-01");
  assert.equal(p.end, "2027-03");
  assert.deepEqual(p.phases, { "2026-09": "Tasarım", "2027-01": "Prototip" });
  assert.deepEqual(p.phaseColors, { "2027-01": "red" });
  const m = p.milestones[0];
  assert.equal(m.start, "2026-08-15");
  assert.equal(m.end, "2027-02-28");
  assert.equal(m.additionalRanges[0].start, "2027-01-31");
  assert.equal(m.barNotes[0].start, "2026-07-01");
  assert.deepEqual(next.actualAllocations, data.actualAllocations);
  // The input data is not modified.
  assert.equal(data.allocations["a|p|2026-10"], 2);
  assert.equal(data.projects[0].end, "2026-12");
});

test("several projects shift together; timeline can stay in place", () => {
  const { data: next } = applyScenario(sample(), {
    id: "s2",
    name: "+5",
    includeTimeline: false,
    shifts: [
      { projectId: "p", months: 5, fromMonth: "2026-10" },
      { projectId: "s", months: 2, fromMonth: "2026-10" },
    ],
  });
  assert.equal(next.allocations["a|p|2027-03"], 2);
  assert.equal(next.allocations["b|s|2027-05"], 1);
  const s = next.projects.find((x) => x.id === "s");
  assert.deepEqual([s.start, s.end], ["2027-05", "2028-02"]);
  assert.deepEqual(next.projects.find((x) => x.id === "p").phases, {
    "2026-09": "Tasarım",
    "2026-10": "Prototip",
  });
});

test("pulling a project forward into months before the start month is reported", () => {
  const { problems } = applyScenario(sample(), {
    id: "s3",
    name: "-2",
    includeTimeline: true,
    shifts: [{ projectId: "p", months: -2, fromMonth: "2026-10" }],
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Proje P: öne çekme/);
});

test("shortage summary for the affected teams, current versus shifted", () => {
  const base = sample();
  const scenario = applyScenario(base, {
    id: "s1",
    name: "+3",
    includeTimeline: true,
    shifts: [{ projectId: "p", months: 3, fromMonth: "2026-10" }],
  }).data;
  const teams = affectedTeams([base, scenario], ["p"]);
  assert.deepEqual(teams, ["a"]);
  const months = monthsFrom("2026-10", 6);
  const now = summarizeScenario(base, teams, months);
  // Team A has 2 people: October 2+1 = 3 planned → 1 short.
  assert.equal(now.remaining["a|2026-10"], -1);
  assert.equal(now.shortage, 1);
  assert.deepEqual(now.peak, { month: "2026-10", value: 1 });
  const later = summarizeScenario(scenario, teams, months);
  assert.equal(later.remaining["a|2026-10"], 1); // October is freed
  assert.equal(later.remaining["a|2027-01"], 0);
  assert.equal(later.shortage, 0);
  assert.equal(later.shortageMonths, 0);
  assert.equal(later.peak, null);
});
