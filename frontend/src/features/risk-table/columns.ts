export const riskColumns = [
  {
    key: "description",
    editor: "multiline",
    label: "Risk tanımı (kaynak · olay · sonuç)",
    width: 310,
    group: "record",
    text: true,
  },
  {
    key: "reportedBy",
    editor: "text",
    label: "Risk bildirimini yapan birim / sorumlu",
    width: 210,
    group: "record",
    text: true,
  },
  {
    key: "category",
    editor: "category",
    label: "Risk kategorisi",
    width: 138,
    group: "record",
  },
  {
    key: "reportedAt",
    editor: "date",
    label: "Bildirim tarihi",
    width: 132,
    group: "record",
  },
  {
    key: "system",
    editor: "system",
    label: "Sistem / alt sistem",
    width: 240,
    group: "record",
    text: true,
  },
  {
    key: "cause",
    editor: "multiline",
    label: "Potansiyel sebep",
    width: 245,
    group: "record",
    text: true,
  },
  {
    key: "actionPlan",
    editor: "multiline",
    label: "Aksiyon planı",
    width: 260,
    group: "record",
    text: true,
  },
  {
    key: "targetAt",
    editor: "date",
    label: "Hedef tarih",
    width: 130,
    group: "record",
  },
  {
    key: "status",
    editor: "status",
    label: "Statü",
    width: 122,
    group: "record",
  },
  {
    key: "owner",
    editor: "text",
    label: "Risk sorumlusu",
    width: 175,
    group: "record",
    text: true,
  },
  {
    key: "likelihood",
    editor: "likelihood",
    label: "Olasılık",
    width: 98,
    group: "initial",
    center: true,
  },
  {
    key: "impact",
    editor: "likelihood",
    label: "Etki",
    width: 85,
    group: "initial",
    center: true,
  },
  {
    key: "score",
    label: "Risk puanı",
    width: 105,
    group: "initial",
    center: true,
  },
  {
    key: "level",
    label: "Risk seviyesi",
    width: 158,
    group: "initial",
    center: true,
  },
  {
    key: "avoid",
    editor: "strategy",
    label: "Kaçınma",
    width: 100,
    group: "strategy",
    center: true,
  },
  {
    key: "control",
    editor: "strategy",
    label: "Kontrol",
    width: 100,
    group: "strategy",
    center: true,
  },
  {
    key: "accept",
    editor: "strategy",
    label: "Üstlenme–Kabul",
    width: 132,
    group: "strategy",
    center: true,
  },
  {
    key: "transfer",
    editor: "strategy",
    label: "Transfer",
    width: 104,
    group: "strategy",
    center: true,
  },
  {
    key: "implementedAt",
    editor: "date",
    label: "Aksiyonun devreye alınma tarihi",
    width: 167,
    group: "action",
  },
  {
    key: "actionResult",
    editor: "multiline",
    label: "Gerçekleştirilen aksiyon & değerlendirme",
    width: 260,
    group: "action",
    text: true,
  },
  {
    key: "residualLikelihood",
    editor: "residual",
    label: "Olasılık",
    width: 98,
    group: "residual",
    center: true,
  },
  {
    key: "residualImpact",
    editor: "residual",
    label: "Etki",
    width: 85,
    group: "residual",
    center: true,
  },
  {
    key: "residualScore",
    label: "Aksiyon sonrası risk puanı",
    width: 132,
    group: "residual",
    center: true,
  },
  {
    key: "residualLevel",
    label: "Risk seviyesi",
    width: 158,
    group: "residual",
    center: true,
  },
] as const;

const projectColumn = {
  key: "project",
  label: "Proje",
  width: 190,
  group: "record",
  text: true,
} as const;
type Presentation = { text?: boolean; center?: boolean };
export type RiskColumn = ((typeof riskColumns)[number] | typeof projectColumn) &
  Presentation;
export const riskColumnGroups = [
  { key: "record", label: "Risk Bildirimi ve Aksiyon Planı" },
  { key: "initial", label: "İlk Risk Değerlendirmesi" },
  { key: "strategy", label: "Risk Stratejisi" },
  { key: "action", label: "Uygulanan Aksiyon" },
  { key: "residual", label: "Aksiyon Sonrası Değerlendirme" },
] as const;
export function visibleRiskColumns(
  showProject: boolean,
): readonly RiskColumn[] {
  return showProject
    ? [riskColumns[0], projectColumn, ...riskColumns.slice(1)]
    : riskColumns;
}
export function riskFocusField(key: string): string {
  const column = riskColumns.find((column) => column.key === key);
  return column && "editor" in column ? column.key : "description";
}
