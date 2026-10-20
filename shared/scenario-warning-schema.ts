import { z } from "zod";
import { validPlanningMonth } from "./planning-dates.ts";
import {
  warningSettingsSchema,
  warningProgressStates,
  warningResourceStates,
  warningLifecycleStates,
} from "./scenario-warning-policy.ts";

const month = z.string().refine(validPlanningMonth, "Geçersiz ay.");
const value = z.number().finite().nullable();
export const warningAssessmentSchema = z
  .object({
    id: z.string().min(1).max(120),
    month: month.nullable(),
    status: z.enum(["ready", "missing", "completed", "unlocked", "notStarted"]),
    reason: z.string().max(3000),
    planned: value,
    actual: value,
    deviation: value,
    remaining: value,
    futurePlanned: value,
    coverage: value,
    progressState: z.enum(warningProgressStates).nullable(),
    resourceState: z.enum(warningResourceStates).nullable(),
    trendEscalated: z.boolean(),
    code: z.string().max(30).nullable(),
    warning1: z.string().max(300),
    warning2: z.string().max(3000),
    horizonMonths: z.number().int().min(1).max(60),
    nextResources: z.number().finite().min(0),
    migratedReference: z.boolean(),
  })
  .strict();
export const warningConfigSchema = z
  .object({
    id: z.literal("global"),
    settings: warningSettingsSchema,
    updatedAt: z.string().max(40),
    updatedById: z.string().max(120),
    updatedByName: z.string().max(200),
  })
  .strict();
export const scenarioWarningSchema = z
  .object({
    id: z.string().min(1).max(240),
    projectId: z.string().min(1).max(120),
    ruleKey: z.string().min(1).max(40),
    code: z.string().max(30).nullable(),
    month,
    warning1: z.string().max(300),
    warning2: z.string().max(3000),
    status: z.enum(warningLifecycleStates),
    assessment: warningAssessmentSchema,
    createdAt: z.string().max(40),
    updatedAt: z.string().max(40),
    history: z
      .array(
        z
          .object({
            status: z.enum(warningLifecycleStates),
            explanation: z.string().max(3000),
            at: z.string().max(40),
            byId: z.string().max(120),
            byName: z.string().max(200),
          })
          .strict(),
      )
      .min(1)
      .max(100000),
  })
  .strict();
