import { z } from "zod";
import { numericRecordSchema } from "./numeric-record-schema.ts";
import { riskCategories, riskStatuses, riskStrategies } from "./risk-policy.ts";
import { validPlanningMonth, validPlanningDate } from "./planning-dates.ts";
import { personDaySchema, calendarDaySchema } from "./calendar-rules.ts";
import { initialRiskSystems } from "./risk-system-seed.ts";
import { statuses, phasePalette, resourceRoles } from "./model.ts";
import { MAX_RECORDED_MONTHLY_HOURS } from "./actual-units.ts";

const mo = z.string().refine(validPlanningMonth, "Geçersiz ay.");
const day = z.string().refine(validPlanningDate, "Geçersiz gün.");
const ver = z.object({
  assignmentRole: z.enum(resourceRoles).optional(),
  effective: mo,
  team: z.string(),
  lead: z.string().optional(),
  status: z.enum(statuses as [string, ...string[]]),
  included: z.boolean(),
  start: z.union([day, mo, z.literal("")]),
  end: z.union([day, mo, z.literal("")]),
  amount: z.number().min(0).max(100),
});
const res = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  note: z.string().max(10000),
  code: z.string().trim().max(100).optional(),
  versions: z.array(ver).min(1).max(200),
});
export const teamSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(200),
  lead: z.string(),
  managerName: z.string().trim().max(200).optional(),
  excelCapacity: z.number(),
  catalog: z.boolean().optional(),
  kind: z.literal("leadership").optional(),
});
export const riskSystemSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),
    name: z.string().trim().min(1).max(200),
  })
  .strict();
const milestoneNote = z.object({
  text: z.string().trim().min(1),
  includeInReport: z.boolean(),
  completed: z.boolean().optional(),
  start: day.optional(),
  end: day.optional(),
  weekHistory: z
    .array(z.string().regex(/^\d{4}-W\d{2}$/))
    .max(520)
    .optional(),
});
const milestone = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),
  name: z.string().trim().min(1).max(200),
  start: day,
  end: day,
  displayKind: z.enum(["range", "milestone"]).optional(),
  diamondStyle: z.enum(["solid", "outline"]).optional(),
  hasCriticalTopics: z.boolean().optional(),
  additionalRanges: z
    .array(
      z.object({
        start: day,
        end: day,
        displayKind: z.enum(["range", "milestone"]).optional(),
        diamondStyle: z.enum(["solid", "outline"]).optional(),
        description: z.string().trim().optional(),
        notes: z.array(milestoneNote).max(10).optional(),
        color: z
          .enum(phasePalette.map((x) => x.id) as [string, ...string[]])
          .optional(),
      }),
    )
    .max(19)
    .optional(),
  barColor: z
    .enum(phasePalette.map((x) => x.id) as [string, ...string[]])
    .optional(),
  barStyle: z.enum(["solid", "striped", "outline"]).optional(),
  barText: z.string().trim().optional(),
  barNotes: z.array(milestoneNote).max(10).optional(),
});
const accessTargets = z
  .array(z.string().trim().min(1).max(200))
  .max(1000)
  .refine((items) => new Set(items).size === items.length, {
    message: "Tekrarlanan yetki kaydı.",
  });
const projectAccess = z
  .object({
    roles: z
      .array(z.enum(["manager", "normal"]))
      .max(2)
      .refine((items) => new Set(items).size === items.length),
    leaders: accessTargets,
    teams: accessTargets,
    people: accessTargets,
  })
  .strict();
const proj = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  sortOrder: z.number().int().min(0).max(1000000000).optional(),
  responsibleName: z.string().trim().max(200).optional(),
  code: z.string().trim().max(100).optional(),
  start: mo,
  end: mo,
  phases: z.record(z.string().max(3000)),
  phaseColors: z
    .record(mo, z.enum(phasePalette.map((x) => x.id) as [string, ...string[]]))
    .optional(),
  milestones: z.array(milestone).max(100).optional(),
  access: projectAccess.optional(),
});
const risk = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),
    projectId: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),
    reportedBy: z.string().trim().min(1).max(200),
    category: z.enum(riskCategories),
    reportedAt: day,
    system: z.string().trim().max(200),
    systemId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,120}$/)
      .optional(),
    description: z.string().trim().min(1).max(5000),
    cause: z.string().trim().max(5000),
    actionPlan: z.string().trim().max(5000),
    targetAt: z.union([day, z.literal("")]),
    status: z.enum(riskStatuses),
    owner: z.string().trim().max(200),
    likelihood: z.number().int().min(1).max(5),
    impact: z.number().int().min(1).max(5),
    strategy: z.enum(riskStrategies),
    implementedAt: z.union([day, z.literal("")]),
    actionResult: z.string().trim().max(5000),
    residualLikelihood: z.number().int().min(1).max(5).nullable(),
    residualImpact: z.number().int().min(1).max(5).nullable(),
    createdBy: z.string().min(1).max(120),
    createdByName: z.string().trim().min(1).max(150),
    createdAt: z.string().min(1).max(40),
    updatedAt: z.string().min(1).max(40),
  })
  .strict();
const credentialSchema = z.object({
  salt: z.string(),
  iv: z.string(),
  wrappedKey: z.string(),
  version: z.string().min(1),
});
const accountSchema = z
  .object({
    id: z.string().min(1),
    username: z.string().min(1).max(100),
    authSource: z.enum(["local", "ldap"]).optional(),
    directoryId: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    email: z.string().max(320).optional(),
    name: z.string().trim().min(1).max(150),
    role: z.enum(["admin", "manager", "normal"]),
    leaders: z.array(z.string()),
    planningTeams: z.array(z.string()).optional(),
    projectEditor: z.boolean().optional(),
    active: z.boolean(),
    credential: credentialSchema.optional(),
  })
  .superRefine((account, ctx) => {
    if (
      account.authSource !== "ldap" &&
      !/^[a-z0-9._@+-]{3,100}$/.test(account.username)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["username"],
        message: "Geçersiz kullanıcı adı.",
      });
    if (account.authSource !== "ldap" && account.directoryId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["directoryId"],
        message: "Yerel hesap AD kimliği içeremez.",
      });
    if (account.authSource === "ldap" && !account.directoryId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["directoryId"],
        message: "AD kimliği gerekli.",
      });
  });
// Validate entries before rebuilding the dictionary. z.record intentionally
// drops __proto__, which is also a permitted leadership name in existing data.
const leaderManagersSchema = z
  .custom<Record<string, unknown>>(
    (value) =>
      value !== null &&
      typeof value === "object" &&
      (Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null),
    "Geçersiz liderlik yöneticisi kaydı.",
  )
  .transform((value) => Object.entries(value))
  .pipe(z.array(z.tuple([z.string(), z.string().trim().max(200)])))
  .transform((entries) => Object.fromEntries(entries));

const scenarioId = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
export const scheduleScenarioSchema = z
  .object({
    id: scenarioId,
    name: z.string().trim().min(1).max(80),
    includeTimeline: z.boolean(),
    shifts: z
      .array(
        z
          .object({
            projectId: z.string().min(1).max(120),
            months: z.number().int().min(-60).max(60),
            fromMonth: mo,
          })
          .strict(),
      )
      .min(1)
      .max(50),
    status: z.enum(["draft", "approved", "applied", "reverted", "closed"]),
    createdBy: z.string().min(1).max(120),
    createdByName: z.string().max(200),
    createdAt: z.string().max(40),
    approvedByName: z.string().max(200).optional(),
    approvedAt: z.string().max(40).optional(),
    appliedByName: z.string().max(200).optional(),
    appliedAt: z.string().max(40).optional(),
    revertedByName: z.string().max(200).optional(),
    revertedAt: z.string().max(40).optional(),
    closedByScenarioId: scenarioId.optional(),
    closedByName: z.string().max(80).optional(),
    closedAt: z.string().max(40).optional(),
    undo: z
      .object({
        projects: z.record(proj),
        allocations: numericRecordSchema({ max: 10000 }),
        afterProjectRevisions: numericRecordSchema({ integer: true }),
        afterAllocations: numericRecordSchema({ max: 10000 }),
      })
      .strict()
      .optional(),
  })
  .strict();

export const snapshotSchema = z.object({
  teams: z.array(teamSchema).min(1),
  resources: z.array(res),
  projects: z.array(proj),
  risks: z.array(risk).max(100000).default([]),
  // Optional: snapshots without scenarios keep their previous shape.
  scheduleScenarios: z.array(scheduleScenarioSchema).max(1000).optional(),
  riskSystems: z
    .array(riskSystemSchema)
    .max(5000)
    .default(() => initialRiskSystems.map((item) => ({ ...item }))),
  allocations: numericRecordSchema({ max: 10000 }),
  actualAllocations: numericRecordSchema({ max: 100 }).optional(),
  actualWorkedHours: numericRecordSchema({
    max: MAX_RECORDED_MONTHLY_HOURS,
  }).optional(),
  actualPercentEntries: numericRecordSchema({ max: 10000 }).optional(),
  workCalendar: z.record(calendarDaySchema.strip()).default({}),
  personCalendar: z.record(personDaySchema).default({}),
  revisions: numericRecordSchema({ integer: true }),
  leaders: z.array(z.string()).optional(),
  leaderManagers: leaderManagersSchema.default({}),
  leaderParents: leaderManagersSchema.optional(),
  leadershipUnits: leaderManagersSchema.optional(),
  catalogVersion: z.number().optional(),
  users: z.array(accountSchema).optional(),
  legacyArchive: z
    .object({
      teams: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          lead: z.string(),
          excelCapacity: z.number(),
          catalog: z.boolean().optional(),
        }),
      ),
      allocations: z.record(z.number()),
      resourceTeams: z.record(z.string()),
    })
    .optional(),
});
