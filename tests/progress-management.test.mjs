import test from "node:test";
import assert from "node:assert/strict";
import {
  managementPoint,
  assessManagement,
  manageProject,
  transferComparisons,
} from "../frontend/src/features/project-progress/progress-management.ts";
import {
  managementSheets,
  managementExportRows,
} from "../frontend/src/features/project-progress/progress-management-export.ts";

const project = {
  id: "p",
  name: "Proje & <A>",
  responsibleName: "Sorumlu",
  start: "2026-01",
  end: "2026-12",
  phases: {},
};
const leader = (name = "Liderlik A", actual = 70, overrides = {}) => ({
  record: {
    id: name,
    projectId: "p",
    leader: name,
    baselines: [
      {
        version: 1,
        openingMonth: "2026-08",
        openingPct: 0,
        targets: {
          "2026-09": 50,
          "2026-10": 70,
          "2026-11": 85,
          "2026-12": 100,
        },
      },
    ],
    actuals:
      actual === null ? {} : { "2026-09": { pct: actual, note: "Test" } },
    ...overrides,
  },
  signals: [],
  level: "green",
  target: 50,
  actual,
  spent: 10,
  plannedTotal: 14,
});
function context({
  shortages = [0, 0, 0],
  actual = true,
  planned = true,
} = {}) {
  return {
    currentMonth: "2026-10",
    today: "2026-10-19",
    planned: () =>
      new Map(
        ["Liderlik A", "Liderlik B"].map((name) => [
          name,
          planned
            ? { "2026-09": 2, "2026-10": 4, "2026-11": 4, "2026-12": 4 }
            : {},
        ]),
      ),
    actual: () =>
      new Map(
        ["Liderlik A", "Liderlik B"].map((name) => [
          name,
          actual ? { "2026-09": 2 } : {},
        ]),
      ),
    shortages: () => shortages,
  };
}
const row = (id, actual = 70, name = "Liderlik A") => ({
  project: { ...project, id, name: id },
  leaders: [leader(name, actual)],
  signals: [],
  level: "green",
  target: 50,
  actual,
  spent: 10,
  performance: actual / 50,
  missing: 0,
});

test("project percentages compare the same complete leadership scope", () => {
  const ctx = context();
  const point = managementPoint(
    ctx,
    project,
    [leader("Liderlik A", 70), leader("Liderlik B", 30)],
    "2026-09",
  );
  assert.equal(point.target, 50);
  assert.equal(point.actual, 50);
  assert.equal(point.gap, 0);
  assert.equal(point.state, "onTrack");
  const weighted = managementPoint(
    ctx,
    project,
    [
      leader("Liderlik A", 70, { weight: 3 }),
      leader("Liderlik B", 30, { weight: 1 }),
    ],
    "2026-09",
  );
  assert.equal(weighted.actual, 60);
  assert.equal(weighted.gap, 10);
});

test("missing submissions and plans never produce an ahead or transfer recommendation", () => {
  for (const missing of [
    leader("Liderlik B", null),
    leader("Liderlik B", null, { baselines: [] }),
  ]) {
    const assessment = assessManagement(
      context(),
      project,
      [leader(), missing],
      "2026-09",
    );
    assert.equal(assessment.point.actual, null);
    assert.equal(assessment.point.gap, null);
    assert.equal(assessment.risk, null);
    assert.equal(assessment.donor, false);
    assert.equal(assessment.point.entered, 1);
  }
});

test("future, pre-tracking and out-of-period months are not missing actuals or delay risks", () => {
  const ctx = context();
  for (const [month, expected] of [
    ["2026-08", "notStarted"],
    ["2026-11", "future"],
    ["2027-01", "outside"],
  ]) {
    const value = assessManagement(ctx, project, [leader()], month);
    assert.equal(value.point.state, expected);
    assert.equal(value.point.actual, null);
    assert.equal(value.risk, null);
    assert.equal(value.support, false);
  }
});

test("historical progress uses the plan effective in that month, before a later revision", () => {
  const original = leader();
  original.record.baselines.push({
    version: 2,
    openingMonth: "2026-10",
    openingPct: 80,
    targets: { "2026-11": 90, "2026-12": 100 },
  });
  assert.equal(
    managementPoint(context(), project, [original], "2026-09").target,
    50,
  );
  assert.equal(
    managementPoint(context(), project, [original], "2026-11").target,
    90,
  );
});

test("resource review requires complete ahead progress, recorded resource and no capacity or delivery risk", () => {
  const value = assessManagement(context(), project, [leader()], "2026-09");
  assert.equal(value.point.state, "ahead");
  assert.equal(value.donor, true);
  assert.equal(value.upcoming, 12);
  assert.equal(
    assessManagement(context({ actual: false }), project, [leader()], "2026-09")
      .donor,
    false,
  );
  assert.equal(
    assessManagement(
      context({ shortages: [0, 1, 0] }),
      project,
      [leader()],
      "2026-09",
    ).donor,
    false,
  );
  assert.equal(
    assessManagement(context(), project, [leader()], "2026-09", [
      { level: "red", reason: "2 geciken kritik konu" },
    ]).donor,
    false,
  );
});

test("behind progress with persistent capacity shortage identifies a calendar/resource scenario for review", () => {
  const value = assessManagement(
    context({ shortages: [1, 1, 1] }),
    project,
    [leader("Liderlik A", 30)],
    "2026-09",
  );
  assert.equal(value.point.gap, -20);
  assert.equal(value.risk, "red");
  assert.equal(value.support, true);
  assert.equal(value.action, "Takvim / kaynak senaryosu değerlendir");
  assert(
    value.reasons.some((reason) => reason.includes("3 ayında kapasite açığı")),
  );
});

test("a delayed leadership cannot be hidden by an ahead-of-plan project average", () => {
  const mixed = row("Karma proje", 100);
  mixed.leaders = [
    leader("Liderlik A", 100, { weight: 3 }),
    leader("Liderlik B", 30, { weight: 1 }),
  ];
  const project = manageProject(context(), mixed, "2026-09");
  assert.equal(project.assessment.point.state, "ahead");
  assert.equal(project.assessment.risk, "red");
  assert.equal(project.assessment.donor, false);
  assert.equal(project.assessment.support, true);
  assert(
    project.assessment.reasons.some((reason) =>
      reason.includes("Liderlik B: Planın gerisinde"),
    ),
  );
});

test("transfer comparisons require a shared leadership and exclude unassessed recipients", () => {
  const ctx = context();
  const source = manageProject(ctx, row("İleri proje", 70), "2026-09");
  const destination = manageProject(ctx, row("Geri proje", 30), "2026-09");
  const other = manageProject(
    ctx,
    row("Diğer liderlik", 30, "Liderlik B"),
    "2026-09",
  );
  const missing = manageProject(ctx, row("Veri eksik", null), "2026-09");
  const pairs = transferComparisons([source, destination, other, missing]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].leader, "Liderlik A");
  assert.equal(pairs[0].to.row.project.id, "Geri proje");
});

test("a transfer comparison uses the shared leadership gap when another leadership has not submitted", () => {
  const destination = row("Kısmi proje", 30);
  destination.leaders.push(leader("Liderlik B", null));
  const managed = manageProject(context(), destination, "2026-09");
  assert.equal(managed.assessment.point.gap, null);
  assert.equal(managed.assessment.risk, "red");
  const source = manageProject(context(), row("İleri proje", 70), "2026-09");
  const pairs = transferComparisons([source, managed]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].fromGap, 20);
  assert.equal(pairs[0].toGap, -20);
});

test("all-zero comparison weights are explicit and exports retain missing data and escaped names", () => {
  const ctx = context({ planned: false });
  assert.equal(
    managementPoint(ctx, project, [leader()], "2026-09").state,
    "unweighted",
  );
  const scope = row("Proje & <A>");
  scope.leaders.push(leader("Liderlik B", null));
  const managed = manageProject(context(), scope, "2026-09");
  const sheets = managementSheets(context(), [managed], "2026-09", [
    "2026-09",
    "2026-11",
  ]);
  assert.deepEqual(
    sheets.map((s) => s.name),
    ["Yönetici Değerlendirmesi", "Aylık İlerleme"],
  );
  assert.match(sheets[0].xml, /Proje &amp; &lt;A&gt;/);
  assert.match(sheets[0].xml, /Gerçekleşen verisi eksik/);
  assert.match(sheets[1].xml, /Gelecek dönem/);
  assert.equal(managementExportRows([managed])[0].actual, null);
});
