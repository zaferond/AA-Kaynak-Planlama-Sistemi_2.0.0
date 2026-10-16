import { ownValue } from "./records.ts";
import { visibleLeaderParents } from "./leadership-hierarchy.ts";
import type { Data, Resource } from "./model.ts";
import { actualTeamTotalIndex, createActualTeamIndex } from "./model.ts";
import { filterOwnRecords } from "./records.ts";
import { isProjectEditor, projectVisibility } from "./project-access.ts";
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
  /** "Normal-Proje": a normal account that sees only the project screens and
   * has admin rights there (projects, phases, details, critical topics). */
  projectEditor?: boolean;
  active: boolean;
  credential?: Credential;
};
export function isEmployeeResource(resource: Resource) {
  return resource.versions.some((version) => !version.status.includes("İlan"));
}
export const ROOT_ADMIN_ID = "root-admin";
/** Anonymous project id that aggregates actual team totals of hidden projects. */
export const HIDDEN_PROJECT_ID = "~gizli";
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
/** `projectAccessData` decides project visibility when `d` was already reduced
 * for a narrower endpoint (for example without planned allocations). */
export function scopeData(
  d: Data,
  u: Principal,
  { projectAccessData = d }: { projectAccessData?: Data } = {},
): Data {
  if (u.role === "admin") return d;
  const canSeeProject = projectVisibility(projectAccessData, u);
  const hiddenProjects = new Set(
    d.projects
      .filter((project) => !canSeeProject(project.id))
      .map((project) => project.id),
  );
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
    if (kind === "actual" && hiddenProjects.has(parts[1])) return false;
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
    if (key.startsWith("project:")) return isProjectEditor(u);
    // Managers save and update their own delay scenarios.
    if (key.startsWith("scenario:")) return u.role === "manager";
    return key.startsWith("allocation:")
      ? canSeePlanningRevision(u, key.slice(11).split("|")[0], ids) &&
          !hiddenProjects.has(key.slice(11).split("|")[1])
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
  // Hidden projects still count in team capacity: planned values travel as
  // team|month totals, actual team totals under one anonymous project id.
  const hiddenAllocationTotals: Record<string, number> = {};
  const allocations = filterOwnRecords(d.allocations, (key) => {
    const [team, project, month] = key.split("|");
    if (!ids.has(team)) return false;
    if (!hiddenProjects.has(project)) return true;
    const total = team + "|" + month;
    hiddenAllocationTotals[total] =
      (ownValue(hiddenAllocationTotals, total) || 0) + d.allocations[key];
    return false;
  });
  const teamTotals = actualTeamTotalIndex(d, ids, assignments);
  const actualTeamTotals: Record<string, number> = {};
  for (const [key, value] of Object.entries(teamTotals)) {
    const [team, project, month] = key.split("|");
    const target = hiddenProjects.has(project)
      ? team + "|" + HIDDEN_PROJECT_ID + "|" + month
      : key;
    actualTeamTotals[target] =
      (ownValue(actualTeamTotals, target) || 0) + value;
  }

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
    projects: d.projects
      .filter((project) => !hiddenProjects.has(project.id))
      // Viewing rules name colleagues; only admins and project editors see them.
      .map(({ access, ...project }) =>
        isProjectEditor(u) && access ? { ...project, access } : project,
      ),
    allocations,
    ...(Object.keys(hiddenAllocationTotals).length
      ? { hiddenAllocationTotals }
      : {}),
    actualAllocations: actualEntries(d.actualAllocations, "actual"),
    actualWorkedHours: actualEntries(d.actualWorkedHours, "workedHours"),
    actualPercentEntries: actualEntries(d.actualPercentEntries, "actual"),
    personCalendar,
    actualTeamTotals,
    revisions,
    risks: (d.risks || []).filter(
      (risk) => !hiddenProjects.has(risk.projectId),
    ),
    // Delay scenarios are planning tools: managers see those whose projects
    // they can all view, without the undo snapshot; other roles none.
    scheduleScenarios:
      u.role === "manager"
        ? (d.scheduleScenarios || [])
            .filter((s) =>
              s.shifts.every((shift) => !hiddenProjects.has(shift.projectId)),
            )
            .map(({ undo, ...scenario }) => scenario)
        : [],
  };
}
