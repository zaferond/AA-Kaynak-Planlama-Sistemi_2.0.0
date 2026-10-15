import {
  assertExcelRowCount,
  columnName,
  excelCellText,
  spreadsheetNamespace,
} from "./xlsx-cells.ts";
import { createWorkbook, downloadWorkbook } from "./xlsx-workbook.ts";
import { SYSTEM_NAME } from "./settings.ts";
import {
  HEADCOUNT_COLUMNS,
  HEADCOUNT_REPORTS,
  HEADCOUNT_TOTAL_HEADER_COLOR,
  HEADCOUNT_TOTAL_CELL_COLOR,
  headcountColumnTotal,
  headcountWithPostings,
  type HeadcountReportData,
} from "./features/resource-reports/headcount-report-data.ts";

const styles = `<styleSheet xmlns="${spreadsheetNamespace}">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/><color rgb="FF34452F"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF34452F"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts>
<fills count="${6 + HEADCOUNT_COLUMNS.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDF2E8"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF405341"/></patternFill></fill>${[...HEADCOUNT_COLUMNS.map((column) => column.headerColor), HEADCOUNT_TOTAL_HEADER_COLOR, HEADCOUNT_TOTAL_CELL_COLOR].map((color) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${color.slice(1).toUpperCase()}"/></patternFill></fill>`).join("")}</fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFD7E0D0"/></left><right style="thin"><color rgb="FFD7E0D0"/></right><top style="thin"><color rgb="FFD7E0D0"/></top><bottom style="thin"><color rgb="FFD7E0D0"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${9 + HEADCOUNT_COLUMNS.length}">${[
  [0, 0, 1, "center"],
  [1, 0, 0, "left"],
  [2, 3, 1, "center"],
  [1, 2, 1, "left"],
  [0, 0, 1, "left"],
  [1, 2, 1, "center"],
  [0, 0, 0, "left"],
  ...HEADCOUNT_COLUMNS.map((_, index) => [2, index + 4, 1, "center"]),
  [2, HEADCOUNT_COLUMNS.length + 4, 1, "center"],
  [1, HEADCOUNT_COLUMNS.length + 5, 1, "center"],
]
  .map(
    ([font, fill, border, align]) =>
      `<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyAlignment="1"><alignment horizontal="${align}" vertical="center" wrapText="1"/></xf>`,
  )
  .join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
const totalCellStyle = 8 + HEADCOUNT_COLUMNS.length;

export function buildHeadcountWorkbook(
  report: HeadcountReportData,
  filterLabel: string,
): Uint8Array {
  const sheets = HEADCOUNT_REPORTS.map((definition) => {
    const columns = definition.keys.map((key) =>
      HEADCOUNT_COLUMNS.find((column) => column.key === key)!,
    );
    const lastColumn = columnName(
      columns.length + (definition.showTotal ? 1 : 0),
    );
    const merges = [`A1:${lastColumn}1`, `A2:${lastColumn}2`];
    let index = 0;
    const text = (row: number, col: number, value: string, style: number) =>
      `<c r="${columnName(col - 1)}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${excelCellText(value)}</t></is></c>`;
    const number = (row: number, col: number, value: number, style: number) =>
      `<c r="${columnName(col - 1)}${row}" s="${style}"><v>${value}</v></c>`;
    const rows: string[] = [];
    function row(cells: (index: number) => string[], height = 30, depth = 0) {
      index++;
      assertExcelRowCount(index);
      rows.push(
        `<row r="${index}" ht="${height}" customHeight="1"${depth ? ` outlineLevel="${Math.min(depth, 7)}"` : ""}>${cells(index).join("")}</row>`,
      );
    }
    row((i) => [text(i, 1, definition.title, 1)], 34);
    row(
      (i) => [
        text(
          i,
          1,
          `${report.date} itibarıyla · Kişi / adet · ${filterLabel}`,
          6,
        ),
      ],
      42,
    );
    row(
      (i) => [
        text(i, 1, "Liderlik / Birim", 2),
        ...columns.map((column, index) =>
          text(
            i,
            index + 2,
            column.label,
            7 + HEADCOUNT_COLUMNS.findIndex((item) => item.key === column.key),
          ),
        ),
        ...(definition.showTotal
          ? [
              text(
                i,
                columns.length + 2,
                "Toplam",
                7 + HEADCOUNT_COLUMNS.length,
              ),
            ]
          : []),
      ],
      34,
    );
    // Freeze the title, context and column headings.
    for (const item of report.rows)
      row(
        (i) => [
          text(
            i,
            1,
            (item.depth ? "  ".repeat(Math.min(item.depth, 8)) + "↳ " : "") +
              item.name,
            item.depth ? 4 : 3,
          ),
          ...columns.map((column, col) =>
            number(i, col + 2, item.counts[column.key], item.depth ? 0 : 5),
          ),
          ...(definition.showTotal
            ? [
                number(
                  i,
                  columns.length + 2,
                  headcountColumnTotal(item.counts, definition.keys),
                  totalCellStyle,
                ),
              ]
            : []),
        ],
        Math.max(30, Math.ceil(item.name.length / 48) * 16 + 8),
        item.depth,
      );
    row((i) => [
      text(i, 1, "Toplam Head Count", 3),
      ...columns.map((column, col) =>
        number(i, col + 2, report.totals[column.key], 5),
      ),
      ...(definition.showTotal
        ? [
            number(
              i,
              columns.length + 2,
              headcountColumnTotal(report.totals, definition.keys),
              totalCellStyle,
            ),
          ]
        : []),
    ]);
    if (definition.showWithPostings) {
      row((i) => [
        text(i, 1, "Aktif İlan Dahil Head Count", 3),
        number(
          i,
          columns.length + (definition.showTotal ? 2 : 1),
          headcountWithPostings(report.totals),
          totalCellStyle,
        ),
      ]);
      merges.push(
        `A${index}:${columnName(columns.length + (definition.showTotal ? 0 : -1))}${index}`,
      );
    }
    return {
      name: definition.sheetName,
      printTitleRows: 3,
      xml: `<worksheet xmlns="${spreadsheetNamespace}"><dimension ref="A1:${lastColumn}${index}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="55" customWidth="1"/><col min="2" max="${columns.length + (definition.showTotal ? 2 : 1)}" width="23" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9"/></worksheet>`,
    };
  });
  return createWorkbook({
    sheets,
    styles,
    properties: { title: "Head Count Raporları", creator: SYSTEM_NAME },
  });
}
export function downloadHeadcountReport(
  report: HeadcountReportData,
  filterLabel: string,
) {
  downloadWorkbook(
    buildHeadcountWorkbook(report, filterLabel),
    `AA-Head-Count-${report.date}.xlsx`,
  );
}
