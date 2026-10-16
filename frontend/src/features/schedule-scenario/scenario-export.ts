import {
  assertExcelRowCount,
  columnName,
  excelCellText,
  spreadsheetNamespace,
} from "../../xlsx-cells.ts";
import {
  createWorkbook,
  downloadWorkbook,
  excelSheetNameKeys,
} from "../../xlsx-workbook.ts";
import { SYSTEM_NAME } from "../../settings.ts";
import { monthLabel } from "../../format.ts";
import type { Data } from "../../model";
import {
  groupRemaining,
  type ScenarioComparison,
} from "./scenario-comparison.ts";

// 0 plain · 1 title · 2 header · 3 row label · 4 number · 5 shortage number
const styles = `<styleSheet xmlns="${spreadsheetNamespace}">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/><color rgb="FF293A2D"/></font><font><b/><sz val="13"/><name val="Calibri"/><color rgb="FF293A2D"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFB42318"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF405341"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF6F8F2"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFCCD6C5"/></left><right style="thin"><color rgb="FFCCD6C5"/></right><top style="thin"><color rgb="FFCCD6C5"/></top><bottom style="thin"><color rgb="FFCCD6C5"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="164" fontId="3" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** `{ text, header }` marks a section heading inside a sheet. */
type Cell =
  | string
  | number
  | { value: number; style: number }
  | { text: string; header: true }
  | null;

function sheet(name: string, title: string, rows: Cell[][], widths: number[]) {
  const xmlRows = [[title], [], ...rows].map((cells, r) => {
    assertExcelRowCount(r + 1);
    const header = r === 2;
    return `<row r="${r + 1}">${cells
      .map((cell, c) => {
        const ref = columnName(c) + (r + 1);
        if (cell === null || cell === "") return "";
        if (typeof cell === "object" && "text" in cell)
          return `<c r="${ref}" s="2" t="inlineStr"><is><t xml:space="preserve">${excelCellText(cell.text)}</t></is></c>`;
        if (typeof cell === "string")
          return `<c r="${ref}" s="${r === 0 ? 1 : header ? 2 : c === 0 ? 3 : 0}" t="inlineStr"><is><t xml:space="preserve">${excelCellText(cell)}</t></is></c>`;
        const { value, style } =
          typeof cell === "number" ? { value: cell, style: 4 } : cell;
        return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
      })
      .join("")}</row>`;
  });
  return {
    name,
    printTitleRows: 3,
    xml: `<worksheet xmlns="${spreadsheetNamespace}"><sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="3" topLeftCell="B4" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols>${widths
      .map(
        (width, i) =>
          `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`,
      )
      .join(
        "",
      )}</cols><sheetData>${xmlRows.join("")}</sheetData><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9"/></worksheet>`,
  };
}

/** Excel sheet names: ≤31 characters, no []:*?/\ and unique ignoring case. */
function sheetNames(names: string[]) {
  const used = new Set<string>();
  return names.map((raw) => {
    const clean =
      raw
        .replace(/[\\/[\]*?:]/g, " ")
        .replace(/^'+|'+$/g, "")
        .trim() || "Senaryo";
    for (let n = 1; ; n++) {
      const suffix = n === 1 ? "" : " " + n;
      const candidate = clean.slice(0, 31 - suffix.length) + suffix;
      const keys = excelSheetNameKeys(candidate);
      if (keys.every((key) => !used.has(key))) {
        keys.forEach((key) => used.add(key));
        return candidate;
      }
    }
  });
}

export function buildScenarioWorkbook(
  data: Data,
  comparison: ScenarioComparison,
): Uint8Array {
  const { columns, months, teams, projects } = comparison;
  const teamName = (id: string) =>
    data.teams.find((t) => t.id === id)?.name || id;
  const period = `${monthLabel(months[0])} – ${monthLabel(months.at(-1)!)}`;
  const summary = sheet(
    "Özet",
    `Erteleme senaryosu karşılaştırması · ${period} · ${teams.length} takım`,
    [
      ["", ...columns.map((c) => c.name)],
      ...projects.map((p) => [
        p.name + " bitişi",
        ...columns.map((c) => monthLabel(c.projectEnds[p.id] || p.end)),
      ]),
      [
        "Toplam kaynak açığı (kişi-ay)",
        ...columns.map((c) => c.summary.shortage),
      ],
      ["Açık olan ay sayısı", ...columns.map((c) => c.summary.shortageMonths)],
      [
        "En yüksek aylık açık",
        ...columns.map((c) =>
          c.summary.peak
            ? `${c.summary.peak.value.toLocaleString("tr-TR")} · ${monthLabel(c.summary.peak.month)}`
            : "Açık yok",
        ),
      ],
      [
        "Kaydırılan planlanan kayıt",
        "—",
        ...columns.slice(1).map((c) => c.moved),
      ],
    ],
    [40, ...columns.map(() => 22)],
  );
  const names = sheetNames(columns.map((c) => c.name));
  const valueRow = (
    column: (typeof columns)[number],
    label: string,
    ids: string[],
  ): Cell[] => [
    label,
    ...months.map((month) => {
      const value = groupRemaining(column, ids, month);
      return { value, style: value < -1e-9 ? 5 : 4 };
    }),
  ];
  const detail = columns.map((column, i) =>
    sheet(
      names[i] === "Özet" ? "Özet 2" : names[i],
      `${column.name} · liderlik ve takım bazında kalan kaynak (kişi eşdeğeri, eksi = açık) · ${period}`,
      [
        ["Liderlik / Birim", ...months.map(monthLabel)],
        ...comparison.leaderRows.map((row) =>
          valueRow(
            column,
            (row.depth ? "  ".repeat(row.depth) + "↳ " : "") + row.name,
            row.ids,
          ),
        ),
        valueRow(column, "Toplam", [
          ...new Set(
            comparison.leaderRows
              .filter((row) => !row.depth)
              .flatMap((row) => row.ids),
          ),
        ]),
        [],
        [
          { text: "Takım", header: true },
          ...months.map((m) => ({
            text: monthLabel(m),
            header: true as const,
          })),
        ],
        ...teams.map((team) => valueRow(column, teamName(team), [team])),
      ],
      [40, ...months.map(() => 11)],
    ),
  );
  return createWorkbook({
    sheets: [summary, ...detail],
    styles,
    properties: { title: "Erteleme Senaryosu", creator: SYSTEM_NAME },
  });
}

export function downloadScenarioWorkbook(
  data: Data,
  comparison: ScenarioComparison,
) {
  downloadWorkbook(
    buildScenarioWorkbook(data, comparison),
    "erteleme-senaryosu.xlsx",
  );
}
