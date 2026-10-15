import { validPlanningMonth } from "./planning-dates.ts";

/** Shared key contract for planned, actual and percentage allocations. */
export function parseAllocationKey(
  key: string,
): [ownerId: string, projectId: string, month: string] | null {
  const parts = key.split("|");
  if (
    parts.length !== 3 ||
    !parts[0] ||
    !parts[1] ||
    !validPlanningMonth(parts[2])
  )
    return null;
  return [parts[0], parts[1], parts[2]];
}
