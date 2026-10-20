import { z } from "zod";
import rules from "./scenario-warning-rules.json" with { type: "json" };

export const warningProgressStates = [
  "ahead",
  "onTrack",
  "behind",
  "critical",
] as const;
export type WarningProgressState = (typeof warningProgressStates)[number];
export const warningResourceStates = [
  "unplanned",
  "insufficient",
  "sufficient",
  "excess",
] as const;
export type WarningResourceState = (typeof warningResourceStates)[number];
export const warningLifecycleStates = [
  "open",
  "seen",
  "acted",
  "closed",
] as const;
export type WarningLifecycleState = (typeof warningLifecycleStates)[number];

export const WARNING_PROGRESS_LABELS: Record<WarningProgressState, string> = {
  ahead: "Planın İlerisinde",
  onTrack: "Planda",
  behind: "Planın Gerisinde",
  critical: "Kritik Gecikme",
};
export const WARNING_RESOURCE_LABELS: Record<WarningResourceState, string> = {
  unplanned: "Planlanmamış",
  insufficient: "Yetersiz",
  sufficient: "Yeterli",
  excess: "Fazla",
};
export const WARNING_LIFECYCLE_LABELS: Record<WarningLifecycleState, string> = {
  open: "Açık",
  seen: "Görüldü",
  acted: "Aksiyon Alındı",
  closed: "Kapandı",
};
export const WARNING_PROGRESS_COLORS: Record<WarningProgressState, string> = {
  ahead: "blue",
  onTrack: "green",
  behind: "amber",
  critical: "red",
};

export const warningSettingsSchema = z
  .object({
    aheadThreshold: z.number().finite().min(0).max(100),
    behindThreshold: z.number().finite().min(-100).max(0),
    criticalThreshold: z.number().finite().min(-100).max(0),
    resourceHorizonMonths: z.number().int().min(1).max(60),
    coverageMinimum: z.number().finite().min(0).max(1000),
    coverageMaximum: z.number().finite().min(0).max(1000),
    trendMonths: z.number().int().min(2).max(60),
  })
  .strict()
  .refine((s) => s.criticalThreshold < s.behindThreshold, {
    message: "Kritik gecikme eşiği, planın gerisinde eşiğinden küçük olmalı.",
    path: ["criticalThreshold"],
  })
  .refine((s) => s.behindThreshold < s.aheadThreshold, {
    message: "İleride olma eşiği, geride olma eşiğinden büyük olmalı.",
    path: ["aheadThreshold"],
  })
  .refine((s) => s.coverageMinimum <= s.coverageMaximum, {
    message: "Kaynak karşılama alt sınırı üst sınırdan büyük olamaz.",
    path: ["coverageMaximum"],
  });
export type WarningSettings = z.infer<typeof warningSettingsSchema>;
export const DEFAULT_WARNING_SETTINGS: Readonly<WarningSettings> =
  Object.freeze({
    aheadThreshold: 5,
    behindThreshold: -5,
    criticalThreshold: -15,
    resourceHorizonMonths: 3,
    coverageMinimum: 90,
    coverageMaximum: 120,
    trendMonths: 2,
  });

export const warningRuleSchema = z
  .object({
    kod: z.string().regex(/^S-\d{2}$/),
    ilerleme: z.array(z.enum(warningProgressStates)).min(1),
    kaynak: z.enum(warningResourceStates),
    uyari1: z.string().min(1),
    uyari2: z.string().min(1),
    aktif: z.boolean(),
  })
  .strict();
export type WarningRule = z.infer<typeof warningRuleSchema>;
/** This JSON array is the only source of scenario matching and message text. */
export const SCENARIO_WARNING_RULES: readonly WarningRule[] = z
  .array(warningRuleSchema)
  .parse(rules);

export function matchWarningRule(
  progress: WarningProgressState,
  resource: WarningResourceState,
  table: readonly WarningRule[] = SCENARIO_WARNING_RULES,
) {
  return table.find(
    (rule) =>
      rule.aktif &&
      rule.ilerleme.includes(progress) &&
      rule.kaynak === resource,
  );
}
