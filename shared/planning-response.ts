import type { Data } from "./model";
import type { Principal } from "./access";

export type PlanningDelta = {
  responseMode: "planning-delta-v1";
  baseGeneration: number;
  generation: number;
  user: Principal;
  allocations: { id: string; value: number | null; revision: number }[];
};

// Apply to a new snapshot: React and pending editors may still use the old one.
// A mismatch is recovered by reading /data, never by repeating the write.
export function mergePlanningDelta(
  cached: { data: Data; generation: number; user?: Principal },
  delta: PlanningDelta,
): Data | null {
  if (
    delta.baseGeneration !== cached.generation ||
    delta.generation !== cached.generation + 1 ||
    !cached.user ||
    JSON.stringify(cached.user) !== JSON.stringify(delta.user) ||
    !Array.isArray(delta.allocations)
  )
    return null;
  const ids = new Set<string>();
  for (const entry of delta.allocations) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      entry.id.split("|").length !== 3 ||
      ids.has(entry.id) ||
      !Number.isSafeInteger(entry.revision) ||
      entry.revision <=
        (cached.data.revisions["allocation:" + entry.id] || 0) ||
      (entry.value !== null &&
        (typeof entry.value !== "number" ||
          !Number.isFinite(entry.value) ||
          entry.value < 0 ||
          entry.value > 10000))
    )
      return null;
    ids.add(entry.id);
  }
  const allocations = { ...cached.data.allocations },
    revisions = { ...cached.data.revisions };
  for (const { id, value, revision } of delta.allocations) {
    if (value === null) delete allocations[id];
    else allocations[id] = value;
    revisions["allocation:" + id] = revision;
  }
  return { ...cached.data, allocations, revisions };
}
