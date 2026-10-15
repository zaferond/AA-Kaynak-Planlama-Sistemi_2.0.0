import { visibleActualVersion, type Resource } from "./model.ts";

/** Display/export policy only; server data and write authorization stay separate. */
export function visibleActualInScope(
  resource: Resource,
  month: string,
  currentMonth: string,
  teamIds: ReadonlySet<string>,
  ownResourceId?: string,
) {
  if (month > currentMonth) return undefined;
  const version = visibleActualVersion(resource, month, currentMonth);
  return version && (resource.id === ownResourceId || teamIds.has(version.team))
    ? version
    : undefined;
}
