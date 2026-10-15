import type { Data, Resource } from "./model.ts";
import { snapshotSchema } from "./snapshot-schema.ts";
import {
  validateSnapshotCalendarKeys,
  validateSnapshotPersonalCalendar,
} from "./snapshot-calendar-validation.ts";
import {
  validateSnapshotCatalogs,
  validateSnapshotRisks,
  validateSnapshotIdentifiers,
} from "./snapshot-reference-validation.ts";
import {
  normalizeSnapshotResources,
  validateSnapshotProjects,
} from "./snapshot-timeline-validation.ts";
import { validateSnapshotAllocations } from "./snapshot-allocation-validation.ts";
export { teamSchema, riskSystemSchema } from "./snapshot-schema.ts";
export { personDaySchema } from "./calendar-rules.ts";
export {
  actualInputToFte,
  calendarHoursInMonth,
  personHoursInMonth,
  leaveHoursInMonth,
  trainingHoursInMonth,
  effectivePersonHoursInMonth,
  workdaysInMonth,
  DEFAULT_MONTHLY_HOURS,
  HOURS_PER_WORKDAY,
} from "./actual-units.ts";
export { migrate } from "./model.ts";
export { versionAt } from "./model.ts";
export { actualVersionAt } from "./model.ts";
export { actualTeamTotalIndex } from "./model.ts";
export { currentPlanningMonth } from "./resource-dates.ts";
export { resourceMonthFraction } from "./resource-dates.ts";
export { isActualStatus } from "./model.ts";
export { visibleActualVersion } from "./model.ts";
export { activeTeamMembers } from "./model.ts";
export { buildCapacityIndex } from "./metrics.ts";
export {
  scopeData,
  allowedTeam,
  allowedActualTeam,
  allowedPlanningTeam,
  visiblePlanningTeamScope,
  visibleTeamScope,
  actualReadOwnerScope,
  canSeePlanningRevision,
} from "./access.ts";
export { prepareImport, sourceRows, importColumns } from "./resource-import.ts";

/** Full snapshot validation. The order preserves normalization and first-error behavior. */
export function validate(
  input: unknown,
  options: { previousResources?: readonly Resource[] } = {},
): Data {
  const previous = new Map(
    (options.previousResources || []).map((r) => [
      r.id,
      new Map(r.versions.map((v) => [v.effective, v])),
    ]),
  );
  const d = snapshotSchema.parse(input) as Data;
  delete d.users;
  validateSnapshotCalendarKeys(d);
  const { teamIds, projectsById } = validateSnapshotCatalogs(d);
  validateSnapshotRisks(d, projectsById);
  const resourcesById = new Map(
    d.resources.map((resource) => [resource.id, resource]),
  );
  validateSnapshotPersonalCalendar(d, resourcesById);
  const leaderNames = new Set(d.leaders || []);
  normalizeSnapshotResources(d, teamIds, previous);
  validateSnapshotProjects(d);
  validateSnapshotAllocations(d, teamIds, projectsById, resourcesById);
  validateSnapshotIdentifiers(d, leaderNames);
  return d;
}
