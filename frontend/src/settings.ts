import { currentPlanningMonth } from "./resource-dates.ts";
export { SYSTEM_NAME, UI_THEME } from "./branding.ts";
// Hidden by default; a future release can opt in at build time.
export const RISK_MANAGEMENT_ENABLED =
  process.env.AA_RISK_UI_ENABLED === "true";
export const TAB_LABELS = {
  plan: "Planlanan Kaynak Dağılımı",
  projects: "Mühendislik Liderliği Projeler",
  risk: "Risk Yönetimi",
  resources: "Organizasyon & Çalışan & Yetki",
  actual: "Gerçekleşen Kaynak Dağılımı",
  activity: "Aylık Aktivite Raporu",
  critical: "Kritik Proje Konuları",
  overview: "Kaynak Planlama Raporları",
};
export const DEFAULT_FILTERS = {
  start: currentPlanningMonth().slice(0, 4) + "-01",
  count: 12,
};
export const ACTUAL_DEFAULT_PERIOD_MONTHS = 24;
