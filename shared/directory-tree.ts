import type { Data, Team } from "./model.ts";
import { fold } from "./model.ts";
import { ownValue } from "./records.ts";
import { directoryResponsibilityIndex } from "./resource-roles.ts";
export type DirectoryGroup = {
  lead: string;
  parent: string;
  depth: number;
  teams: Team[];
};
export function directoryTree(data: Data, query = ""): DirectoryGroup[] {
  const names = [
    ...new Set([...(data.leaders || []), ...data.teams.map((t) => t.lead)]),
  ];
  const known = new Set(names),
    responsibility = directoryResponsibilityIndex(data),
    q = fold(query);
  const parent = (name: string) => {
    const value = ownValue(data.leaderParents || {}, name) || "";
    return value !== name && known.has(value) ? value : "";
  };
  const children = new Map<string, string[]>();
  for (const name of names) {
    const key = parent(name);
    children.set(key, [...(children.get(key) || []), name]);
  }
  const visited = new Set<string>();
  function visit(lead: string, depth: number): DirectoryGroup[] {
    if (visited.has(lead)) return [];
    visited.add(lead);
    const leadMatch = fold(
      lead + " " + (ownValue(responsibility.leaders, lead) || ""),
    ).includes(q);
    const teams = data.teams.filter(
      (t) =>
        t.kind !== "leadership" &&
        t.lead === lead &&
        (leadMatch ||
          fold(
            t.name + " " + (ownValue(responsibility.teams, t.id) || ""),
          ).includes(q)),
    );
    const descendants = (lead ? children.get(lead) || [] : [])
      .filter((n) => n !== lead)
      .flatMap((n) => visit(n, depth + 1));
    return !q || leadMatch || teams.length || descendants.length
      ? [{ lead, parent: parent(lead), depth, teams }, ...descendants]
      : [];
  }
  const roots = names.filter((n) => !parent(n));
  const rows = roots.flatMap((n) => visit(n, 0));
  // Defensive fallback for imported, invalid cycles; valid snapshots never use it.
  for (const name of names)
    if (!visited.has(name)) rows.push(...visit(name, 0));
  return rows;
}
