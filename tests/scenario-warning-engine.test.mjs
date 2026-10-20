import { exampleCases, warningFixture } from "./scenario-warning-fixture.mjs";
import {
  leaderProgress,
  leaderResourceByMonth,
  projectRollup,
} from "../shared/project-progress.ts";
import { DEFAULT_WARNING_SETTINGS } from "../shared/scenario-warning-policy.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateWarning,
  progressStateFor,
  assessProjectWarning,
} from "../shared/scenario-warnings.ts";
import {
  synchronizeScenarioWarnings,
  captureLegacyResourceReferences,
} from "../backend/scenario-warning-engine.mjs";

for (const c of exampleCases)
  test(`istenen örnek ${c.no}: ${c.code || (c.completed ? "uyarı yok" : "yalnız Planda")}`, () => {
    const result = evaluateWarning({
      ...c,
      futurePlanned: (100 - c.actual) * c.coverage,
    });
    assert.equal(result.code, c.code);
    if (c.critical) assert.equal(result.warning1, "Kritik Gecikme");
    if (c.no === 11) assert.equal(result.trendEscalated, true);
    if (c.no === 12) {
      assert.equal(result.warning1, "Planda");
      assert.equal(result.warning2, "");
    }
    if (c.completed) {
      assert.equal(result.warning1, "");
      assert.equal(result.warning2, "");
    }
  });

test("eşikler sınır değerlerinde doğru sınıflanır; kesintili ve eksik trend yükseltilmez", () => {
  for (const [gap, state] of [
    [5, "ahead"],
    [4.999, "onTrack"],
    [-5, "onTrack"],
    [-5.001, "behind"],
    [-15, "behind"],
    [-15.001, "critical"],
  ])
    assert.equal(progressStateFor(gap), state);
  for (const previousDeviations of [[], [null], [-5], [-16]])
    assert.equal(
      evaluateWarning({
        planned: 40,
        actual: 32,
        futurePlanned: 68,
        nextResources: 1,
        previousDeviations,
      }).trendEscalated,
      false,
    );
  for (const [coverage, state] of [
    [0.8999, "insufficient"],
    [0.9, "sufficient"],
    [1.2, "sufficient"],
    [1.2001, "excess"],
  ])
    assert.equal(
      evaluateWarning({
        planned: 50,
        actual: 50,
        futurePlanned: 50 * coverage,
        nextResources: 1,
      }).resourceState,
      state,
    );
});

test("kaynak değişikliği sabit onay oranıyla karşılamayı ve senaryoyu değiştirir", () => {
  const d = warningFixture();
  const original = structuredClone(
    d.projectProgress[0].baselines[0].resourceReference,
  );
  assert.equal(assessProjectWarning(d, d.projects[0]).code, "S-02");
  d.allocations["t|p|2026-10"] = 102;
  const value = assessProjectWarning(d, d.projects[0]);
  assert.equal(value.futurePlanned, 102);
  assert.equal(value.coverage, 1.5);
  assert.equal(value.code, "S-04");
  assert.deepEqual(
    d.projectProgress[0].baselines[0].resourceReference,
    original,
  );
});

test("son kilitli ayda eksik liderlik girişi senaryo üretmez; kilitsiz ara ay trendi keser", () => {
  const d = warningFixture();
  const missing = structuredClone(d);
  delete missing.projectProgress[0].actuals["2026-09"];
  assert.equal(
    assessProjectWarning(missing, missing.projects[0]).status,
    "missing",
  );
  assert.equal(assessProjectWarning(missing, missing.projects[0]).code, null);
  assert.equal(assessProjectWarning(d, d.projects[0]).trendEscalated, false);
  d.progressLocks.push({ id: "2026-08" });
  assert.equal(
    assessProjectWarning(d, d.projects[0]).progressState,
    "critical",
  );
  d.projectProgress[0].actuals["2026-08"].pct = 32;
  assert.equal(assessProjectWarning(d, d.projects[0]).progressState, "behind");
});

test("uyarı senaryo değişiminde kapanır; yeniden çalıştırma ve aynı ay geri dönüşü mükerrer oluşturmaz", () => {
  const d = warningFixture(),
    now = new Date("2026-10-20T10:00:00Z");
  assert.ok(synchronizeScenarioWarnings(d, now) > 0);
  const first = d.scenarioWarnings[0];
  assert.equal(first.code, "S-02");
  const saved = structuredClone(d);
  assert.equal(synchronizeScenarioWarnings(d, now), 0);
  assert.deepEqual(d, saved);
  d.allocations["t|p|2026-10"] = 102;
  synchronizeScenarioWarnings(d, now);
  assert.equal(d.scenarioWarnings.length, 2);
  assert.equal(d.scenarioWarnings[0].status, "closed");
  assert.equal(d.scenarioWarnings[1].code, "S-04");
  d.allocations["t|p|2026-10"] = 60;
  synchronizeScenarioWarnings(d, now);
  assert.equal(d.scenarioWarnings.length, 2);
  assert.equal(d.scenarioWarnings[0].status, "open");
  assert.equal(d.scenarioWarnings[0].history.length, 3);
  d.projectProgress[0].actuals["2026-09"].pct = 100;
  synchronizeScenarioWarnings(d, now);
  assert.equal(d.warningAssessments[0].status, "completed");
  assert.ok(d.scenarioWarnings.every((w) => w.status === "closed"));
});

test("eski plan referansı bir kez ve önceki kaynak verisinden yakalanır", () => {
  const d = warningFixture();
  delete d.projectProgress[0].baselines[0].resourceReference;
  const before = structuredClone(d);
  d.allocations["t|p|2026-10"] = 200;
  assert.equal(
    captureLegacyResourceReferences(d, { referenceData: before }),
    1,
  );
  assert.equal(
    d.projectProgress[0].baselines[0].resourceReference.resourceTotal,
    100,
  );
  assert.equal(
    d.projectProgress[0].baselines[0].resourceReference.source,
    "migration",
  );
  assert.equal(captureLegacyResourceReferences(d), 0);
  assert.equal(
    before.projectProgress[0].baselines[0].resourceReference,
    undefined,
  );
});

test("eşik, trend ve kaynak dönemi ayarlardan okunur; planlanmamış kaynak önceliklidir", () => {
  const custom = {
    ...DEFAULT_WARNING_SETTINGS,
    aheadThreshold: 10,
    behindThreshold: -10,
    criticalThreshold: -20,
    trendMonths: 3,
    coverageMinimum: 50,
    coverageMaximum: 160,
  };
  assert.equal(
    evaluateWarning(
      { planned: 40, actual: 32, futurePlanned: 40, nextResources: 1 },
      custom,
    ).progressState,
    "onTrack",
  );
  const delayed = {
    planned: 50,
    actual: 38,
    futurePlanned: 62,
    nextResources: 1,
  };
  assert.equal(
    evaluateWarning({ ...delayed, previousDeviations: [-12] }, custom)
      .progressState,
    "behind",
  );
  assert.equal(
    evaluateWarning({ ...delayed, previousDeviations: [-12, -12] }, custom)
      .progressState,
    "critical",
  );
  const noNearResources = evaluateWarning({
    planned: 50,
    actual: 50,
    futurePlanned: 100,
    nextResources: 0,
  });
  assert.equal(noNearResources.code, "S-05");
  const d = warningFixture();
  d.projects[0].end = "2027-03";
  delete d.allocations["t|p|2026-10"];
  d.allocations["t|p|2027-01"] = 60;
  assert.equal(
    assessProjectWarning(d, d.projects[0]).resourceState,
    "unplanned",
  );
  assert.equal(
    assessProjectWarning(d, d.projects[0], {
      ...DEFAULT_WARNING_SETTINGS,
      resourceHorizonMonths: 4,
    }).resourceState,
    "insufficient",
  );
});

test("proje toplamı mevcut kaynak ağırlıklarını korur; ek liderlik verisi eksikken senaryo üretmez", () => {
  const d = warningFixture();
  d.teams.push({ ...d.teams[0], id: "t2", lead: "İkinci Liderlik" });
  const second = structuredClone(d.projectProgress[0]);
  second.id = "pr2";
  second.leader = "İkinci Liderlik";
  second.baselines[0].targets["2026-09"] = 80;
  second.actuals["2026-09"].pct = 95;
  d.projectProgress.push(second);
  d.allocations["t2|p|2026-01"] = 100;
  d.allocations["t2|p|2026-10"] = 300;
  const planned = leaderResourceByMonth(d.teams, d.allocations, "p");
  const previous = projectRollup(
    d.projectProgress.map((r) =>
      leaderProgress(r, "2026-09", planned.get(r.leader), {}, "2026-12"),
    ),
  );
  const assessment = assessProjectWarning(d, d.projects[0]);
  assert.equal(Number(assessment.planned.toFixed(1)), previous.target);
  assert.equal(Number(assessment.actual.toFixed(1)), previous.actual);
  delete second.actuals["2026-09"];
  assert.equal(assessProjectWarning(d, d.projects[0]).status, "missing");
  assert.equal(assessProjectWarning(d, d.projects[0]).code, null);
});

test("sıfır kaynak referansında gelecekte kaynak da yoksa planlanmamış durumu hesaplanabilir", () => {
  const d = warningFixture();
  d.projectProgress[0].weight = 1;
  d.projectProgress[0].baselines[0].resourceReference.resourceTotal = 0;
  d.allocations = {};
  assert.equal(assessProjectWarning(d, d.projects[0]).code, "S-01");
});
