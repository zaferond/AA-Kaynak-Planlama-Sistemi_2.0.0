import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMonthlyShortageTrend,
  summarizeMonthlyShortage,
} from "../frontend/src/monthly-shortage-trend.ts";
import { buildCapacityIndex } from "../backend/domain/index.mjs";
import { workspaceMetric } from "../frontend/src/features/workspace/workspace-selectors.ts";

const months = ["2026-01", "2026-02", "2026-03"];
const capacity = {
  "a|2026-01": { current: 2, total: 4 },
  "b|2026-01": { current: 5, total: 3 },
  "c|2026-01": { current: 1, total: 2 },
  "a|2026-02": { current: 4, total: 4 },
  "b|2026-02": { current: 1, total: 3 },
  "c|2026-02": { current: 2, total: 2 },
  "a|2026-03": { current: 4, total: 3 },
  "b|2026-03": { current: 3, total: 3 },
  "c|2026-03": { current: 2, total: 1 },
};

test("monthly shortage uses the selected scope's net capacity, matching report tables", () => {
  assert.deepEqual(
    buildMonthlyShortageTrend(capacity, ["a", "b", "c"], months),
    [
      { month: "2026-01", total: 1, teamCount: 3 },
      { month: "2026-02", total: 2, teamCount: 3 },
      { month: "2026-03", total: 0, teamCount: 3 },
    ],
  );
  assert.deepEqual(
    buildMonthlyShortageTrend(capacity, ["a", "c"], months).map(
      (point) => point.total,
    ),
    [3, 0, 0],
  );
  assert.deepEqual(
    buildMonthlyShortageTrend(capacity, ["b"], months).map(
      (point) => point.total,
    ),
    [0, 2, 0],
  );
  assert.deepEqual(
    buildMonthlyShortageTrend(capacity, [], months).map((point) => point.total),
    [0, 0, 0],
  );
});

test("shortage uses the same active resource and allocation totals as report tables", () => {
  const data = {
    teams: [{ id: "a", name: "Takım A", lead: "L", excelCapacity: 0 }],
    projects: [],
    resources: [
      {
        id: "r",
        name: "Çalışan",
        note: "",
        versions: [
          {
            effective: "2026-01",
            team: "a",
            lead: "L",
            status: "Aktif Çalışan",
            included: true,
            start: "2026-01-01",
            end: "",
            amount: 1,
          },
        ],
      },
    ],
    allocations: { "a|p|2026-01": 2, "a|q|2026-01": 0.5 },
    revisions: {},
  };
  const index = buildCapacityIndex(data, ["2026-01"]);
  assert.deepEqual(buildMonthlyShortageTrend(index, ["a"], ["2026-01"]), [
    { month: "2026-01", total: 1.5, teamCount: 1 },
  ]);
});

test("period average divides total shortage by all selected months, never by teams", () => {
  assert.deepEqual(
    summarizeMonthlyShortage(
      buildMonthlyShortageTrend(capacity, ["a", "b", "c"], months),
    ),
    { total: 3, monthCount: 3, average: 1 },
  );
  assert.deepEqual(
    summarizeMonthlyShortage(
      buildMonthlyShortageTrend(capacity, ["a", "b", "c"], months.slice(0, 2)),
    ),
    { total: 3, monthCount: 2, average: 1.5 },
  );
  assert.deepEqual(
    summarizeMonthlyShortage(
      buildMonthlyShortageTrend(capacity, ["a", "c"], months),
    ),
    { total: 3, monthCount: 3, average: 1 },
  );
  assert.deepEqual(
    summarizeMonthlyShortage(buildMonthlyShortageTrend(capacity, [], months)),
    { total: 0, monthCount: 3, average: 0 },
  );
  assert.deepEqual(summarizeMonthlyShortage([]), {
    total: 0,
    monthCount: 0,
    average: 0,
  });
});

test("20 allocated and 1 available in another selected team yields the same 19 shortage as the report", () => {
  const month = "2026-01";
  const cells = {
    ["a|" + month]: { current: 0, total: 20 },
    ["b|" + month]: { current: 1, total: 0 },
    ["outside|" + month]: { current: 100, total: 0 },
  };
  const metric = workspaceMetric(cells, ["a", "b"], month);
  const point = buildMonthlyShortageTrend(cells, ["a", "b"], [month])[0];
  assert.deepEqual(metric, { current: 1, total: 20 });
  assert.equal(metric.current - metric.total, -19);
  assert.equal(point.total, 19);
  assert.equal(buildMonthlyShortageTrend(cells, ["a"], [month])[0].total, 20);
  assert.equal(buildMonthlyShortageTrend(cells, ["b"], [month])[0].total, 0);
  assert.equal(
    buildMonthlyShortageTrend(cells, ["a", "b", "outside"], [month])[0].total,
    0,
  );
});
