import {
  readCompositeMap,
  readRevisionMap,
  readNumericSnapshot,
} from "./read-records.mjs";
import { readSnapshotMetadata } from "./snapshot-metadata-model.mjs";
import {
  visiblePlanningTeamScope,
  actualReadOwnerScope,
} from "./domain/index.mjs";

// Read from the caller's snapshot; authorization remains in Store.view/mutate.
export async function readPlanningSnapshot(c, provider, viewUser) {
  const { data: d, generation } = await readSnapshotMetadata(c, {
    batch: provider === "mssql" && !viewUser,
  });
  if (provider === "mssql" && !viewUser && typeof c.scanMany === "function") {
    Object.assign(d, await readNumericSnapshot(c, provider));
    return { data: d, generation };
  }
  // Legacy IDs containing a composite separator retain complete-read semantics.
  const planningTeams =
    viewUser &&
    viewUser.role !== "admin" &&
    !d.teams.some((t) => t.id.includes("|"))
      ? [...visiblePlanningTeamScope(d, viewUser).ids]
      : undefined;
  d.allocations = await readCompositeMap(
    c,
    provider,
    "allocations",
    "amount",
    planningTeams,
  );
  d.actualAllocations = await readCompositeMap(
    c,
    provider,
    "actual_allocations",
    "amount",
  );
  // FTE amounts remain complete for anonymous historical team totals. Personal
  // hours/percentages need only candidate visible owners on authenticated reads.
  // Mutations pass no viewUser and still read/validate a complete snapshot.
  const actualOwners =
    viewUser && !d.resources.some((r) => r.id.includes("|"))
      ? actualReadOwnerScope(d, viewUser)
      : undefined;
  d.actualWorkedHours = await readCompositeMap(
    c,
    provider,
    "actual_worked_hours",
    "hours",
    actualOwners,
  );
  d.actualPercentEntries = await readCompositeMap(
    c,
    provider,
    "actual_percent_entries",
    "percent",
    actualOwners,
  );
  d.revisions = await readRevisionMap(
    c,
    provider,
    viewUser?.role === "normal" ? [] : planningTeams,
  );
  return { data: d, generation };
}
