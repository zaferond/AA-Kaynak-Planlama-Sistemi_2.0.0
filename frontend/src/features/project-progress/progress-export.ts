import {
  EXCEL_MAX_ROWS,
  columnName as column,
  excelCellText,
} from "../../xlsx-cells.ts";
import { createWorkbook, downloadWorkbook } from "../../xlsx-workbook.ts";
import type { ProjectRow } from "./progress-view";

type ExportRow = ProjectRow & {
  assessmentText?: string;
  reasonText?: string;
  leaders: (ProjectRow["leaders"][number] & {
    assessmentText?: string;
    reasonText?: string;
  })[];
};

const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const LEVELS = { red: "Kırmızı", amber: "Sarı", green: "Yeşil" } as const;
const HEADERS = [
  "Proje",
  "Liderlik",
  "Hedef %",
  "Gerçekleşen %",
  "Harcanan %",
  "Perf.",
  "Risk",
  "Neden",
  "Açıklama",
];

const text = (row: number, index: number, value: string, style: number) =>
  `<c r="${column(index)}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${excelCellText(value)}</t></is></c>`;
// Numbers stay numbers so the sheet can be sorted and summed.
const number = (
  row: number,
  index: number,
  value: number | null,
  style: number,
) =>
  value === null
    ? text(row, index, "—", style)
    : `<c r="${column(index)}${row}" s="${style}"><v>${value}</v></c>`;

/** One sheet: project rows, each followed by its leadership rows. */
export function progressReportSheet(rows: ExportRow[], monthLabel: string) {
  const out: string[] = [
    `<row r="1" ht="29" customHeight="1">${text(1, 0, "AA Mühendislik | Proje İlerlemesi", 1)}</row>`,
    `<row r="2" ht="22" customHeight="1">${text(2, 0, `${monthLabel} sonu itibarıyla, kümülatif % · ${new Date().toLocaleDateString("tr-TR")}`, 2)}</row>`,
    `<row r="3" ht="24" customHeight="1">${HEADERS.map((h, i) => text(3, i, h, 3)).join("")}</row>`,
  ];
  let r = 4;
  const add = (cells: (n: number) => string, height = 20) => {
    if (r > EXCEL_MAX_ROWS) throw Error("Excel satır sınırı aşıldı.");
    out.push(`<row r="${r}" ht="${height}" customHeight="1">${cells(r)}</row>`);
    r++;
  };
  for (const row of rows) {
    const rated = row.target !== null;
    const reasons = [
      ...new Set([
        ...row.signals.map((s) => s.reason),
        ...row.leaders.flatMap((l) => l.signals.map((s) => s.reason)),
      ]),
    ].join(" · ");
    add((n) =>
      [
        text(n, 0, row.project.name, 4),
        text(n, 1, "Proje geneli", 4),
        number(n, 2, row.target, 5),
        number(n, 3, row.actual, 5),
        number(n, 4, row.spent, 5),
        number(n, 5, row.performance, 6),
        text(
          n,
          6,
          row.assessmentText ??
            (rated ? LEVELS[row.level] : "Hedef planı onayı bekleniyor"),
          4,
        ),
        text(n, 7, row.reasonText ?? reasons, 4),
        text(n, 8, "", 4),
      ].join(""),
    );
    for (const l of row.leaders)
      add((n) =>
        [
          text(n, 0, row.project.name, 0),
          text(n, 1, l.record.leader, 0),
          number(n, 2, l.target, 7),
          number(n, 3, l.actual, 7),
          number(n, 4, l.spent, 7),
          number(n, 5, l.performance, 8),
          text(
            n,
            6,
            l.assessmentText ??
              (l.target === null ? "Onaylı hedef planı yok" : LEVELS[l.level]),
            0,
          ),
          text(
            n,
            7,
            l.reasonText ?? l.signals.map((s) => s.reason).join(" · "),
            0,
          ),
          text(n, 8, l.note, 0),
        ].join(""),
      );
  }
  const last = Math.max(3, r - 1);
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><dimension ref="A1:I${last}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="2" width="34" customWidth="1"/><col min="3" max="6" width="14" customWidth="1"/><col min="7" max="7" width="22" customWidth="1"/><col min="8" max="8" width="44" customWidth="1"/><col min="9" max="9" width="50" customWidth="1"/></cols><sheetData>${out.join("")}</sheetData><autoFilter ref="A3:I${last}"/><mergeCells count="2"><mergeCell ref="A1:I1"/><mergeCell ref="A2:I2"/></mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

// 0 text · 1 title · 2 subtitle · 3 header · 4 project text · 5 project
// number · 6 project ratio · 7 number · 8 ratio.
const styles = `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${ns}"><numFmts count="2"><numFmt numFmtId="164" formatCode="0.0"/><numFmt numFmtId="165" formatCode="0.00"/></numFmts><fonts count="4"><font><sz val="10"/><color rgb="FF293A2D"/><name val="Arial"/></font><font><sz val="15"/><color rgb="FFFFFFFF"/><name val="Arial"/><b/></font><font><sz val="10"/><color rgb="FF405440"/><name val="Arial"/><b/></font><font><sz val="10"/><color rgb="FF293A2D"/><name val="Arial"/><b/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF405440"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6ECE0"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F6F1"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="3" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/><xf numFmtId="165" fontId="3" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function progressReportWorkbook(
  rows: ExportRow[],
  monthLabel: string,
  extraSheets: { name: string; xml: string }[] = [],
) {
  if (!rows.length) throw Error("Aktarılacak ilerleme kaydı yok.");
  return createWorkbook({
    sheets: [
      { name: "Proje İlerlemesi", xml: progressReportSheet(rows, monthLabel) },
      ...extraSheets,
    ],
    styles,
  });
}

export function downloadProgressReport(
  rows: ExportRow[],
  month: string,
  monthLabel: string,
  extraSheets: { name: string; xml: string }[] = [],
) {
  downloadWorkbook(
    progressReportWorkbook(rows, monthLabel, extraSheets),
    `AA-Proje-Ilerlemesi-${month}.xlsx`,
  );
}
