import { EXCEL_MAX_ROWS, columnName, excelCellText } from "../../xlsx-cells.ts";
import type { ProgressContext } from "./progress-view.ts";
import { topicsIn } from "./progress-topics.ts";
import {
  managementPoint,
  plannedResourceAt,
  STATE_LABELS,
  evaluationLabel,
  type ManagedProject,
} from "./progress-management.ts";

const text = (row: number, col: number, value: string, style = 0) =>
  `<c r="${columnName(col)}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${excelCellText(value)}</t></is></c>`;
function sheet(
  title: string,
  headers: string[],
  rows: (string | number | null)[][],
  numberStyles: Record<number, number> = {},
) {
  if (rows.length + 2 > EXCEL_MAX_ROWS)
    throw Error(
      "Excel satır sınırı aşıldı; proje veya liderlik filtresini daraltın.",
    );
  const last = columnName(headers.length - 1);
  const data = rows
    .map(
      (values, index) =>
        `<row r="${index + 3}">${values.map((value, col) => (typeof value === "number" ? `<c r="${columnName(col)}${index + 3}" s="${numberStyles[col] ?? 7}"><v>${value}</v></c>` : text(index + 3, col, value ?? "—"))).join("")}</row>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}${rows.length + 2}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${headers.length}" width="24" customWidth="1"/></cols><sheetData><row r="1">${text(1, 0, title, 1)}</row><row r="2">${headers.map((h, i) => text(2, i, h, 3)).join("")}</row>${data}</sheetData><autoFilter ref="A2:${last}${rows.length + 2}"/><mergeCells count="1"><mergeCell ref="A1:${last}1"/></mergeCells></worksheet>`;
}

/** The compact sheet and matrix use the same scope and complete data rule. */
export function managementExportRows(projects: ManagedProject[]) {
  return projects.map(({ row, assessment, leaders, scenario }) => ({
    ...row,
    target: scenario ? scenario.planned : assessment.point.target,
    actual: scenario ? scenario.actual : assessment.point.actual,
    performance: assessment.point.performance,
    spent: assessment.point.spent,
    assessmentText: scenario
      ? scenario.warning1 + (scenario.warning2 ? " · " + scenario.warning2 : "")
      : evaluationLabel(assessment.point) + " · " + assessment.resourceTitle,
    reasonText: scenario
      ? [
          scenario.month
            ? "Son kilitli ay: " + scenario.month
            : "Kilitli ay yok",
          scenario.reason,
          scenario.warning2,
        ]
          .filter(Boolean)
          .join(" · ")
      : [assessment.action, ...assessment.reasons].join(" · "),
    leaders: leaders.map((l) => ({
      ...l.row,
      target: l.assessment.point.target,
      actual: l.assessment.point.actual,
      spent: l.assessment.point.spent,
      performance: l.assessment.point.performance,
      assessmentText:
        "Liderlik verisi · Senaryo değerlendirmesi proje genelinde",
      reasonText: l.row.note || "",
    })),
  }));
}

export function managementSheets(
  ctx: ProgressContext,
  projects: ManagedProject[],
  month: string,
  months: string[],
) {
  const summary: (string | number | null)[][] = [];
  const monthly: (string | number | null)[][] = [];
  for (const p of projects) {
    for (const entity of [
      { name: "Proje geneli", value: p.assessment, leaders: p.row.leaders },
      ...p.leaders.map((l) => ({
        name: l.row.record.leader,
        value: l.assessment,
        leaders: [l.row],
      })),
    ]) {
      const a = entity.value;
      const scenario = entity.name === "Proje geneli" ? p.scenario : undefined;
      summary.push([
        p.row.project.name,
        p.row.project.responsibleName?.trim() || "—",
        entity.name,
        scenario?.month || month,
        scenario ? scenario.planned : a.point.target,
        scenario ? scenario.actual : a.point.actual,
        scenario ? scenario.deviation : a.point.gap,
        scenario ? scenario.warning1 : evaluationLabel(a.point),
        scenario ? scenario.remaining : a.remaining,
        scenario
          ? scenario.resourceState
            ? {
                unplanned: "Planlanmamış",
                insufficient: "Yetersiz",
                sufficient: "Yeterli",
                excess: "Fazla",
              }[scenario.resourceState]
            : "—"
          : "Proje genelinde değerlendirilir",
        scenario?.warning2 || "—",
        scenario?.reason || "",
        `${a.point.entered}/${a.point.total}`,
        a.plannedMonth,
        a.actualMonth,
        a.upcoming,
        a.upcomingMonths
          .map(
            (m) => `${m.month}: ${m.planned.toLocaleString("tr-TR")} kişi-ay`,
          )
          .join(" · "),
        scenario
          ? scenario.status === "missing"
            ? scenario.reason
            : "—"
          : a.resourceReview === "unassessed"
            ? STATE_LABELS[a.point.state]
            : "—",
        scenario?.futurePlanned ?? null,
        scenario?.coverage === null || scenario?.coverage === undefined
          ? null
          : scenario.coverage * 100,
        scenario?.code || "—",
      ]);
      for (const m of months) {
        const point = managementPoint(ctx, p.row.project, entity.leaders, m);
        monthly.push([
          p.row.project.name,
          entity.name,
          m,
          point.target,
          point.actual,
          point.gap,
          STATE_LABELS[point.state],
          m >= p.row.project.start && m <= p.row.project.end
            ? p.row.project.phases[m]?.trim() || "—"
            : "—",
          topicsIn(p.row.project, m)
            .map((topic) => topic.name)
            .join(" · ") || "—",
          plannedResourceAt(ctx, p.row.project.id, entity.leaders, m),
        ]);
      }
    }
  }
  return [
    {
      name: "Yönetici Değerlendirmesi",
      xml: sheet(
        `Yönetici değerlendirmesi · ${month}`,
        [
          "Proje",
          "Proje sorumlusu",
          "Liderlik",
          "Değerlendirme ayı",
          "Planlanan %",
          "Gerçekleşen %",
          "Fark %",
          "İlerleme durumu",
          "Kalan iş %",
          "Kaynak değerlendirmesi",
          "Karar ihtiyacı",
          "Gerekçe",
          "Gerçekleşen kapsamı",
          "Aylık planlanan kaynak (kişi-ay)",
          "Aylık gerçekleşen kaynak (kişi-ay)",
          "Sonraki 3 ay planı (kişi-ay)",
          "Aylara göre kaynak planı",
          "Değerlendirme bekleme nedeni",
          "Gelecek Planlı %",
          "Karşılama %",
          "Senaryo kodu",
        ],
        summary,
        { 13: 8 },
      ),
    },
    {
      name: "Aylık İlerleme",
      xml: sheet(
        `Proje ve liderlik aylık ilerlemesi · ${months[0]} – ${months.at(-1)}`,
        [
          "Proje",
          "Liderlik",
          "Ay",
          "Planlanan %",
          "Gerçekleşen %",
          "Fark %",
          "Veri / ilerleme durumu",
          "Aşama",
          "Kritik konular",
          "Planlanan kaynak (kişi-ay)",
        ],
        monthly,
        { 9: 8 },
      ),
    },
  ];
}
