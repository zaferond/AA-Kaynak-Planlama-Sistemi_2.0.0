import {
  assertExcelRowCount,
  escapeXml,
  excelCellText,
  columnName as column,
} from "./xlsx-cells.ts";
import type { Data, Project, Resource, Team } from "./model.ts";
import { visibleActualVersion } from "./model.ts";
import { visibleActualInScope } from "../../shared/actual-visibility.ts";
import {
  actualInputToFte,
  personCalendarHoursInMonth,
  effectivePersonHoursInMonth,
  DEFAULT_MONTHLY_HOURS,
} from "./actual-units.ts";
import { createWorkbook, downloadWorkbook } from "./xlsx-workbook.ts";
import type { ActualMonthSummary } from "../../shared/actual-months.ts";
import { ownValue } from "../../shared/records.ts";
import { SYSTEM_NAME } from "./settings.ts";

const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const yearColors = ["DFEBF4", "E7F1EA", "F6EEDF", "EFEAF5", "E6F0F1", "F5EAF0"];
type Cell = string | number | null;
type AllocationSheet = {
  name: string;
  title: string;
  unit: string;
  headers: string[];
  months: string[];
  rows: Cell[][];
  percentage: boolean;
};

function textCell(row: number, index: number, value: string, style: number) {
  return `<c r="${column(index)}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${excelCellText(value)}</t></is></c>`;
}
function numberCell(row: number, index: number, value: number, style: number) {
  if (!Number.isFinite(value))
    throw Error("Excel çıktısında geçersiz sayısal değer var.");
  return `<c r="${column(index)}${row}" s="${style}"><v>${Number(value.toFixed(8))}</v></c>`;
}
function blankCell(row: number, index: number, style: number) {
  return `<c r="${column(index)}${row}" s="${style}"/>`;
}
function row(index: number, height: number, cells: string[]) {
  assertExcelRowCount(index);
  return `<row r="${index}" ht="${height}" customHeight="1">${cells.join("")}</row>`;
}
function monthLabel(month: string) {
  return new Date(month + "-01T12:00:00").toLocaleDateString("tr-TR", {
    month: "short",
    year: "numeric",
  });
}
function validateMonths(months: string[]) {
  if (
    !months.length ||
    months.length > 60 ||
    months.some((month) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
  )
    throw Error("1–60 aylık geçerli bir dönem seçin.");
}

function stylesXml() {
  const font = (color: string, size: number, bold = false) =>
    `<font><sz val="${size}"/><color rgb="FF${color}"/><name val="Arial"/>${bold ? "<b/>" : ""}</font>`;
  const fonts = [
    font("273D52", 10),
    font("25475F", 15, true),
    font("61798B", 10),
    font("304E66", 10, true),
  ];
  const fill = (color: string) =>
    `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`;
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    ...["FFFFFF", "DFEAF3", "F5F8FB", "E7EFF5", "F7FAFC", ...yearColors].map(
      fill,
    ),
  ];
  const border =
    '<border><left/><right/><top/><bottom style="hair"><color rgb="FFDDE5EB"/></bottom><diagonal/></border>';
  const style = (
    fontId: number,
    fillId: number,
    format = 0,
    align: "left" | "center" = "left",
  ) =>
    `<xf numFmtId="${format}" fontId="${fontId}" fillId="${fillId}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyNumberFormat="${format ? 1 : 0}"><alignment horizontal="${align}" vertical="center" wrapText="1"/></xf>`;
  const styles = [
    style(1, 3),
    style(2, 4),
    style(3, 5),
    style(0, 2),
    style(0, 6),
    style(0, 2, 2, "center"),
    style(0, 6, 2, "center"),
    style(0, 2, 10, "center"),
    style(0, 6, 10, "center"),
    style(0, 2),
    ...yearColors.map((_, index) => style(3, 7 + index, 0, "center")),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${namespace}"><fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="2">${border}${border}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length}">${styles.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function sheetXml(sheet: AllocationSheet) {
  const labels = sheet.headers.length,
    widths = [
      ...sheet.headers.map((_, index) =>
        index === 0 ? 24 : index === labels - 1 ? 30 : 25,
      ),
      ...sheet.months.map(() => 14),
    ];
  const last = column(widths.length - 1),
    rows: string[] = [],
    merges = [`A1:${last}1`, `A2:${last}2`, `A3:${column(labels - 1)}3`];
  const full = (index: number, height: number, text: string, style: number) =>
    row(
      index,
      height,
      widths.map((_, i) =>
        i ? blankCell(index, i, style) : textCell(index, i, text, style),
      ),
    );
  rows.push(full(1, 31, sheet.title, 0));
  rows.push(
    full(
      2,
      27,
      `${SYSTEM_NAME}  •  ${sheet.unit}  •  ${sheet.rows.length} kayıt  •  ${monthLabel(sheet.months[0])} – ${monthLabel(sheet.months.at(-1)!)}  •  ${new Date().toLocaleString("tr-TR")}`,
      1,
    ),
  );
  const years = [
    ...sheet.headers.map((_, i) =>
      i ? blankCell(3, i, 10) : textCell(3, i, "YIL", 10),
    ),
  ];
  for (let i = 0, band = 0; i < sheet.months.length; band++) {
    const year = sheet.months[i].slice(0, 4),
      start = i,
      style = 11 + (band % yearColors.length);
    while (i < sheet.months.length && sheet.months[i].startsWith(year)) i++;
    years.push(textCell(3, labels + start, year, style));
    for (let j = start + 1; j < i; j++)
      years.push(blankCell(3, labels + j, style));
    if (i - start > 1)
      merges.push(`${column(labels + start)}3:${column(labels + i - 1)}3`);
  }
  rows.push(row(3, 23, years));
  rows.push(
    row(
      4,
      31,
      [...sheet.headers, ...sheet.months.map(monthLabel)].map((label, i) =>
        textCell(4, i, label, 2),
      ),
    ),
  );
  sheet.rows.forEach((values, index) => {
    const number = index + 5,
      alternate = index % 2 === 1;
    rows.push(
      row(
        number,
        27,
        values.map((value, i) =>
          value === null
            ? blankCell(number, i, 9)
            : typeof value === "number"
              ? numberCell(
                  number,
                  i,
                  value,
                  sheet.percentage ? (alternate ? 8 : 7) : alternate ? 6 : 5,
                )
              : textCell(number, i, value, alternate ? 4 : 3),
        ),
      ),
    );
  });
  const freeze = `<pane xSplit="${labels}" ySplit="4" topLeftCell="${column(labels)}5" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="${column(labels)}5" sqref="${column(labels)}5"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${namespace}"><dimension ref="A1:${last}${rows.length}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="90">${freeze}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.join("")}</sheetData><autoFilter ref="A4:${last}${Math.max(4, rows.length)}"/><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="8" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

function workbook(sheet: AllocationSheet) {
  validateMonths(sheet.months);
  if (!sheet.rows.length) throw Error("Dışa aktarılacak kayıt bulunamadı.");
  return createWorkbook({
    sheets: [{ name: sheet.name, xml: sheetXml(sheet) }],
    styles: stylesXml(),
  });
}

export function plannedAllocationWorkbook(
  data: Data,
  teams: Team[],
  projects: Project[],
  months: string[],
): Uint8Array {
  assertExcelRowCount(4 + teams.length * projects.length);
  return workbook({
    name: "Planlanan Dağılım",
    title: "AA Mühendislik | Planlanan Kaynak Dağılımı",
    unit: "Aylık kişi eşdeğeri",
    headers: ["Liderlik", "Takım", "Proje"],
    months,
    percentage: false,
    rows: teams.flatMap((team) =>
      projects.map((project) => [
        team.lead,
        team.name,
        project.name,
        ...months.map((month) =>
          month < project.start || month > project.end
            ? null
            : data.allocations[team.id + "|" + project.id + "|" + month] || 0,
        ),
      ]),
    ),
  });
}

export function actualAllocationWorkbook(
  data: Data,
  teams: Team[],
  projects: Project[],
  months: string[],
  currentMonth: string,
  selectedPersonIds: string[],
  ownResourceId?: string,
  monthSummaries?: Record<string, ActualMonthSummary>,
): Uint8Array {
  const allowedTeams = new Set(teams.map((team) => team.id)),
    selected = new Set(selectedPersonIds),
    teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const visible = (resource: Resource, month: string) =>
    !!visibleActualInScope(
      resource,
      month,
      currentMonth,
      allowedTeams,
      ownResourceId,
    );
  const people = data.resources
    .filter(
      (resource) =>
        (!selected.size || selected.has(resource.id)) &&
        months.some((month) => visible(resource, month)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const contextFor = (resource: Resource): string[] => {
    const teamIds = [
      ...new Set(
        months
          .filter((month) => visible(resource, month))
          .map(
            (month) =>
              visibleActualVersion(resource, month, currentMonth)!.team,
          ),
      ),
    ];
    const leads = [
      ...new Set(
        teamIds
          .map((id) => teams.find((team) => team.id === id)?.lead || "")
          .filter(Boolean),
      ),
    ];
    return [
      leads.join(", "),
      teamIds.map((id) => teamNames.get(id) || id).join(", "),
    ];
  };
  const calendarFor = (resource: Resource, month: string) =>
    ownValue(monthSummaries, resource.id + "|" + month) ||
    personCalendarHoursInMonth(
      month,
      resource.id,
      data.workCalendar,
      data.personCalendar,
    );
  const capacityFor = (resource: Resource, month: string) => {
    const summary = ownValue(monthSummaries, resource.id + "|" + month);
    if (summary) return summary.capacityFte;
    const manual = data.actualWorkedHours?.[resource.id + "|" + month];
    const hours = effectivePersonHoursInMonth(
      month,
      resource.id,
      manual,
      data.workCalendar,
      data.personCalendar,
    );
    return actualInputToFte(100, "percent", month, hours);
  };
  const rowFor = (project: Project, resource: Resource): Cell[] => {
    return [
      ...contextFor(resource),
      project.name,
      resource.name,
      ...months.map((month) => {
        if (
          !visible(resource, month) ||
          month < project.start ||
          month > project.end
        )
          return null;
        const capacity = capacityFor(resource, month);
        const amount =
          data.actualAllocations?.[
            resource.id + "|" + project.id + "|" + month
          ] || 0;
        return capacity > 0 ? amount / capacity : 0;
      }),
    ];
  };
  const trainingRows: Cell[][] = people
    .filter((resource) =>
      months.some(
        (month) =>
          visible(resource, month) &&
          calendarFor(resource, month).trainingHours > 0,
      ),
    )
    .map((resource) => [
      ...contextFor(resource),
      "Eğitim",
      resource.name,
      ...months.map((month) => {
        if (!visible(resource, month)) return null;
        const capacity = capacityFor(resource, month),
          training =
            calendarFor(resource, month).trainingHours / DEFAULT_MONTHLY_HOURS;
        return capacity > 0 ? training / capacity : 0;
      }),
    ]);
  assertExcelRowCount(
    4 + people.length * projects.length + trainingRows.length,
  );
  return workbook({
    name: "Gerçekleşen Dağılım",
    title: "AA Mühendislik | Gerçekleşen Kaynak Dağılımı",
    unit: "Aylık kaynak yüzdesi",
    headers: ["Liderlik", "Takım(lar)", "Proje", "Çalışan"],
    months,
    percentage: true,
    rows: [
      ...projects.flatMap((project) =>
        people.map((resource) => rowFor(project, resource)),
      ),
      ...trainingRows,
    ],
  });
}

export function downloadPlannedAllocations(
  data: Data,
  teams: Team[],
  projects: Project[],
  months: string[],
) {
  downloadWorkbook(
    plannedAllocationWorkbook(data, teams, projects, months),
    `AA-Planlanan-Kaynak-Dagilimi-${months[0]}-${months.at(-1)}.xlsx`,
  );
}
export function downloadActualAllocations(
  data: Data,
  teams: Team[],
  projects: Project[],
  months: string[],
  currentMonth: string,
  selectedPersonIds: string[],
  ownResourceId?: string,
  monthSummaries?: Record<string, ActualMonthSummary>,
) {
  downloadWorkbook(
    actualAllocationWorkbook(
      data,
      teams,
      projects,
      months,
      currentMonth,
      selectedPersonIds,
      ownResourceId,
      monthSummaries,
    ),
    `AA-Gerceklesen-Kaynak-Dagilimi-${months[0]}-${months.at(-1)}.xlsx`,
  );
}
