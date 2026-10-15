import { ownValue } from "../shared/records.ts";
import { parseAllocationKey } from "../shared/allocation-key.ts";
import { z } from "zod";
import { fail, publicUser } from "./auth.mjs";
import {
  allowedActualTeam,
  allowedPlanningTeam,
  validate,
  actualVersionAt,
} from "./domain/index.mjs";
import { orderedProjects } from "../shared/project-order.ts";
import { stageRiskChange, stageRiskSystemChange } from "./risk-commands.mjs";
import { stageTeamChange } from "./directory-commands.mjs";
import { stageProjectResourceChange } from "./project-resource-commands.mjs";
import {
  stageActualChange,
  stageWorkedHoursChange,
  stageCalendarChange,
  stagePersonDayChange,
  finalizeActualChanges,
} from "./actual-calendar-commands.mjs";
// Keep the existing operations entry point for routes, tools and tests.
export { applyLeaderChange } from "./directory-commands.mjs";
export { reset, importRows, restore } from "./bulk-data-commands.mjs";
const id = z.string().regex(/^[a-zA-Z0-9_|-]{1,300}$/);
const changesSchema = z
  .array(
    z.object({
      kind: z.enum([
        "team",
        "project",
        "risk",
        "riskSystem",
        "resource",
        "allocation",
        "actual",
        "workedHours",
        "calendar",
        "personDay",
      ]),
      id,
      value: z.unknown().optional(),
      revision: z.number().int().nonnegative(),
      operation: z.literal("delete").optional(),
    }),
  )
  .min(1)
  .max(100000);
export function applyChanges(d, u, input) {
  const previousResources = structuredClone(d.resources);
  stageChanges(d, u, input);
  Object.assign(d, validate(d, { previousResources }));
  return d;
}

// Store.mutate validates the final draft before persistence. Standalone callers
// use applyChanges above, which retains full validation and normalization.
export function stageChanges(d, u, input) {
  return stageParsedChanges(d, u, changesSchema.parse(input));
}

const planningCommands = new WeakMap();

// Only this owned command can use an allocation/revision-only draft. Re-check
// the parsed kinds when invoked inside the transaction, before touching data.
export function planningCommand(input) {
  const command = (d, u) => {
    return stageParsedChanges(d, u, parsePlanningChanges(input));
  };
  planningCommands.set(command, input);
  return command;
}

export const isPlanningCommand = (command) => planningCommands.has(command);

function parsePlanningChanges(input) {
  const changes = changesSchema.parse(input);
  if (!changes.every((change) => change.kind === "allocation"))
    fail(400, "Yalnız planlanan kaynak dağılımı işlemleri kullanılabilir.");
  return changes;
}

// Capture one owned, primitive cell command inside the transaction. Both the
// narrow preflight and full draft stage this same parsed input. Arbitrary
// callbacks, batches and legacy/malformed keys keep the complete-read path.
export function preparePlanningCommand(command) {
  const input = planningCommands.get(command);
  if (!Array.isArray(input) || input.length !== 1) return null;
  const changes = parsePlanningChanges(input),
    change = changes[0];
  if (
    !parseAllocationKey(change.id) ||
    (!change.operation &&
      (!Number.isFinite(change.value) ||
        change.value < 0 ||
        change.value > 10000))
  )
    return null;
  return {
    id: change.id,
    stage: (data, active) => stageParsedChanges(data, active, changes),
  };
}

function stageParsedChanges(d, u, changes) {
  const seen = new Set(),
    affectedActualMonths = new Set();
  for (const ch of changes) {
    const { kind, id, value, revision, operation } = ch,
      k = kind + ":" + id;
    if (seen.has(k)) fail(400, "Tekrarlanan işlem.");
    seen.add(k);
    const targetId = id.split("|")[0];
    const managerPlan =
      u.role === "manager" &&
      kind === "allocation" &&
      allowedPlanningTeam(d, publicUser(u), targetId);
    const actualKind = kind === "actual" || kind === "workedHours";
    const month = actualKind ? id.split("|")[kind === "actual" ? 2 : 1] : "";
    const resource = actualKind
      ? d.resources.find((item) => item.id === targetId)
      : undefined;
    const assignment =
      resource && month ? actualVersionAt(resource, month) : undefined;
    const managerActual =
      u.role === "manager" &&
      actualKind &&
      !!assignment &&
      allowedActualTeam(d, publicUser(u), assignment.team);
    const ownActual =
      (u.role === "normal" || u.role === "manager") &&
      !!u.resourceId &&
      targetId === u.resourceId &&
      actualKind;
    const ownDay =
      kind === "personDay" && !!u.resourceId && targetId === u.resourceId;
    const existingRisk =
      kind === "risk" ? d.risks?.find((item) => item.id === id) : undefined;
    const canRisk =
      kind === "risk" &&
      (!operation || u.role !== "normal") &&
      (u.role === "manager" ||
        u.role === "admin" ||
        !existingRisk ||
        existingRisk.createdBy === u._id);
    if (
      u.role !== "admin" &&
      !managerPlan &&
      !managerActual &&
      !ownActual &&
      !ownDay &&
      !canRisk
    )
      fail(403, "Bu işlem için yetkiniz yok.");
    if (ownActual && !resource) fail(404, "Çalışan kaynak bulunamadı.");
    if ((d.revisions[k] || 0) !== revision)
      fail(
        409,
        "Kayıt başka kullanıcı tarafından değiştirildi. Yenileyip tekrar deneyin.",
      );
    // Final snapshot validation cannot see deleted keys. Validate their targets
    // before deletion, and never manufacture tombstones for empty cells.
    // Authorization and revision checks must still run for these no-op clears.
    if (operation && (kind === "allocation" || kind === "actual")) {
      const parts = parseAllocationKey(id);
      if (!parts) fail(400, "Dağıtım kaydı kimliği geçersiz.");
      const [ownerId, projectId] = parts;
      const owners = kind === "allocation" ? d.teams : d.resources;
      if (
        !owners.some((item) => item.id === ownerId) ||
        !d.projects.some((item) => item.id === projectId)
      )
        fail(404, "Dağıtım kaydının takım, çalışan veya projesi bulunamadı.");
      const entries =
        kind === "allocation" ? d.allocations : d.actualAllocations;
      if (
        ownValue(entries || {}, id) === undefined &&
        (kind !== "actual" ||
          ownValue(d.actualPercentEntries || {}, id) === undefined)
      )
        continue;
    }
    if (kind === "riskSystem") {
      stageRiskSystemChange(d, ch);
    } else if (kind === "risk") {
      stageRiskChange(d, u, ch, existingRisk);
    } else if (kind === "allocation") {
      if (operation) delete d.allocations[id];
      else d.allocations[id] = value;
    } else if (kind === "actual") {
      stageActualChange(d, ch, affectedActualMonths);
    } else if (kind === "workedHours") {
      if (!stageWorkedHoursChange(d, ch, affectedActualMonths)) continue;
    } else if (kind === "calendar") {
      stageCalendarChange(d, ch, affectedActualMonths);
    } else if (kind === "personDay") {
      if (!stagePersonDayChange(d, ch, affectedActualMonths)) continue;
    } else if (kind === "team") {
      stageTeamChange(d, ch);
    } else {
      stageProjectResourceChange(d, ch);
    }
    d.revisions[k] = revision + 1;
  }
  // Validate the final batch: moving allocations between projects or adjusting
  // a calendar together with allocations must not fail on an intermediate total.
  // Recalculate only after explicit revisions have been checked for every change.
  finalizeActualChanges(d, affectedActualMonths);
  if (changes.some((change) => change.kind === "project"))
    d.projects = orderedProjects(d.projects);
  return d;
}
