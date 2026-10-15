import { ownValue } from "./records.ts";
import { visibleLeaderParents } from "./leadership-hierarchy.ts";
import type { Data, Resource } from "./model.ts";
import { actualTeamTotalIndex, createActualTeamIndex } from "./model.ts";
import { filterOwnRecords } from "./records.ts";
export type Role = "admin" | "manager" | "normal";
export type Credential = {
  salt: string;
  iv: string;
  wrappedKey: string;
  version: string;
};
export type Account = {
  id: string;
  username: string;
  name: string;
  role: Role;
  resourceId?: string;
  authSource?: "local" | "ldap";
  directoryId?: string;
  email?: string;
  leaders: string[];
  planningTeams?: string[];
  active: boolean;
  credential?: Credential;
};
export function isEmployeeResource(resource: Resource) {
  return resource.versions.some((version) => !version.status.includes("İlan"));
}
export const ROOT_ADMIN_ID = "root-admin";
export type Principal = Omit<Account, "credential">;
/** Daily leave/training details belong only to the employee and administrators.
 * Leadership grants authorize actual work entries, never private calendars. */
export function canReadPersonalCalendar(
  u: Pick<Principal, "role" | "resourceId">,
  resourceId: string,
) {
  return u.role === "admin" || (!!resourceId && resourceId === u.resourceId);
}
export function publicAccount(a: Account): Principal {
  const { credential, ...p } = a;
  return structuredClone(p);
}
export function allowedTeam(d: Data, u: Principal, id: string) {
  return (
    u.role === "admin" ||
    (u.role === "manager" &&
      d.teams.some(
        (t) => t.id === id && !!t.lead && u.leaders.includes(t.lead),
      ))
  );
}
// Traverse hierarchy grants once; callers retain separate planning, actual and
// personal-calendar policies. This function never grants normal users team writes.
function allowedHierarchyTeam(
  d: Pick<Data, "teams" | "leaderParents">,
  u: Principal,
  id: string,
) {
  if (u.role === "admin") return true;
  if (u.role !== "manager") return false;
  let lead = d.teams.find((team) => team.id === id)?.lead;
  const visited = new Set<string>();
  while (lead && !visited.has(lead)) {
    if (u.leaders.includes(lead)) return true;
    visited.add(lead);
    lead = ownValue(d.leaderParents, lead);
  }
  return false;
}
export function allowedPlanningTeam(
  d: Pick<Data, "teams" | "leaderParents">,
  u: Principal,
  id: string,
) {
  return (
    allowedHierarchyTeam(d, u, id) ||
    (u.role === "manager" &&
      !!u.planningTeams?.includes(id) &&
      d.teams.some((team) => team.id === id))
  );
}
export function allowedActualTeam(
  d: Pick<Data, "teams" | "leaderParents">,
  u: Principal,
  id: string,
) {
  return allowedHierarchyTeam(d, u, id);
}
export function visiblePlanningTeamScope(
  d: Pick<Data, "teams" | "leaders">,
  u: Principal,
) {
  if (u.role !== "manager" && u.role !== "admin") return visibleTeamScope(d, u);
  return {
    leaderNames: new Set(d.leaders || []),
    teams: d.teams,
    ids: new Set(d.teams.map((team) => team.id)),
  };
}

// Existing personal actual/calendar scope; independent of planning visibility.
export function visibleTeamScope(
  d: Pick<Data, "teams" | "leaders">,
  u: Principal,
) {
  const leaderNames = new Set(u.leaders.length ? u.leaders : d.leaders || []);
  const teams = d.teams.filter((t) => !!t.lead && leaderNames.has(t.lead)),
    ids = new Set(teams.map((t) => t.id));
  return { leaderNames, teams, ids };
}

export function canSeePlanningRevision(
  u: Pick<Principal, "role">,
  ownerId: string,
  visibleTeams: ReadonlySet<string>,
) {
  return (
    u.role === "admin" || (u.role === "manager" && visibleTeams.has(ownerId))
  );
}

// Candidate owners for personal actual data. A manager's historical team/month
// check still runs below; a linked manager also retains their own employee records.
export function actualReadOwnerScope(
  d: Pick<Data, "teams" | "leaders" | "resources">,
  u: Principal,
  teamIds = visibleTeamScope(d, u).ids,
): string[] | undefined {
  if (u.role === "admin") return undefined;
  if (u.role === "normal") return u.resourceId ? [u.resourceId] : [];
  return d.resources
    .filter(
      (r) =>
        r.id === u.resourceId ||
        (u.leaders.length > 0 && r.versions.some((v) => teamIds.has(v.team))),
    )
    .map((r) => r.id);
}
export function scopeData(d: Data, u: Principal): Data {
  if (u.role === "admin") return d;
  const { leaderNames, teams, ids } = visiblePlanningTeamScope(d, u);
  const privateIds = visibleTeamScope(d, u).ids;
  const ownId = u.resourceId || "";
  const managerCanSeePeople = u.role === "manager" && u.leaders.length > 0;
  const assignments = createActualTeamIndex(d.resources);
  const actualOwners = new Set(actualReadOwnerScope(d, u, privateIds));
  const canSeeResourceMonth = (resourceId: string, month: string) => {
    if (!actualOwners.has(resourceId)) return false;
    if (resourceId === ownId) return true;
    if (!month) return false;
    const team = assignments.get(resourceId, month);
    return team !== undefined && privateIds.has(team);
  };
  const canSeeActual = (key: string, kind: "actual" | "workedHours") => {
    const parts = key.split("|"),
      resourceId = parts[0],
      month = parts[kind === "actual" ? 2 : 1];
    return canSeeResourceMonth(resourceId, month);
  };
  const actualEntries = (
    entries: Record<string, number> | undefined,
    kind: "actual" | "workedHours",
  ) => filterOwnRecords(entries, (key) => canSeeActual(key, kind));
  const canSeePersonDay = (key: string) => {
    return canReadPersonalCalendar(u, key.split("|")[0]);
  };
  // Keep the existing ordinary-then-risk revision order with one enumeration.
  const riskKeys: string[] = [];
  const revisions = filterOwnRecords(d.revisions, (key) => {
    if (key.startsWith("risk:")) {
      riskKeys.push(key);
      return false;
    }
    return key.startsWith("allocation:")
      ? canSeePlanningRevision(u, key.slice(11).split("|")[0], ids)
      : key.startsWith("actual:")
        ? canSeeActual(key.slice(7), "actual")
        : key.startsWith("workedHours:")
          ? canSeeActual(key.slice(12), "workedHours")
          : key.startsWith("personDay:")
            ? canSeePersonDay(key.slice(10))
            : key === "calendar:shared";
  });
  for (const key of riskKeys) revisions[key] = d.revisions[key];

  const personCalendar = filterOwnRecords(d.personCalendar, canSeePersonDay);

  return {
    ...d,
    users: undefined,
    legacyArchive: undefined,
    teams,
    leaders: (d.leaders || []).filter((l) => leaderNames.has(l)),
    leaderParents: visibleLeaderParents(d, leaderNames),
    leadershipUnits: filterOwnRecords(
      d.leadershipUnits,
      (name) => leaderNames.has(name) && ids.has(d.leadershipUnits![name]),
    ),
    leaderManagers: filterOwnRecords(d.leaderManagers, (name) =>
      leaderNames.has(name),
    ),
    resources: d.resources
      .filter((r) => r.id === ownId || r.versions.some((v) => ids.has(v.team)))
      .map((r) => ({
        ...r,
        name:
          r.id === ownId ||
          (managerCanSeePeople &&
            r.versions.some((v) => privateIds.has(v.team)))
            ? r.name
            : "",
        note: "",
        code: undefined,
        versions: r.versions.map((v) =>
          r.id === ownId || ids.has(v.team)
            ? v
            : {
                effective: v.effective,
                team: "",
                lead: "",
                status: "",
                included: false,
                amount: 0,
                start: "",
                end: "",
              },
        ),
      })),
    allocations: filterOwnRecords(d.allocations, (key) =>
      ids.has(key.split("|")[0]),
    ),
    actualAllocations: actualEntries(d.actualAllocations, "actual"),
    actualWorkedHours: actualEntries(d.actualWorkedHours, "workedHours"),
    actualPercentEntries: actualEntries(d.actualPercentEntries, "actual"),
    personCalendar,
    actualTeamTotals: actualTeamTotalIndex(d, ids, assignments),
    revisions,
    risks: d.risks || [],
  };
}
