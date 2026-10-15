import test from "node:test";
import assert from "node:assert/strict";
import { riskWorkbook, riskWorkbooks } from "../frontend/src/risk-export.ts";

function zipEntry(bytes, name) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    decode = new TextDecoder();
  for (let offset = 0; offset < bytes.length;) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const size = view.getUint32(offset + 18, true),
      filenameLength = view.getUint16(offset + 26, true),
      extraLength = view.getUint16(offset + 28, true);
    const start = offset + 30 + filenameLength + extraLength;
    const filename = decode.decode(
      bytes.subarray(offset + 30, offset + 30 + filenameLength),
    );
    if (filename === name)
      return decode.decode(bytes.subarray(start, start + size));
    offset = start + size;
  }
  throw Error(name + " bulunamadı");
}
const project = {
  id: "p",
  name: "Deneme & ARMA",
  start: "2026-01",
  end: "2026-12",
  phases: {},
};
const risk = {
  id: "r",
  projectId: "p",
  reportedBy: "A&B",
  category: "Teknik",
  reportedAt: "2026-09-29",
  system: "Alt sistem",
  description: "=SUM(1,2)",
  cause: "Gecikme",
  actionPlan: "İkinci tedarikçi",
  targetAt: "2026-10-10",
  status: "Takipte",
  owner: "Ayşe",
  likelihood: 3,
  impact: 5,
  strategy: "Kontrol",
  implementedAt: "2026-10-02",
  actionResult: "Alternatif bulundu",
  residualLikelihood: 1,
  residualImpact: 2,
  createdBy: "u",
  createdByName: "Ayşe",
  createdAt: "2026-09-29T08:00:00Z",
  updatedAt: "2026-09-29T08:00:00Z",
};

test("risk export uses the supplied 24-column plan layout, formulas, dates and matrix", () => {
  const bytes = riskWorkbook(project, [risk]);
  const workbook = zipEntry(bytes, "xl/workbook.xml");
  const sheet = zipEntry(bytes, "xl/worksheets/sheet1.xml");
  const matrix = zipEntry(bytes, "xl/worksheets/sheet2.xml");
  const styles = zipEntry(bytes, "xl/styles.xml");
  assert.match(workbook, /sheet name="FT\.540\.001-1"/);
  assert.match(workbook, /sheet name="Etki-Olasılık Tablosu"/);
  assert.match(sheet, /<dimension ref="A1:Y25"\/>/);
  assert.match(sheet, /<mergeCell ref="B1:Y2"\/>/);
  assert.match(sheet, /BİLDİRİMİ YAPAN/);
  assert.match(sheet, /RİSK STRATEJİSİ/);
  assert.match(
    sheet,
    /<c r="F6" s="[0-9]+" t="inlineStr"><is><t xml:space="preserve">=SUM\(1,2\)<\/t><\/is><\/c>/,
  );
  assert.match(sheet, /A&amp;B/);
  assert.match(sheet, /<c r="D6" s="[0-9]+"><v>[0-9]+<\/v><\/c>/);
  assert.match(
    sheet,
    /<c r="Q6" s="[0-9]+" t="inlineStr"><is><t xml:space="preserve">X<\/t><\/is><\/c>/,
  );
  assert.match(sheet, /<c r="N6"[^>]*><f>IF\(OR\(L6=/);
  assert.match(sheet, /<c r="O6"[^>]*><f>IF\(N6=/);
  assert.match(sheet, /<c r="X6"[^>]*><f>IF\(OR\(V6=/);
  assert.match(sheet, /<c r="Y6"[^>]*><f>IF\(X6=/);
  assert.match(sheet, /<conditionalFormatting sqref="N6:O25">/);
  assert.match(sheet, /<dataValidations count="4">/);
  assert.match(styles, /<dxfs count="5">/);
  assert.match(matrix, /<dimension ref="A1:F9"\/>/);
  assert.match(matrix, /Çok Ciddi/);
  assert.match(matrix, /Tolere Edilemez/);
  assert.match(matrix, /Anlamsız/);
  assert.match(matrix, /<c r="F8" s="16" t="inlineStr">/);
});

test("risk export keeps 20 editable rows for an empty plan and rejects cross-project data", () => {
  const empty = zipEntry(riskWorkbook(project, []), "xl/worksheets/sheet1.xml");
  assert.match(empty, /<row r="25"/);
  assert.match(empty, /<c r="N25"[^>]*><f>/);
  assert.throws(
    () => riskWorkbook(project, [{ ...risk, projectId: "other" }]),
    /seçili projeye/,
  );
});

test("selected projects export as separate plan sheets with one shared risk matrix", () => {
  const second = { ...project, id: "p2", name: "Deneme & ARMA" };
  const bytes = riskWorkbooks(
    [project, second],
    [
      risk,
      { ...risk, id: "r2", projectId: "p2", description: "İkinci proje riski" },
    ],
  );
  const workbook = zipEntry(bytes, "xl/workbook.xml");
  assert.match(workbook, /sheet name="Deneme &amp; ARMA" sheetId="1"/);
  assert.match(workbook, /sheet name="Deneme &amp; ARMA \(2\)" sheetId="2"/);
  assert.match(workbook, /sheet name="Etki-Olasılık Tablosu" sheetId="3"/);
  assert.match(zipEntry(bytes, "xl/worksheets/sheet1.xml"), /=SUM\(1,2\)/);
  assert.doesNotMatch(
    zipEntry(bytes, "xl/worksheets/sheet1.xml"),
    /İkinci proje riski/,
  );
  assert.match(
    zipEntry(bytes, "xl/worksheets/sheet2.xml"),
    /İkinci proje riski/,
  );
  assert.match(zipEntry(bytes, "xl/worksheets/sheet3.xml"), /Tolere Edilemez/);
  assert.throws(
    () => riskWorkbooks([project], [{ ...risk, projectId: "p2" }]),
    /seçili projeye/,
  );
});
