import {
  excelCellText,
  excelTextLines,
  splitExcelText,
  EXCEL_MAX_ROWS,
  columnName as column,
} from "./xlsx-cells.ts";
import type { ReportProject } from "./project-info-report";
import { createWorkbook, downloadWorkbook } from "./xlsx-workbook.ts";

const sheetNamespace =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const dateLabel = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`
    : value;

function cell(row: number, index: number, value: string, style: number) {
  return `<c r="${column(index)}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${excelCellText(value)}</t></is></c>`;
}

export function projectInfoReportSheet(projects: ReportProject[]): string {
  const headers = [
    "Proje",
    "Başlık",
    "Detay Açıklamalar",
    "İlk Başlangıç",
    "Son Bitiş",
  ];
  const rows: string[] = [];
  rows.push(
    `<row r="1" ht="29" customHeight="1">${cell(1, 0, "AA Mühendislik | Kritik Proje Konuları", 1)}</row>`,
  );
  rows.push(
    `<row r="2" ht="22" customHeight="1">${cell(2, 0, `Rapora Ekle seçili açıklamalar · ${new Date().toLocaleDateString("tr-TR")}`, 2)}</row>`,
  );
  rows.push(
    `<row r="3" ht="24" customHeight="1">${headers.map((header, index) => cell(3, index, header, 3)).join("")}</row>`,
  );
  let rowNumber = 4;
  for (const project of projects) {
    for (const info of project.infos) {
      if (!info.topics.length) continue;
      const detail = info.topics
        .map(
          (topic) =>
            `• ${topic.completed ? "[Tamamlandı] " : ""}${topic.text} (${dateLabel(topic.start)} – ${dateLabel(topic.end)})`,
        )
        .join("\n");
      const starts = info.topics.map((topic) => topic.start).sort();
      const ends = info.topics.map((topic) => topic.end).sort();
      for (const continuation of splitExcelText(detail)) {
        if (rowNumber > EXCEL_MAX_ROWS)
          throw Error(
            "Excel satır sınırı aşıldı. Daha az proje seçerek tekrar aktarın.",
          );
        const values = [
          project.name,
          info.name,
          continuation,
          dateLabel(starts[0]),
          dateLabel(ends.at(-1)!),
        ];
        const height = Math.max(32, excelTextLines(continuation) * 15 + 12);
        rows.push(
          `<row r="${rowNumber}" ht="${height}" customHeight="1">${values.map((value, index) => cell(rowNumber, index, value, rowNumber % 2 ? 0 : 4)).join("")}</row>`,
        );
        rowNumber++;
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${sheetNamespace}"><dimension ref="A1:E${Math.max(3, rowNumber - 1)}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="30" customWidth="1"/><col min="3" max="3" width="70" customWidth="1"/><col min="4" max="5" width="18" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData><autoFilter ref="A3:E${Math.max(3, rowNumber - 1)}"/><mergeCells count="2"><mergeCell ref="A1:E1"/><mergeCell ref="A2:E2"/></mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}

const styles = `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${sheetNamespace}"><fonts count="3"><font><sz val="10"/><color rgb="FF243B53"/><name val="Arial"/></font><font><sz val="15"/><color rgb="FFFFFFFF"/><name val="Arial"/><b/></font><font><sz val="10"/><color rgb="FF173F66"/><name val="Arial"/><b/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173F66"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDFEAF3"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF5F8FC"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function projectInfoReportWorkbook(
  projects: ReportProject[],
): Uint8Array {
  if (
    !projects.some((project) =>
      project.infos.some((info) => info.topics.length),
    )
  )
    throw Error("Rapora eklenecek açıklama bulunamadı.");
  return createWorkbook({
    sheets: [
      { name: "Kritik Proje Konuları", xml: projectInfoReportSheet(projects) },
    ],
    styles,
  });
}

export function downloadProjectInfoReport(projects: ReportProject[]) {
  const bytes = projectInfoReportWorkbook(projects);
  downloadWorkbook(
    bytes,
    `AA-Kritik-Proje-Konulari-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
