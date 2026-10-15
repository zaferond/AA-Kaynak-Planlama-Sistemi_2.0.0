import { selectedLeadershipScope } from "../../../../shared/leadership-planning.ts";
import type { Data, Resource } from "../../model.ts";
import { fold, versionAt } from "../../model.ts";
import type { Account } from "../../access.ts";
import { ROOT_ADMIN_ID } from "../../access.ts";
import { ownValue } from "../../../../shared/records.ts";

/** Identify unambiguous organization searches for the user-facing notification. */
export function employeeSearchField(
  data: Data,
  search: string,
): "leader" | "team" | "search" {
  const query = fold(search.trim());
  if (!query) return "search";
  const leaders = [
    ...new Set([
      ...(data.leaders || []),
      ...data.teams.map((t) => t.lead).filter(Boolean),
    ]),
  ];
  const teams = data.teams.filter((team) => team.kind !== "leadership");
  const exactLeader = leaders.some((name) => fold(name) === query);
  const exactTeam = teams.some((team) => fold(team.name) === query);
  if (exactLeader) return "leader";
  if (exactTeam) return "team";
  const leader = leaders.some((name) => fold(name).includes(query));
  const team = teams.some((item) => fold(item.name).includes(query));
  return leader !== team ? (leader ? "leader" : "team") : "search";
}
export const accountRoleLabels = {
  admin: "Admin",
  manager: "Yönetici",
  normal: "Normal Kullanıcı",
} as const;
export type EmployeeAccountRow = {
  key: string;
  resource?: Resource;
  account?: Account;
};
/** Join by resource ID, never by name. Orphan/unlinked accounts remain visible;
 * organisational filters apply to employee rows, not accounts with no assignment. */
export function employeeAccountRows(
  data: Data,
  filters: {
    start: string;
    ids: string[];
    teamIds: string[];
    leads: string[];
    search: string;
  },
): EmployeeAccountRow[] {
  const { start, ids, teamIds, leads, search } = filters;
  const query = fold(search.trim());
  const selectedLeaders = selectedLeadershipScope(data, leads, true);
  const teamsById = new Map(data.teams.map((team) => [team.id, team]));
  const ancestry = new Map<string, string>();
  function leadershipText(name: string) {
    if (ancestry.has(name)) return ancestry.get(name)!;
    const names = new Set<string>();
    let current = name;
    while (current && !names.has(current)) {
      names.add(current);
      current = ownValue(data.leaderParents, current) || "";
    }
    const text = [...names].join(" ");
    ancestry.set(name, text);
    return text;
  }
  const accounts = new Map<string, Account[]>();
  const resourceIds = new Set(data.resources.map((r) => r.id));
  for (const account of data.users || []) {
    if (!account.resourceId || !resourceIds.has(account.resourceId)) continue;
    const existing = accounts.get(account.resourceId) || [];
    existing.push(account);
    accounts.set(account.resourceId, existing);
  }
  const accountText = (a?: Account) =>
    a
      ? [
          a.name,
          a.username,
          a.email || "",
          accountRoleLabels[a.role],
          a.id === ROOT_ADMIN_ID ? "Ana yönetici Sistem Yöneticisi" : "",
        ].join(" ")
      : "";
  const rows: EmployeeAccountRow[] = [];
  for (const resource of data.resources) {
    const v = versionAt(resource, start) || resource.versions[0];
    const team = teamsById.get(v.team);
    const lead = v.lead || team?.lead || "";
    const linked = accounts.get(resource.id) || [];
    const inScope =
      (ids.includes(v.team) || (!v.team && !teamIds.length)) &&
      (!leads.length || selectedLeaders.has(lead));
    for (const account of linked.length ? linked : [undefined]) {
      if (!inScope && account?.id !== ROOT_ADMIN_ID) continue;
      if (
        !fold(
          [
            resource.name,
            v.status,
            leadershipText(lead),
            team?.name || "",
            accountText(account),
          ].join(" "),
        ).includes(query)
      )
        continue;
      rows.push({
        key: account ? "account:" + account.id : "resource:" + resource.id,
        resource,
        account,
      });
    }
  }
  for (const account of data.users || []) {
    if (account.resourceId && resourceIds.has(account.resourceId)) continue;
    if (fold(accountText(account)).includes(query))
      rows.push({ key: "account:" + account.id, account });
  }
  // Keep the protected system account easy to find, without fabricating a resource.
  return rows.sort(
    (a, b) =>
      Number(b.account?.id === ROOT_ADMIN_ID) -
      Number(a.account?.id === ROOT_ADMIN_ID),
  );
}
