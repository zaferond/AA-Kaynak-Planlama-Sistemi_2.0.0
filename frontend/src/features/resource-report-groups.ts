import type { directoryResponsibilityIndex } from "../../../shared/resource-roles.ts";
import { topLeader } from "../../../shared/leadership-hierarchy.ts";
import { ownValue } from "../../../shared/records.ts";
import type { Data, Team } from "../model.ts";
export type ReportGroup = {
  name: string;
  ids: string[];
  leader?: string;
  unitId?: string;
  depth?: number;
  parentLeader?: string;
};
/** Group only the caller's authorized, filtered units. Standalone teams are
 * independent roots, rather than one fictitious "unassigned leadership". */
export function topLevelReportGroups(
  data: Pick<Data, "leaderParents">,
  teams: readonly Team[],
): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  for (const team of teams) {
    const leader = topLeader(data, team.lead);
    const key = leader ? "leader:" + leader : "unit:" + team.id;
    let group = groups.get(key);
    if (!group) {
      group = leader
        ? { name: leader, leader, ids: [] }
        : { name: team.name, unitId: team.id, ids: [] };
      groups.set(key, group);
    }
    group.ids.push(team.id);
  }
  return [...groups.values()];
}
/** Expand display rows only. Every child is a subtotal of already filtered units;
 * the original root groups stay authoritative for totals and other reports. */
export function expandLeadershipReportGroups(
  data: Pick<Data, "leaderParents">,
  teams: readonly Team[],
  roots: readonly ReportGroup[],
): ReportGroup[] {
  const teamIndex = new Map(teams.map((team) => [team.id, team]));
  return roots.flatMap((root) => {
    if (!root.leader) return [root];
    const members = new Map<string, Set<string>>();
    for (const id of root.ids) {
      let leader = teamIndex.get(id)?.lead || "";
      const visited = new Set<string>();
      while (leader && leader !== root.leader && !visited.has(leader)) {
        visited.add(leader);
        const ids = members.get(leader) || new Set<string>();
        if (!members.has(leader)) members.set(leader, ids);
        ids.add(id);
        leader = ownValue(data.leaderParents, leader) || "";
      }
    }
    const children = new Map<string, string[]>();
    for (const name of members.keys()) {
      const parent = ownValue(data.leaderParents, name) || "";
      if (parent !== root.leader && !members.has(parent)) continue;
      const siblings = children.get(parent) || [];
      if (!children.has(parent)) children.set(parent, siblings);
      siblings.push(name);
    }
    for (const siblings of children.values())
      siblings.sort((a, b) => a.localeCompare(b, "tr"));
    const rows = [root],
      seen = new Set([root.leader]);
    function visit(parent: string, depth: number) {
      for (const name of children.get(parent) || []) {
        if (seen.has(name)) continue;
        seen.add(name);
        rows.push({
          name,
          leader: name,
          parentLeader: parent,
          depth,
          ids: [...members.get(name)!],
        });
        visit(name, depth + 1);
      }
    }
    visit(root.leader, 1);
    return rows;
  });
}
export function reportGroupManager(
  responsibility: ReturnType<typeof directoryResponsibilityIndex>,
  teams: readonly Team[],
  group: ReportGroup,
  teamReport: boolean,
) {
  if (!teamReport && !group.unitId)
    return ownValue(responsibility.leaders, group.leader || "") || "—";
  const unit = teams.find((team) => team.id === (group.unitId || group.ids[0]));
  if (!unit) return "—";
  return (
    (unit.kind === "leadership"
      ? ownValue(responsibility.leaders, unit.lead)
      : ownValue(responsibility.teams, unit.id)) || "—"
  );
}
