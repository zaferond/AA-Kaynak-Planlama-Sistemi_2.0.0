import type { Data, Team } from "./model.ts";
import { ownValue } from "./records.ts";
type Hierarchy = Pick<Data, "leaders" | "leaderParents">;
/** A display filter only: caller supplies the already authorized snapshot. */
export function selectedLeadershipScope(
  data: Hierarchy,
  selected: readonly string[],
  includeDescendants = false,
) {
  const result = new Set(selected);
  if (!includeDescendants) return result;
  // Scoped snapshots can omit an intermediate parent but retain its ancestry.
  // Traverse that ancestry without inventing teams or broadening the snapshot.
  for (const name of data.leaders || []) {
    const visited = new Set<string>();
    let current = name;
    while (current && !visited.has(current)) {
      if (result.has(current)) {
        result.add(name);
        break;
      }
      visited.add(current);
      current = ownValue(data.leaderParents, current) || "";
    }
  }
  return result;
}

/** The same parent/descendant filter for workspace and assignment pickers. */
export function leadershipScopedUnits(
  data: Hierarchy,
  units: readonly Team[],
  selected: readonly string[],
): Team[] {
  const scope = selectedLeadershipScope(data, selected, true);
  return units.filter((unit) => !selected.length || scope.has(unit.lead));
}
/** Keep each unit exactly once, in parent/child pre-order. Never synthesize capacity owners. */
export function orderedPlanningUnits(
  data: Hierarchy,
  teams: readonly Team[],
): Team[] {
  const byLead = new Map<string, Team[]>();
  for (const team of teams) {
    const group = byLead.get(team.lead) || [];
    if (!byLead.has(team.lead)) byLead.set(team.lead, group);
    group.push(team);
  }
  const names = [...new Set([...(data.leaders || []), ...byLead.keys()])],
    known = new Set(names);
  const children = new Map<string | null, string[]>();
  for (const name of names) {
    const candidate = ownValue(data.leaderParents, name),
      parent =
        candidate && candidate !== name && known.has(candidate)
          ? candidate
          : null;
    const siblings = children.get(parent) || [];
    if (!children.has(parent)) children.set(parent, siblings);
    siblings.push(name);
  }
  for (const siblings of children.values())
    siblings.sort((a, b) => a.localeCompare(b, "tr"));
  const visited = new Set<string>(),
    result: Team[] = [];
  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    const units = byLead.get(name) || [];
    result.push(...units.filter((t) => t.kind === "leadership"));
    for (const child of children.get(name) || []) visit(child);
    result.push(...units.filter((t) => t.kind !== "leadership"));
  }
  for (const root of children.get(null) || []) visit(root);
  for (const name of names) visit(name); // Defensive fallback for invalid/imported cycles.
  return result;
}
export function planningUnitHierarchy(
  data: Pick<Data, "leaderParents">,
  team: Team,
) {
  const visited = new Set([team.lead]);
  let parent = ownValue(data.leaderParents, team.lead) || "",
    next = parent,
    depth = 0;
  while (next && !visited.has(next)) {
    visited.add(next);
    depth++;
    next = ownValue(data.leaderParents, next) || "";
  }
  return {
    parent,
    depth: depth + (team.kind === "leadership" || !team.lead ? 0 : 1),
  };
}
