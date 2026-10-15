export const riskCategories = ["Takvim", "Mali", "Teknik", "İdari"] as const;
export const riskStatuses = ["Açık", "Takipte", "Kapalı"] as const;
export const riskStrategyKeys = {
  avoid: "Kaçınma",
  control: "Kontrol",
  accept: "Üstlenme-Kabul",
  transfer: "Transfer",
} as const;
export const riskStrategies = ["", ...Object.values(riskStrategyKeys)] as const;
export type RiskCategory = (typeof riskCategories)[number];
export type RiskStatus = (typeof riskStatuses)[number];
export type RiskStrategy = (typeof riskStrategies)[number];
