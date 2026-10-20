import test from "node:test";
import assert from "node:assert/strict";
import { warningFixture } from "./scenario-warning-fixture.mjs";
import { synchronizeScenarioWarnings } from "../backend/scenario-warning-engine.mjs";
import {
  scenarioWarningsCsv,
  scenarioWarningsWorkbook,
} from "../frontend/src/features/project-progress/scenario-warning-export.ts";
import { zipEntries } from "../scripts/browser-checks/files.mjs";

test("CSV Türkçe metin, açıklama ve kullanıcıyı korur; Excel formül enjeksiyonunu önler", () => {
  const d = warningFixture();
  synchronizeScenarioWarnings(d, new Date("2026-10-20T10:00:00Z"));
  d.projects[0].name = '=SUM(1,2) "Proje"';
  d.scenarioWarnings[0].history.at(-1).explanation =
    'Açıklama; "Türkçe"\nikinci satır';
  const csv = scenarioWarningsCsv(d, d.scenarioWarnings);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"'=SUM\(1,2\) ""Proje"""/);
  assert.match(csv, /"Açıklama; ""Türkçe""\nikinci satır"/);
  assert.match(csv, /"Sistem";"2026-10-20T10:00:00.000Z"/);
  const entries = zipEntries(
    Buffer.from(scenarioWarningsWorkbook(d, d.scenarioWarnings)),
  );
  assert.match(entries["xl/workbook.xml"], /Senaryo Uyarıları/);
  assert.match(entries["xl/worksheets/sheet1.xml"], /t="inlineStr"/);
  assert.match(entries["xl/worksheets/sheet1.xml"], /=SUM\(1,2\)/);
  assert.doesNotMatch(entries["xl/worksheets/sheet1.xml"], /<f[ >]/);
  assert.match(entries["xl/worksheets/sheet1.xml"], /autoFilter/);
});
