import test from "node:test";
import assert from "node:assert/strict";
import {
  planningEffectiveness,
  resourceAllocationComparison,
  topResourceProjects,
  capacityTrend,
  utilization,
  rankTeamShortages,
  delayStartDate,
  hiringScenario,
} from "../shared/resource-planning-reports.ts";
import { buildCapacityIndex } from "../shared/metrics.ts";

const teams = [
  { id: "a", name: "A", lead: "L" },
  { id: "b", name: "B", lead: "L" },
];
const base = {
  effective: "2026-01",
  team: "a",
  status: "Aktif İlan",
  included: true,
  start: "2026-11-01",
  end: "",
  amount: 2,
};
function resource(id, ...versions) {
  return { id, name: id, note: "", versions };
}
function dataset(resources) {
  return {
    teams,
    resources,
    projects: [],
    allocations: { "a|p|2026-11": 5, "a|p|2026-12": 5, "b|p|2026-11": 1 },
    revisions: {},
  };
}

test("capacity comparison aggregates before net shortage; ranking preserves each team's deficit", () => {
  const cache = {
    "a|2026-01": { current: 0, total: 20 },
    "b|2026-01": { current: 1, total: 0 },
  };
  assert.deepEqual(capacityTrend(cache, ["a", "b"], ["2026-01"]), [
    { month: "2026-01", current: 1, total: 20 },
  ]);
  assert.deepEqual(rankTeamShortages(cache, teams, ["2026-01", "2026-02"]), [
    { team: teams[0], averageShortage: 10 },
  ]);
  assert.deepEqual(rankTeamShortages(cache, [teams[1]], ["2026-01"]), []);
  assert.deepEqual(capacityTrend(cache, [], ["2026-01"]), [
    { month: "2026-01", current: 0, total: 0 },
  ]);
});

test("team need averages over the selected period including zero months, with stable ranking and empty scopes", () => {
  const months = Array.from(
    { length: 12 },
    (_, i) => `2026-${String(i + 1).padStart(2, "0")}`,
  );
  const cache = {
    "a|2026-01": { current: 1, total: 7 },
    "a|2026-02": { current: 20, total: 0 },
    "b|2026-01": { current: 1, total: 13 },
  };
  assert.deepEqual(rankTeamShortages(cache, teams, months), [
    { team: teams[1], averageShortage: 1 },
    { team: teams[0], averageShortage: 0.5 },
  ]);
  assert.deepEqual(rankTeamShortages(cache, [teams[0]], months.slice(0, 6)), [
    { team: teams[0], averageShortage: 1 },
  ]);
  assert.deepEqual(rankTeamShortages(cache, teams, months.slice(1)), []);
  assert.deepEqual(rankTeamShortages(cache, teams, []), []);
  assert.deepEqual(rankTeamShortages(cache, [], months), []);
});

test("utilization distinguishes zero capacity from unused capacity and overload", () => {
  assert.equal(utilization({ current: 0, total: 3 }), null);
  assert.equal(utilization({ current: 0, total: 0 }), null);
  assert.equal(utilization({ current: 2, total: 0 }), 0);
  assert.equal(utilization({ current: 2, total: 3 }), 150);
});

test("scenario date shift clamps day across leap years and year boundaries", () => {
  assert.equal(delayStartDate("2026-01-31", 1), "2026-02-28");
  assert.equal(delayStartDate("2028-01-31", 1), "2028-02-29");
  assert.equal(delayStartDate("2026-11-30", 3), "2027-02-28");
  assert.equal(delayStartDate("2026-11", 2), "2027-01-01");
});

test("scenario only delays included future active postings, weights FTE and never mutates input", () => {
  const data = dataset([
    resource("included", base),
    resource("excluded", { ...base, included: false, amount: 20 }),
    resource("passive", { ...base, status: "Pasif İlan", amount: 20 }),
    resource("undated", { ...base, start: "", amount: 20 }),
    resource("past", { ...base, start: "2026-01-01", amount: 0.5 }),
    resource("working", { ...base, status: "Aktif Çalışan", amount: 0.5 }),
    resource("outside", { ...base, team: "b", amount: 50 }),
  ]);
  const before = JSON.stringify(data),
    months = ["2026-10", "2026-11", "2026-12", "2027-01"];
  const cache = buildCapacityIndex(data, months);
  const points = hiringScenario(data, cache, ["a"], months, 2, "2026-10-02");
  assert.deepEqual(
    points.map((p) => [p.plannedShortage, p.delayedShortage]),
    [
      [0, 0],
      [2, 4],
      [2, 4],
      [0, 0],
    ],
  );
  assert(
    hiringScenario(data, cache, ["a"], months, 0, "2026-10-02").every(
      (p) => p.plannedShortage === p.delayedShortage,
    ),
  );
  assert.equal(JSON.stringify(data), before);
});

test("scenario retains partial-month dates, end dates, effective status and team changes", () => {
  const data = dataset([
    resource("half", { ...base, start: "2026-11-16", amount: 1 }),
    resource("ends", { ...base, end: "2026-11-30", amount: 1 }),
    resource(
      "transfer",
      { ...base, amount: 1 },
      {
        ...base,
        effective: "2026-12",
        status: "Aktif Çalışan",
        team: "b",
        amount: 1,
      },
    ),
  ]);
  const months = ["2026-11", "2026-12"];
  const cache = buildCapacityIndex(data, months);
  const points = hiringScenario(data, cache, ["a"], months, 1, "2026-10-02");
  assert.equal(points[0].plannedShortage, 2.5);
  assert.equal(points[0].delayedShortage, 5);
  assert.equal(points[1].plannedShortage, 4);
  assert.equal(points[1].delayedShortage, 5 - 16 / 31);
  const other = hiringScenario(data, cache, ["b"], months, 1, "2026-10-02");
  assert.deepEqual(
    other.map((p) => [p.plannedShortage, p.delayedShortage]),
    [
      [1, 1],
      [0, 0],
    ],
  );
});

test("project comparison keeps planning and historical actuals separate, filters scope, and averages zero months", () => {
  const data = {
    projects: [
      { id: "p", name: "P" },
      { id: "q", name: "Q" },
    ],
    allocations: {
      "a|p|2026-01": 6,
      "b|p|2026-01": 100,
      "a|q|2026-02": 4,
      "a|q|2027-01": 300,
      "a|gone|2026-01": 90,
    },
  };
  const actuals = {
    "a|p|2026-01": 2,
    "a|q|2026-02": 3,
    "b|q|2026-01": 100,
    "a|p|2027-01": 500,
  };
  const before = structuredClone({ data, actuals });
  const result = resourceAllocationComparison(
    data,
    actuals,
    ["a", "a"],
    ["2026-01", "2026-02", "2026-03", "2026-01"],
  );
  assert.deepEqual(result.months, [
    { month: "2026-01", planned: 6, actual: 2 },
    { month: "2026-02", planned: 4, actual: 3 },
    { month: "2026-03", planned: 0, actual: 0 },
  ]);
  assert.equal(result.projects[0].plannedAverage, 2);
  assert.equal(result.projects[0].actualAverage, 2 / 3);
  assert.equal(result.projects[1].actualAverage, 1);
  assert.deepEqual({ data, actuals }, before);
  assert.deepEqual(
    resourceAllocationComparison(data, actuals, [], ["2026-01"]).projects,
    [],
  );
  assert.deepEqual(
    resourceAllocationComparison(data, actuals, ["a"], []).projects,
    [],
  );
});

test("top ten project ranking follows selected series with deterministic ties and does not mutate the input", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    project: { id: "p" + i, name: "P" + i },
    actualTotal: i,
    plannedTotal: 12 - i,
    actualAverage: i / 6,
    plannedAverage: (12 - i) / 6,
  }));
  const before = structuredClone(rows);
  assert.equal(topResourceProjects(rows, true, true).length, 10);
  assert.equal(topResourceProjects(rows, true, true)[0].project.id, "p11");
  assert.equal(topResourceProjects(rows, true, false)[0].project.id, "p0");
  assert.equal(topResourceProjects(rows, false, true)[0].project.id, "p11");
  assert.deepEqual(topResourceProjects(rows, false, false), []);
  assert.deepEqual(rows, before);
});

test("planning effectiveness preserves zero-plan gaps and values above 100 percent; period uses totals", () => {
  const points = [
    { month: "2026-01", planned: 10, actual: 5 },
    { month: "2026-02", planned: 1, actual: 4 },
    { month: "2026-03", planned: 0, actual: 2 },
    { month: "2026-04", planned: 5, actual: 0 },
    { month: "2026-05", planned: 0, actual: 0 },
  ];
  const before = structuredClone(points);
  const result = planningEffectiveness(points);
  assert.deepEqual(
    result.months.map((row) => row.percent),
    [50, 400, null, 0, null],
  );
  assert.equal(result.plannedTotal, 16);
  assert.equal(result.actualTotal, 11);
  assert.equal(result.percent, 68.75);
  assert.deepEqual(points, before);
  assert.equal(planningEffectiveness([]).percent, null);
  assert.equal(
    planningEffectiveness([{ month: "2026-01", planned: 0, actual: 3 }])
      .percent,
    null,
  );
  assert.equal(
    planningEffectiveness([{ month: "2026-01", planned: 3, actual: 1 }])
      .percent,
    (1 / 3) * 100,
  );
});

test("planning effectiveness avoids nonfinite and invalid ratios", () => {
  for (const [planned, actual] of [
    [Infinity, 1],
    [1, Infinity],
    [NaN, 1],
    [-1, 2],
    [1, -2],
    [Number.MIN_VALUE, Number.MAX_VALUE],
  ]) {
    assert.equal(
      planningEffectiveness([{ month: "2026-01", planned, actual }]).months[0]
        .percent,
      null,
    );
  }
});
