import { currentPlanningMonth } from "./resource-dates.ts";
export { SYSTEM_NAME, UI_THEME } from "./branding.ts";
// Hidden by default; a future release can opt in at build time.
export const RISK_MANAGEMENT_ENABLED =
  process.env.AA_RISK_UI_ENABLED === "true";
export const TAB_LABELS = {
  plan: "AA Planlanan Kaynak Dağılımı",
  projects: "AA Mühendislik Liderliği Projeler",
  risk: "AA Risk Yönetimi",
  resources: "Organizasyon & Çalışan & Yetki",
  actual: "AA Gerçekleşen Kaynak Dağılımı",
  activity: "AA Aylık Aktivite Raporu",
  critical: "AA Kritik Proje Konuları",
  overview: "AA Kaynak Planlama Raporları",
};
export const DEFAULT_FILTERS = {
  start: currentPlanningMonth().slice(0, 4) + "-01",
  count: 12,
};
export const ACTUAL_DEFAULT_PERIOD_MONTHS = 24;
