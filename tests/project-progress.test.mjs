import test from "node:test";
import assert from "node:assert/strict";
import {
  leaderProgress,
  leaderResourceByMonth,
  monthsAfter,
  progressSignals,
  projectRollup,
  proposalProblems,
  riskLevel,
  suggestTargets,
  recalculateTargetsAfterEdit,
  targetAt,
} from "../shared/project-progress.ts";

const record = (over = {}) => ({
  id: "p1",
  projectId: "kartal",
  leader: "Sistem",
  baselines: [
    {
      version: 1,
      openingMonth: "2026-10",
      openingPct: 40,
      targets: { "2026-11": 50, "2026-12": 70, "2027-01": 100 },
      approvedByName: "Admin",
      approvedAt: "2026-10-20T00:00:00.000Z",
    },
  ],
  actuals: {},
  createdBy: "u",
  createdByName: "U",
  createdAt: "2026-10-20T00:00:00.000Z",
  ...over,
});

test("months after the opening run up to the project end", () => {
  assert.deepEqual(monthsAfter("2026-11", "2027-02"), [
    "2026-12",
    "2027-01",
    "2027-02",
  ]);
  assert.deepEqual(monthsAfter("2027-02", "2027-01"), []);
});

test("the suggested curve follows the remaining planned resource and ends at 100", () => {
  const targets = suggestTargets("2026-10", 40, "2027-01", {
    "2026-11": 1,
    "2026-12": 2,
    "2027-01": 1,
    "2026-09": 9, // before the opening: ignored
  });
  assert.deepEqual(targets, { "2026-11": 55, "2026-12": 85, "2027-01": 100 });
  // Without a plan the remainder is spread evenly.
  assert.deepEqual(suggestTargets("2026-10", 0, "2026-12", undefined), {
    "2026-11": 50,
    "2026-12": 100,
  });
  assert.deepEqual(
    proposalProblems(
      { openingMonth: "2026-10", openingPct: 40, targets },
      "2027-01",
    ),
    [],
  );
});

test("raising a target above the next month rebuilds all following months by remaining resource", () => {
  const targets = {
    "2026-09": 10,
    "2026-10": 30,
    "2026-11": 50,
    "2026-12": 75,
    "2027-01": 100,
  };
  const updated = recalculateTargetsAfterEdit(
    targets,
    "2026-10",
    80,
    "2027-03",
    {
      "2026-10": 99,
      "2026-11": 1,
      "2026-12": 2,
      "2027-01": 1,
      "2027-02": 99,
    },
  );
  assert.deepEqual(updated, {
    "2026-09": 10,
    "2026-10": 80,
    "2026-11": 85,
    "2026-12": 95,
    "2027-01": 100,
  });
  assert.deepEqual(
    proposalProblems(
      { openingMonth: "2026-08", openingPct: 0, targets: updated },
      "2027-03",
    ),
    [],
  );
  assert.equal(targets["2026-11"], 50);
});

test("recalculation without remaining resource spreads work evenly until the original completion", () => {
  assert.deepEqual(
    recalculateTargetsAfterEdit(
      { "2026-10": 20, "2026-11": 30, "2026-12": 60, "2027-01": 100 },
      "2026-10",
      70,
      "2027-03",
      undefined,
    ),
    {
      "2026-10": 70,
      "2026-11": 80,
      "2026-12": 90,
      "2027-01": 100,
    },
  );
});

test("non-crossing, incomplete and invalid edits leave the rest of the curve untouched", () => {
  const targets = { "2026-10": 20, "2026-11": 60, "2026-12": 100 };
  for (const value of [40, 60, -1, 101, Number.NaN]) {
    assert.equal(
      recalculateTargetsAfterEdit(
        targets,
        "2026-10",
        value,
        "2026-12",
        undefined,
      ),
      null,
    );
  }
  assert.equal(
    recalculateTargetsAfterEdit(
      { "2026-10": 20, "2026-11": 30 },
      "2026-10",
      80,
      "2026-12",
      undefined,
    ),
    null,
  );
  assert.equal(
    recalculateTargetsAfterEdit(targets, "2026-12", 90, "2026-12", undefined),
    null,
  );
});

test("early completion clears later suggestions and rounding preserves the original finish otherwise", () => {
  const targets = {
    "2026-09": 10,
    "2026-10": 20,
    "2026-11": 60,
    "2026-12": 100,
  };
  assert.deepEqual(
    recalculateTargetsAfterEdit(targets, "2026-10", 100, "2026-12", undefined),
    { "2026-09": 10, "2026-10": 100 },
  );
  assert.deepEqual(
    recalculateTargetsAfterEdit(targets, "2026-10", 99.9, "2026-12", {
      "2026-11": 9,
      "2026-12": 1,
    }),
    {
      "2026-09": 10,
      "2026-10": 99.9,
      "2026-11": 99.9,
      "2026-12": 100,
    },
  );
});

test("a proposal may leave months empty, never falls and reaches 100 by the end", async () => {
  const { clearAfterComplete } = await import("../shared/project-progress.ts");
  const base = { openingMonth: "2026-10", openingPct: 40 };
  // Empty months keep the previous target; 100 % may come early.
  assert.deepEqual(
    proposalProblems({ ...base, targets: { "2027-01": 100 } }, "2027-03"),
    [],
  );
  assert.deepEqual(
    proposalProblems(
      { ...base, targets: { "2026-11": 60, "2027-03": 100 } },
      "2027-03",
    ),
    [],
  );
  assert.match(
    proposalProblems({ ...base, targets: { "2026-11": 50 } }, "2026-12")[0],
    /%100'e ulaşmalı/,
  );
  // No targets outside the opening–end range.
  assert.match(
    proposalProblems({ ...base, targets: { "2027-02": 100 } }, "2026-12")[0],
    /bitişe kadarki aylara/,
  );
  // Setting a month to 100 % clears the months after it.
  assert.deepEqual(
    clearAfterComplete(
      { "2026-11": "50", "2026-12": "100", "2027-01": "100" },
      "2026-12",
    ),
    { "2026-11": "50", "2026-12": "100" },
  );
  assert.deepEqual(
    clearAfterComplete({ "2026-11": "50", "2026-12": "80" }, "2026-11"),
    { "2026-11": "50", "2026-12": "80" },
  );
  // Months stay flat between entered targets.
  assert.equal(
    targetAt(
      {
        version: 1,
        openingMonth: "2026-10",
        openingPct: 40,
        targets: { "2026-11": 60, "2027-03": 100 },
        approvedByName: "A",
        approvedAt: "x",
      },
      "2027-02",
    ),
    60,
  );
  assert.match(
    proposalProblems(
      { ...base, targets: { "2026-11": 60, "2026-12": 55 } },
      "2026-12",
    )[0],
    /küçük olamaz/,
  );
  assert.match(
    proposalProblems({ ...base, targets: { "2026-11": 30 } }, "2026-11")[0],
    /küçük olamaz/,
  );
  assert.match(
    proposalProblems({ ...base, targets: { "2026-11": 90 } }, "2026-11")[0],
    /%100/,
  );
});

test("the target of a month comes from the baseline, flat before and after it", () => {
  const baseline = record().baselines[0];
  assert.equal(targetAt(baseline, "2026-09"), 40);
  assert.equal(targetAt(baseline, "2026-12"), 70);
  assert.equal(targetAt(baseline, "2027-05"), 100);
  assert.equal(targetAt(undefined, "2026-12"), null);
});

test("spending is placed on the progress scale from the opening", () => {
  const row = leaderProgress(
    record({ actuals: { "2026-12": { pct: 60, note: "x" } } }),
    "2026-12",
    { "2026-11": 2, "2026-12": 2, "2027-01": 4 },
    { "2026-11": 3, "2026-12": 3 },
    "2027-01",
  );
  // 6 FTE consumed, 4 still planned: 40 + 60 × 6/10 = 76.
  assert.equal(row.spent, 76);
  assert.equal(row.target, 70);
  assert.equal(row.actual, 60);
  assert.equal(row.performance, 0.86);
  assert.equal(row.plannedTotal, 8);
  const signals = progressSignals(row);
  assert.deepEqual(signals, [
    { level: "amber", reason: "Perf. 0,86" },
    { level: "amber", reason: "harcama +16 puan" },
  ]);
  assert.equal(riskLevel(signals), "amber");
});

test("signal thresholds: below 0.80 or 25 points over spend is red", () => {
  assert.equal(
    riskLevel(progressSignals({ performance: 0.79, actual: 40, spent: 40 })),
    "red",
  );
  assert.equal(
    riskLevel(progressSignals({ performance: 0.9, actual: 40, spent: 54 })),
    "green",
  );
  assert.equal(
    riskLevel(progressSignals({ performance: 1, actual: 40, spent: 65 })),
    "red",
  );
  assert.equal(
    riskLevel(progressSignals({ performance: null, actual: null, spent: 90 })),
    "green",
  );
});

test("the project figure weighs leaderships by planned resource or the admin's weight", () => {
  const rows = [
    { record: record(), target: 62, actual: 48, spent: 70, plannedTotal: 6 },
    { record: record(), target: 52, actual: 43, spent: 60, plannedTotal: 4 },
  ].map((row) => ({
    previousActual: null,
    performance: null,
    note: "",
    ...row,
  }));
  assert.deepEqual(projectRollup(rows), {
    target: 58,
    actual: 46,
    spent: 66,
    performance: 0.79,
    missing: 0,
  });
  // An admin weight replaces the planned share.
  rows[1].record = record({ weight: 6 });
  assert.equal(projectRollup(rows).target, 57);
  // Performance compares only the leaderships that entered this month.
  rows[1].actual = null;
  const partial = projectRollup(rows);
  assert.equal(partial.actual, 48);
  assert.equal(partial.performance, 0.77);
  assert.equal(partial.missing, 1);
});

test("planned FTE is grouped by the team's leadership", () => {
  const out = leaderResourceByMonth(
    [
      { id: "t1", lead: "Sistem" },
      { id: "t2", lead: "Sistem" },
      { id: "t3", lead: "Yapısal" },
    ],
    {
      "t1|kartal|2026-11": 1,
      "t2|kartal|2026-11": 0.5,
      "t3|kartal|2026-12": 2,
      "t1|other|2026-11": 9,
    },
    "kartal",
  );
  assert.deepEqual(Object.fromEntries(out), {
    Sistem: { "2026-11": 1.5 },
    Yapısal: { "2026-12": 2 },
  });
});

test("resource, topic, scenario and entry signals follow the agreed thresholds", async () => {
  const {
    underPlanSignal,
    shortageSignal,
    lateTopicSignal,
    scenarioSignal,
    missingEntrySignal,
    workdaysPassed,
  } = await import("../shared/project-progress.ts");
  const planned = { "2026-11": 2, "2026-12": 2, "2027-01": 2 };
  assert.equal(
    underPlanSignal(
      planned,
      { "2026-11": 2, "2026-12": 1, "2027-01": 1.6 },
      "2027-01",
    ),
    null,
  );
  assert.deepEqual(
    underPlanSignal(
      planned,
      { "2026-11": 2, "2026-12": 1, "2027-01": 1 },
      "2027-01",
    ),
    {
      level: "amber",
      reason: "2 ay planın altında",
    },
  );
  assert.equal(underPlanSignal(planned, {}, "2027-01").level, "red");
  assert.equal(shortageSignal([0, 0, 0]), null);
  assert.equal(shortageSignal([0.5, 0, 0]).level, "amber");
  assert.equal(shortageSignal([1.5, 0, 0]).level, "red");
  assert.equal(shortageSignal([0.2, 0.2, 0.2]).level, "red");
  assert.equal(lateTopicSignal(0), null);
  assert.equal(lateTopicSignal(1).level, "amber");
  assert.equal(lateTopicSignal(2).level, "red");
  assert.equal(scenarioSignal(["reverted"]), null);
  assert.equal(scenarioSignal(["draft"]).level, "amber");
  assert.equal(scenarioSignal(["approved", "applied"]).level, "red");
  const entry = {
    month: "2026-11",
    currentMonth: "2026-12",
    entered: false,
    locked: false,
  };
  assert.equal(missingEntrySignal({ ...entry, workdaysPassed: 4 }), null);
  assert.equal(
    missingEntrySignal({ ...entry, workdaysPassed: 5 }).level,
    "amber",
  );
  assert.equal(
    missingEntrySignal({ ...entry, workdaysPassed: 1, locked: true }).level,
    "red",
  );
  assert.equal(
    missingEntrySignal({ ...entry, workdaysPassed: 9, entered: true }),
    null,
  );
  assert.equal(
    missingEntrySignal({ ...entry, month: "2026-12", workdaysPassed: 9 }),
    null,
  );
  // 1–7 December 2026: Tue–Fri and Mon–Mon = 5 weekdays.
  assert.equal(workdaysPassed("2026-12-07"), 5);
});

test("the progress sheet lists each project with its leaderships, numbers as numbers", async () => {
  const { progressReportSheet } =
    await import("../frontend/src/features/project-progress/progress-export.ts");
  const leader = {
    record: record(),
    target: 62,
    actual: 48,
    spent: 70,
    performance: 0.77,
    previousActual: null,
    note: "Test & <onay>",
    plannedTotal: 6,
    signals: [{ level: "red", reason: "Perf. 0,77" }],
    level: "red",
  };
  const xml = progressReportSheet(
    [
      {
        project: { id: "kartal", name: "KARTAL 8x8" },
        leaders: [leader],
        target: 62,
        actual: 48,
        spent: 70,
        performance: 0.77,
        missing: 0,
        signals: [],
        level: "red",
      },
    ],
    "Oca 2027",
  );
  assert.match(xml, /Proje geneli/);
  assert.match(xml, /<c r="C4" s="5"><v>62<\/v><\/c>/);
  assert.match(xml, /<c r="F5" s="8"><v>0.77<\/v><\/c>/);
  assert.match(xml, /Test &amp; &lt;onay&gt;/);
  assert.match(xml, /Perf\. 0,77/);
  assert.match(xml, /<dimension ref="A1:I5"\/>/);
});
