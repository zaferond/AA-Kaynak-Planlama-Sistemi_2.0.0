import { ownValue } from "../shared/records.ts";
import { publicUser } from "./auth.mjs";
import {
  canSeePlanningRevision,
  visiblePlanningTeamScope,
} from "./domain/index.mjs";

// Build an opt-in patch from the fully validated transaction result. The same
// planning revision policy is used by full views; no user/actual projection is
// needed when no metadata or non-planning revisions changed.
export function planningDeltaView({
  before,
  valid,
  generation,
  active,
  changeSet,
  planningDelta,
  metadataUnchanged,
}) {
  if (
    !metadataUnchanged ||
    planningDelta?.baseGeneration !== generation ||
    ["actual", "workedHours", "percent"].some(
      (kind) => changeSet[kind].length !== 0,
    ) ||
    [before.revisions, valid.revisions].some((revisions) =>
      Object.keys(revisions).some(
        (key) =>
          !key.startsWith("allocation:") &&
          ownValue(before.revisions, key) !== ownValue(valid.revisions, key),
      ),
    )
  )
    return null;
  const principal = publicUser(active);
  const teams = visiblePlanningTeamScope(valid, principal).ids;
  const ids = new Set([
    ...planningDelta.ids,
    ...changeSet.allocation.map((change) => change.id),
  ]);
  return {
    responseMode: "planning-delta-v1",
    baseGeneration: generation,
    generation: generation + 1,
    user: principal,
    allocations: [...ids]
      .filter(
        (id) =>
          canSeePlanningRevision(principal, id.split("|")[0], teams) &&
          ownValue(valid.revisions, "allocation:" + id) !== undefined &&
          ownValue(valid.revisions, "allocation:" + id) !==
            ownValue(before.revisions, "allocation:" + id),
      )
      .map((id) => ({
        id,
        value: ownValue(valid.allocations, id) ?? null,
        revision: ownValue(valid.revisions, "allocation:" + id),
      })),
  };
}
