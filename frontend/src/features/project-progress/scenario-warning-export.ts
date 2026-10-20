import type { Data } from "../../model.ts";
import type { ScenarioWarning } from "../../../../shared/scenario-warnings.ts";
import { WARNING_LIFECYCLE_LABELS } from "../../../../shared/scenario-warning-policy.ts";
import { columnName, excelCellText, EXCEL_MAX_ROWS } from "../../xlsx-cells.ts";
import { createWorkbook, downloadWorkbook } from "../../xlsx-workbook.ts";

export function scenarioWarningExportRows(
  data: Data,
  warnings: ScenarioWarning[],
) {
  const names = new Map(data.projects.map((p) => [p.id, p.name]));
  return [
    [
      "Proje",
      "Kod",
      "1. Uyarı",
      "2. Uyarı / Aksiyon",
      "Ay",
      "Durum",
      "Son açıklama",
      "İşlemi yapan",
      "İşlem tarihi",
    ],
    ...warnings.map((w) => {
      const last = w.history.at(-1)!;
      return [
        names.get(w.projectId) || w.projectId,
        w.code || "—",
        w.warning1,
        w.warning2,
        w.month,
        WARNING_LIFECYCLE_LABELS[w.status],
        last.explanation,
        last.byName,
        last.at,
      ];
    }),
  ];
}
export function scenarioWarningsCsv(data: Data, warnings: ScenarioWarning[]) {
  const cell = (value: string) =>
    '"' +
    (/^[\s]*[=+\-@\t\r]/.test(value) ? "'" : "") +
    value.replaceAll('"', '""') +
    '"';
  return (
    "\uFEFF" +
    scenarioWarningExportRows(data, warnings)
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}
export function scenarioWarningsWorkbook(
  data: Data,
  warnings: ScenarioWarning[],
) {
  const rows = scenarioWarningExportRows(data, warnings);
  if (rows.length > EXCEL_MAX_ROWS)
    throw Error("Excel satır sınırı aşıldı; filtreleri daraltın.");
  const xml = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="9" width="28" customWidth="1"/><col min="4" max="4" width="65" customWidth="1"/></cols><sheetData>${rows.map((row, i) => `<row r="${i + 1}">${row.map((value, j) => `<c r="${columnName(j)}${i + 1}" s="${i === 0 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${excelCellText(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData><autoFilter ref="A1:I${rows.length}"/></worksheet>`;
  const styles =
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf fontId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>';
  return createWorkbook({
    sheets: [{ name: "Senaryo Uyarıları", xml }],
    styles,
    properties: {
      title: "Senaryo Uyarıları",
      creator: "Kaynak Planlama Sistemi",
    },
  });
}
export function downloadScenarioWarnings(
  data: Data,
  warnings: ScenarioWarning[],
  format: "csv" | "xlsx",
) {
  if (format === "xlsx")
    return downloadWorkbook(
      scenarioWarningsWorkbook(data, warnings),
      "Senaryo-Uyarilari.xlsx",
    );
  const url = URL.createObjectURL(
    new Blob([scenarioWarningsCsv(data, warnings)], {
      type: "text/csv;charset=utf-8",
    }),
  );
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = "Senaryo-Uyarilari.csv";
    a.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
