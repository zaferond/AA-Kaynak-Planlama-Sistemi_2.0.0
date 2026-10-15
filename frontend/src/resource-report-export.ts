import {
  assertExcelRowCount,
  escapeXml,
  excelCellText,
  columnName as column,
} from "./xlsx-cells.ts";
import { createWorkbook, downloadWorkbook } from "./xlsx-workbook.ts";
import { SYSTEM_NAME } from "./settings.ts";

export type ResourceReportMonth = { remaining: number; status: string };
export type ResourceReportGroup = {
  name: string;
  manager: string;
  personnel: number;
  months: ResourceReportMonth[];
  depth?: number;
};

const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
function textCell(row: number, index: number, value: string, style: number) {
  return `<c r="${column(index)}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${excelCellText(value)}</t></is></c>`;
}
function numberCell(row: number, index: number, value: number, style: number) {
  const number = Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
  return `<c r="${column(index)}${row}" s="${style}"><v>${number}</v></c>`;
}
function blankCell(row: number, index: number, style: number) {
  return `<c r="${column(index)}${row}" s="${style}"/>`;
}
function xmlRow(index: number, height: number, cells: string[]) {
  assertExcelRowCount(index);
  return `<row r="${index}" ht="${height}" customHeight="1">${cells.join("")}</row>`;
}
function monthLabel(month: string) {
  return new Date(month + "-01T12:00:00").toLocaleDateString("tr-TR", {
    month: "short",
    year: "numeric",
  });
}

const STYLE = {
  title: 0,
  meta: 1,
  header: 2,
  name: 3,
  manager: 4,
  personnel: 5,
  remaining: 6,
  actualLabel: 7,
  actual: 8,
  warning: 9,
  critical: 10,
  actualExceeds: 11,
  year: 12,
  totalLabel: 18,
  totalNumber: 19,
  totalActual: 20,
  totalActualLabel: 21,
} as const;
const yearColors = ["DFEBF4", "E7F1EA", "F6EEDF", "EFEAF5", "E6F0F1", "F5EAF0"];
function stylesXml() {
  const font = (color: string, size: number, bold = false) =>
    `<font><sz val="${size}"/><color rgb="FF${color}"/><name val="Arial"/>${bold ? "<b/>" : ""}</font>`;
  const fonts = [
    font("273D52", 10),
    font("25475F", 16, true),
    font("61798B", 10),
    font("304E66", 10, true),
    font("285372", 10, true),
    font("92601D", 10, true),
    font("9C3542", 10, true),
    font("85304E", 10, true),
  ];
  const fill = (color: string) =>
    `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`;
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    ...[
      "FFFFFF",
      "DDE9EF",
      "F5F8FA",
      "E9F0F4",
      "DCEAF3",
      "FFF1DC",
      "FBE8EA",
      "F7E5EC",
      ...yearColors,
      "C8DEEC",
    ].map(fill),
  ];
  const border =
    '<border><left/><right/><top/><bottom style="hair"><color rgb="FFDDE5EB"/></bottom><diagonal/></border>';
  const actualBorder =
    '<border><left/><right/><top style="thin"><color rgb="FF9ABBD0"/></top><bottom style="hair"><color rgb="FFDDE5EB"/></bottom><diagonal/></border>';
  const style = (
    fontId: number,
    fillId: number,
    align: "left" | "center" = "left",
    format = 0,
    borderId = 1,
  ) =>
    `<xf numFmtId="${format}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyNumberFormat="${format ? 1 : 0}"><alignment horizontal="${align}" vertical="center" wrapText="1"/></xf>`;
  const styles = [
    style(1, 3),
    style(2, 4),
    style(3, 5, "center"),
    style(0, 2),
    style(0, 2),
    style(0, 2, "center", 1),
    style(0, 2, "center", 2),
    style(4, 6, "left", 0, 2),
    style(4, 6, "center", 2, 2),
    style(5, 7, "center", 2),
    style(6, 8, "center", 2),
    style(7, 9, "center", 2, 2),
    style(3, 10, "center"),
    ...yearColors.slice(1).map((_, i) => style(3, 11 + i, "center")),
    style(3, 5),
    style(3, 5, "center", 2),
    style(3, 16, "center", 2, 2),
    style(3, 16, "left", 0, 2),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${ns}"><fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="3">${border}${border}${actualBorder}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length}">${styles.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}
function reportSheet(
  title: string,
  unitLabel: string,
  groups: ResourceReportGroup[],
  months: string[],
  filterSummary: string,
) {
  const widths = [22, 34, 28, ...months.map(() => 13)],
    last = column(widths.length - 1),
    rows: string[] = [],
    merges = [`A1:${last}1`, `A2:${last}2`, `A3:${last}3`];
  // Child leaderships are subtotals already contained in their root row.
  const totalGroups = groups.filter((group) => !group.depth);
  const filledRow = (
    row: number,
    height: number,
    first: string,
    style: number,
  ) =>
    xmlRow(
      row,
      height,
      widths.map((_, i) =>
        i ? blankCell(row, i, style) : textCell(row, i, first, style),
      ),
    );
  const generated = new Date().toLocaleString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  rows.push(filledRow(1, 33, `AA Mühendislik | ${title}`, STYLE.title));
  rows.push(
    filledRow(
      2,
      29,
      `${SYSTEM_NAME}  •  ${groups.length} ${unitLabel.toLocaleLowerCase("tr-TR")}  •  ${monthLabel(months[0])} – ${monthLabel(months.at(-1)!)}  •  ${generated}${filterSummary ? "  •  " + filterSummary : ""}`,
      STYLE.meta,
    ),
  );
  rows.push(
    filledRow(
      3,
      34,
      "Birim: aylık kişi eşdeğeri  •  Personel: başlangıç ayındaki dahil çalışan kayıtları  •  Turuncu: %10’a kadar aşım  •  Kırmızı: %10 üzeri aşım",
      STYLE.meta,
    ),
  );
  const yearCells = [
    textCell(4, 0, "YIL", STYLE.year),
    blankCell(4, 1, STYLE.year),
    blankCell(4, 2, STYLE.year),
  ];
  merges.push("A4:C4");
  for (let i = 0, band = 0; i < months.length; band++) {
    const year = months[i].slice(0, 4),
      start = i,
      style = STYLE.year + (band % yearColors.length);
    while (i < months.length && months[i].startsWith(year)) i++;
    yearCells.push(textCell(4, start + 3, year, style));
    for (let j = start + 1; j < i; j++)
      yearCells.push(blankCell(4, j + 3, style));
    if (i - start > 1) merges.push(`${column(start + 3)}4:${column(i + 2)}4`);
  }
  rows.push(xmlRow(4, 23, yearCells));
  const header = [
    "Yönetici",
    unitLabel,
    "Birime Bağlı Toplam Personel Kaynağı",
    ...months.map(monthLabel),
  ];
  rows.push(
    xmlRow(
      5,
      34,
      header.map((value, i) => textCell(5, i, value, STYLE.header)),
    ),
  );
  for (const group of groups) {
    const r = rows.length + 1;
    rows.push(
      xmlRow(r, 29, [
        textCell(r, 0, group.manager || "—", STYLE.manager),
        textCell(
          r,
          1,
          group.depth
            ? "  ".repeat(Math.min(group.depth, 8)) + "↳ " + group.name
            : group.name,
          STYLE.name,
        ),
        numberCell(r, 2, group.personnel, STYLE.personnel),
        ...group.months.map((value, i) =>
          numberCell(
            r,
            i + 3,
            value.remaining,
            value.status === "over-critical"
              ? STYLE.critical
              : value.status === "over-warning"
                ? STYLE.warning
                : STYLE.remaining,
          ),
        ),
      ]),
    );
  }
  const totalRow = rows.length + 1;
  rows.push(
    xmlRow(totalRow, 32, [
      blankCell(totalRow, 0, STYLE.totalLabel),
      textCell(totalRow, 1, "TOPLAM KALAN KAYNAK", STYLE.totalLabel),
      numberCell(
        totalRow,
        2,
        totalGroups.reduce((total, group) => total + group.personnel, 0),
        STYLE.totalNumber,
      ),
      ...months.map((_, i) =>
        numberCell(
          totalRow,
          i + 3,
          totalGroups.reduce(
            (total, group) => total + group.months[i].remaining,
            0,
          ),
          STYLE.totalNumber,
        ),
      ),
    ]),
  );
  const freeze =
    '<pane xSplit="3" ySplit="5" topLeftCell="D6" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="D6" sqref="D6"/>';
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${last}${rows.length}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="90">${freeze}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.join("")}</sheetData><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="8" orientation="landscape" fitToWidth="${months.length <= 12 ? 1 : 0}" fitToHeight="0"/><headerFooter><oddFooter>&amp;LAA Mühendislik&amp;R Sayfa &amp;P / &amp;N</oddFooter></headerFooter></worksheet>`;
}

export function resourceReportWorkbook(
  months: string[],
  leaders: ResourceReportGroup[],
  teams: ResourceReportGroup[],
  filterSummary = "",
): Uint8Array {
  if (
    !months.length ||
    months.length > 60 ||
    months.some((m) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(m))
  )
    throw Error("1–60 aylık geçerli bir görünür dönem seçin.");
  if (!leaders.length && !teams.length)
    throw Error("Dışa aktarılacak liderlik veya takım bulunamadı.");
  for (const group of [...leaders, ...teams])
    if (group.months.length !== months.length)
      throw Error("Rapor ayları ile kaynak değerleri eşleşmiyor.");
  const sheets = [
    {
      name: "Liderlik Bazında",
      title: "Liderlik Bazında Eksik Raporu",
      unit: "Liderlik / Birim",
      groups: leaders,
    },
    {
      name: "Takım Bazında",
      title: "Takım Bazında Eksik Kaynak Raporu",
      unit: "Takım",
      groups: teams,
    },
  ];
  return createWorkbook({
    sheets: sheets.map((sheet) => ({
      name: sheet.name,
      xml: reportSheet(
        sheet.title,
        sheet.unit,
        sheet.groups,
        months,
        filterSummary,
      ),
      printTitleRows: 5,
    })),
    styles: stylesXml(),
    activeTab: 0,
    properties: { creator: "AA Mühendislik", title: "Kaynak Raporu" },
  });
}
export function downloadResourceReport(
  months: string[],
  leaders: ResourceReportGroup[],
  teams: ResourceReportGroup[],
  filterSummary = "",
) {
  const bytes = resourceReportWorkbook(months, leaders, teams, filterSummary);
  downloadWorkbook(
    bytes,
    `AA-Muhendislik-Kaynak-Raporu-${months[0]}-${months.at(-1)}.xlsx`,
  );
}
