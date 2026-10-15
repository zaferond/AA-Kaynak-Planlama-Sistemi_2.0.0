import { ownValue } from "../../../../shared/records.ts";
import type { Data } from "../../model.ts";
import { fold } from "../../model.ts";
import {
  orderedLeaderships,
  descendantLeaders,
} from "../../../../shared/leadership-hierarchy.ts";
import { selectedLeadershipScope } from "../../../../shared/leadership-planning.ts";

type Directory = Pick<Data, "leaders" | "leaderParents" | "teams">;
export type PlanningGrants = { leaders: string[]; planningTeams?: string[] };
export type PlanningPermissionRow = {
  kind: "leader" | "team";
  id: string;
  name: string;
  parentId: string;
  depth: number;
};
export function planningPermissionRows(data: Directory, query = "") {
  const rows: PlanningPermissionRow[] = [];
  const teams = data.teams
    .filter((team) => team.kind !== "leadership")
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const known = new Set(data.leaders || []);
  for (const leader of orderedLeaderships(data)) {
    rows.push({ ...leader, kind: "leader" });
    for (const team of teams.filter((team) => team.lead === leader.id))
      rows.push({
        kind: "team",
        id: team.id,
        name: team.name,
        parentId: leader.id,
        depth: leader.depth + 1,
      });
  }
  for (const team of teams.filter((team) => !known.has(team.lead)))
    rows.push({
      kind: "team",
      id: team.id,
      name: team.name,
      parentId: "",
      depth: 0,
    });
  if (!query.trim()) return rows;
  const matched = rows.filter((row) =>
    fold(row.name).includes(fold(query.trim())),
  );
  const ancestors = new Set<string>();
  for (const row of matched) {
    let parent = row.parentId;
    const visited = new Set<string>();
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      ancestors.add(parent);
      parent = ownValue(data.leaderParents, parent) || "";
    }
  }
  return rows.filter(
    (row) =>
      matched.includes(row) || (row.kind === "leader" && ancestors.has(row.id)),
  );
}
export function planningRowState(
  data: Directory,
  grants: PlanningGrants,
  row: PlanningPermissionRow,
) {
  const scope = selectedLeadershipScope(data, grants.leaders, true);
  const inherited = scope.has(row.parentId);
  return {
    checked:
      inherited ||
      (row.kind === "leader"
        ? grants.leaders.includes(row.id)
        : !!grants.planningTeams?.includes(row.id)),
    inherited,
  };
}
export function togglePlanningRow(
  data: Directory,
  grants: PlanningGrants,
  row: PlanningPermissionRow,
  checked: boolean,
): PlanningGrants {
  if (row.kind === "team")
    return {
      leaders: grants.leaders,
      planningTeams: [
        ...new Set(
          checked
            ? [...(grants.planningTeams || []), row.id]
            : (grants.planningTeams || []).filter((id) => id !== row.id),
        ),
      ],
    };
  const descendants = descendantLeaders(data, row.id);
  return {
    leaders: [
      ...grants.leaders.filter((id) => !descendants.has(id)),
      ...(checked ? [row.id] : []),
    ],
    planningTeams: (grants.planningTeams || []).filter(
      (id) =>
        !descendants.has(data.teams.find((team) => team.id === id)?.lead || ""),
    ),
  };
}
export function planningGrantSummary(
  data: Directory,
  account: PlanningGrants & { role: string },
) {
  if (account.role === "admin") return "Tüm Liderlikler";
  const scope = selectedLeadershipScope(data, account.leaders, true);
  const allLeaders =
    !!data.leaders?.length && data.leaders.every((name) => scope.has(name));
  const labels = allLeaders ? ["Tüm Liderlikler"] : account.leaders;
  const teams = data.teams
    .filter(
      (team) =>
        account.planningTeams?.includes(team.id) && !scope.has(team.lead),
    )
    .map((team) => team.name + " (Takım)");
  return (
    [...labels, ...teams].join(", ") || "Tüm Liderlikler · Plan salt okunur"
  );
}
