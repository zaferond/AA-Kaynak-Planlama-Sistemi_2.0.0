import {
  assertExcelRowCount,
  escapeXml as xml,
  excelCellText,
  columnName as col,
} from "./xlsx-cells.ts";
import type { Project } from "./model.ts";
import { phaseColor } from "./model.ts";
import { phaseChipPalette as phasePalette } from "./phase-chip.ts";
import { SYSTEM_NAME } from "./settings.ts";
import {
  periodOverlapsProject,
  phaseInitial,
  phaseMonthForPeriod,
  projectTimelinePeriods,
} from "./timeline-periods.ts";
import { createWorkbook, downloadWorkbook } from "./xlsx-workbook.ts";

// The browser creates a self-contained XLSX. Project text is always an inline
// string, so names and phase descriptions cannot become spreadsheet formulas.
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

export type ProjectReportView = "detail" | "compact" | "overview";

const S = {
  title: 0,
  meta: 1,
  header: 2,
  year: 3,
  name: 4,
  nameAlt: 5,
  empty: 6,
  outside: 7,
  phase: 8,
  phaseCompact: 14,
  phaseOverview: 20,
} as const;
function textCell(r: number, c: number, value: string, style: number) {
  return `<c r="${col(c)}${r}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${excelCellText(value)}</t></is></c>`;
}
function blankCell(r: number, c: number, style: number) {
  return `<c r="${col(c)}${r}" s="${style}"/>`;
}
function row(r: number, height: number, cells: string[]) {
  assertExcelRowCount(r);
  return `<row r="${r}" ht="${height}" customHeight="1">${cells.join("")}</row>`;
}
function styledRow(
  r: number,
  count: number,
  style: number,
  firstText: string,
  height: number,
) {
  return row(
    r,
    height,
    Array.from({ length: count }, (_, c) =>
      c === 0 ? textCell(r, c, firstText, style) : blankCell(r, c, style),
    ),
  );
}
function monthLabel(m: string) {
  return new Date(m + "-01T12:00:00").toLocaleDateString("tr-TR", {
    month: "short",
    year: "numeric",
  });
}
function wrappedLines(value: string, width: number) {
  const limit = Math.max(9, Math.floor(width - 3));
  return value
    .split(/\r?\n/)
    .reduce(
      (total, line) => total + Math.max(1, Math.ceil(line.length / limit)),
      0,
    );
}
function phaseStyleIndex(p: Project, m: string, view: ProjectReportView) {
  const color = Math.max(
    0,
    phasePalette.findIndex((item) => item.id === phaseColor(p, m).id),
  );
  return (
    (view === "detail"
      ? S.phase
      : view === "compact"
        ? S.phaseCompact
        : S.phaseOverview) + color
  );
}

function stylesXml() {
  const font = (color: string, size: number, bold = false) =>
    `<font><sz val="${size}"/><color rgb="FF${color}"/><name val="Arial"/>${bold ? "<b/>" : ""}</font>`;
  const fonts = [
    font("1D354D", 10),
    font("28445E", 15, true),
    font("657B90", 10),
    font("36546E", 10, true),
    font("173F66", 10, true),
    ...phasePalette.map((p) => font(p.ink.slice(1).toUpperCase(), 10)),
    ...phasePalette.map((p) => font(p.ink.slice(1).toUpperCase(), 11, true)),
  ];
  const fill = (color: string) =>
    `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`;
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    ...[
      "FFFFFF",
      "F5F8FB",
      "DFEAF3",
      "FFFFFF",
      "FFFFFF",
      "FFFFFF",
      ...phasePalette.map((p) => p.bg.slice(1).toUpperCase()),
    ].map(fill),
  ];
  const border =
    '<border><left/><right/><top/><bottom style="hair"><color rgb="FFDDE6EF"/></bottom><diagonal/></border>';
  const xf = (
    fontId: number,
    fillId: number,
    alignment: "left" | "center" = "left",
    wrap = true,
  ) =>
    `<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${alignment}" vertical="center" wrapText="${wrap ? 1 : 0}"/></xf>`;
  const styles = [
    xf(1, 4),
    xf(2, 3),
    xf(3, 4, "center"),
    xf(4, 3, "center"),
    xf(4, 2),
    xf(4, 5),
    xf(2, 7, "center"),
    xf(2, 6, "center"),
    ...phasePalette.map((_, i) => xf(5 + i, 8 + i)),
    ...phasePalette.map((_, i) => xf(5 + i, 8 + i, "center", false)),
    ...phasePalette.map((_, i) =>
      xf(5 + phasePalette.length + i, 8 + i, "center", false),
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${ns}"><fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="2">${border}${border}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length}">${styles.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function projectSheet(
  projects: Project[],
  months: string[],
  view: ProjectReportView,
  weekly: boolean,
  showCodes: boolean,
) {
  const labelColumns = showCodes ? 2 : 1;
  const columns = projectTimelinePeriods(months, weekly);
  const columnWidth = weekly
    ? view === "overview"
      ? 13
      : view === "compact"
        ? 20
        : 27
    : view === "overview"
      ? 11
      : view === "compact"
        ? 18
        : 29;
  const widths = [
      43,
      ...(showCodes ? [20] : []),
      ...columns.map(() => columnWidth),
    ],
    last = col(widths.length - 1),
    rows: string[] = [],
    merges = [`A1:${last}1`, `A2:${last}2`, `A3:${last}3`];
  const viewName = {
    detail: "Ayrıntılı",
    compact: "Kompakt",
    overview: "5 yıllık genel bakış",
  }[view];
  const generated = new Date().toLocaleString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  rows.push(
    styledRow(
      1,
      widths.length,
      S.title,
      "AA Mühendislik | Projeler Raporu",
      31,
    ),
  );
  rows.push(
    styledRow(
      2,
      widths.length,
      S.meta,
      `${SYSTEM_NAME}  •  ${projects.length} proje  •  ${monthLabel(months[0])} – ${monthLabel(months.at(-1)!)}  •  Görünüm: ${viewName} / ${weekly ? "Haftalık" : "Aylık"}  •  ${generated}`,
      23,
    ),
  );
  rows.push(
    styledRow(
      3,
      widths.length,
      S.meta,
      weekly
        ? "Haftalık sütunlarda ilgili ayın aşaması gösterilir."
        : view === "overview"
          ? "Kalın ilk harf: kayıtlı aşama  ·  boş ay  — proje dönemi dışı"
          : view === "compact"
            ? "Aşama metninin tamamı hücre seçildiğinde formül çubuğunda okunabilir.  — boş ay veya proje dönemi dışı"
            : "Aşama renkleri proje planından alınmıştır.  — boş ay veya proje dönemi dışı",
      22,
    ),
  );
  const yearCells = [textCell(4, 0, "YIL", S.year)];
  if (showCodes) {
    yearCells.push(blankCell(4, 1, S.year));
    merges.push("A4:B4");
  }
  for (let i = 0; i < columns.length;) {
    const year = columns[i].year,
      start = i;
    while (i < columns.length && columns[i].year === year) i++;
    yearCells.push(textCell(4, start + labelColumns, year, S.year));
    for (let j = start + 1; j < i; j++)
      yearCells.push(blankCell(4, j + labelColumns, S.year));
    if (i - start > 1)
      merges.push(
        `${col(start + labelColumns)}4:${col(i + labelColumns - 1)}4`,
      );
  }
  rows.push(row(4, 22, yearCells));
  rows.push(
    row(
      5,
      29,
      [
        "Proje",
        ...(showCodes ? ["Proje Kodu"] : []),
        ...columns.map((period) =>
          period.kind === "week"
            ? `W${period.weekNumber} ${period.label}`
            : monthLabel(period.month),
        ),
      ].map((label, i) => textCell(5, i, label, S.header)),
    ),
  );
  projects.forEach((p, i) => {
    const r = i + 6,
      alt = i % 2 === 1,
      values = columns.map((period) => {
        if (!periodOverlapsProject(period, p)) return "—";
        const phase = p.phases[phaseMonthForPeriod(period, p)]?.trim();
        return view === "overview"
          ? phase
            ? phaseInitial(phase)
            : "·"
          : phase || "—";
      });
    const height =
      view === "detail"
        ? Math.min(
            150,
            Math.max(
              39,
              wrappedLines(p.name, widths[0]) * 15 + 10,
              showCodes ? wrappedLines(p.code || "—", widths[1]) * 14 + 10 : 0,
              ...values.map(
                (v, j) => wrappedLines(v, widths[j + labelColumns]) * 14 + 10,
              ),
            ),
          )
        : Math.min(
            85,
            Math.max(
              view === "overview" ? 30 : 36,
              wrappedLines(p.name, widths[0]) * 14 + 9,
              showCodes ? wrappedLines(p.code || "—", widths[1]) * 14 + 9 : 0,
            ),
          );
    rows.push(
      row(r, height, [
        textCell(r, 0, p.name, alt ? S.nameAlt : S.name),
        ...(showCodes
          ? [textCell(r, 1, p.code || "—", alt ? S.nameAlt : S.name)]
          : []),
        ...columns.map((period, j) => {
          const month = phaseMonthForPeriod(period, p);
          return textCell(
            r,
            j + labelColumns,
            values[j],
            !periodOverlapsProject(period, p)
              ? S.outside
              : p.phases[month]?.trim()
                ? phaseStyleIndex(p, month, view)
                : S.empty,
          );
        }),
      ]),
    );
  });
  const freeze = `<pane xSplit="${labelColumns}" ySplit="5" topLeftCell="${col(labelColumns)}6" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="${col(labelColumns)}6" sqref="${col(labelColumns)}6"/>`;
  const footer = xml("&LAA Mühendislik&R Sayfa &P / &N");
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${last}${rows.length}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="90">${freeze}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="19"/><cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.join("")}</sheetData><autoFilter ref="A5:${last}${rows.length}"/><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="8" orientation="landscape" fitToWidth="${columns.length <= 12 ? 1 : 0}" fitToHeight="0"/><headerFooter><oddFooter>${footer}</oddFooter></headerFooter></worksheet>`;
  return sheet;
}

export function projectWorkbook(
  projects: Project[],
  months: string[],
  view: ProjectReportView = "detail",
  weekly = false,
  showCodes = false,
): Uint8Array {
  if (
    !months.length ||
    months.length > 60 ||
    months.some((m) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(m))
  )
    throw Error("1–60 aylık geçerli bir görünür dönem seçin.");
  if (!projects.length) throw Error("Dışa aktarılacak proje bulunamadı.");
  const sheetName = "Projeler";
  return createWorkbook({
    sheets: [
      {
        name: sheetName,
        xml: projectSheet(projects, months, view, weekly, showCodes),
        printTitleRows: 5,
      },
    ],
    styles: stylesXml(),
    activeTab: 0,
    properties: { creator: "AA Mühendislik", title: "Projeler Raporu" },
  });
}
export function downloadProjects(
  projects: Project[],
  months: string[],
  view: ProjectReportView = "detail",
  weekly = false,
  showCodes = false,
) {
  const bytes = projectWorkbook(projects, months, view, weekly, showCodes);
  downloadWorkbook(
    bytes,
    "AA-Muhendislik-Projeler-Raporu-" +
      (weekly ? "Haftalik-" : "") +
      months[0] +
      "-" +
      months.at(-1) +
      ".xlsx",
  );
}
