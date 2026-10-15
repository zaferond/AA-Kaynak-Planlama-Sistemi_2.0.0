import { ownValue } from "./records.ts";
import { actualVersionAt, type Data, type Project } from "./model.ts";
import { currentPlanningMonth } from "./resource-dates.ts";
import type { Principal, Role } from "./access.ts";

/** Who may view a restricted project. A project without rules (no `access`,
 * or `access` with every list empty) is visible to every user, as before.
 * Rules are alternatives: matching any one of them is enough. */
export type ProjectAccess = {
  roles: Exclude<Role, "admin">[];
  leaders: string[];
  teams: string[];
  people: string[];
};
export function hasProjectAccessRules(access: ProjectAccess | undefined) {
  return (
    !!access &&
    access.roles.length +
      access.leaders.length +
      access.teams.length +
      access.people.length >
      0
  );
}
export const PROJECT_ACCESS_ROLES = [
  { id: "manager", label: "Yönetici" },
  { id: "normal", label: "Normal Kullanıcı" },
] as const;

type AccessData = Pick<
  Data,
  | "projects"
  | "teams"
  | "resources"
  | "allocations"
  | "actualAllocations"
  | "leaderParents"
>;
type AccessUser = Pick<
  Principal,
  "role" | "resourceId" | "leaders" | "planningTeams"
>;

function withAncestors(
  data: Pick<Data, "leaderParents">,
  names: Iterable<string>,
) {
  const out = new Set<string>();
  for (const name of names) {
    let current: string | undefined = name;
    while (current && !out.has(current)) {
      out.add(current);
      current = ownValue(data.leaderParents, current);
    }
  }
  return out;
}

/** Index of the projects a principal may view. Admins see every project.
 * Besides explicit rules, a project stays visible to teams that hold planned
 * allocations on it and to people with actual entries on it, so nobody loses
 * sight of records they already work with. */
export function projectVisibility(
  data: AccessData,
  user: AccessUser,
  month = currentPlanningMonth(),
) {
  if (user.role === "admin") return (_projectId: string) => true;
  const restricted = data.projects.filter((project) =>
    hasProjectAccessRules(project.access),
  );
  if (!restricted.length) return (_projectId: string) => true;

  const ownResource = user.resourceId
    ? data.resources.find((resource) => resource.id === user.resourceId)
    : undefined;
  const ownTeam = ownResource
    ? actualVersionAt(ownResource, month)?.team
    : undefined;
  const managedLeaders = user.role === "manager" ? user.leaders : [];
  // Leaderships under a manager's grants (the grant itself and its children).
  const underGrant = (lead: string | undefined) => {
    const seen = new Set<string>();
    while (lead && !seen.has(lead)) {
      if (managedLeaders.includes(lead)) return true;
      seen.add(lead);
      lead = ownValue(data.leaderParents, lead);
    }
    return false;
  };
  const teams = new Set<string>(ownTeam ? [ownTeam] : []);
  if (user.role === "manager") {
    for (const team of data.teams)
      if (underGrant(team.lead)) teams.add(team.id);
    for (const id of user.planningTeams || []) teams.add(id);
  }
  const teamLeads = data.teams
    .filter((team) => teams.has(team.id) && team.lead)
    .map((team) => team.lead);
  const leaders = withAncestors(data, [...teamLeads, ...managedLeaders]);

  // People whose records this user already works with (own and managed teams).
  const people = new Set<string>(user.resourceId ? [user.resourceId] : []);
  if (user.role === "manager")
    for (const resource of data.resources) {
      const team = actualVersionAt(resource, month)?.team;
      if (team && teams.has(team)) people.add(resource.id);
    }

  const automatic = new Set<string>();
  const restrictedIds = new Set(restricted.map((project) => project.id));
  for (const [key, value] of Object.entries(data.allocations || {})) {
    const [team, project] = key.split("|");
    if (value && restrictedIds.has(project) && teams.has(team))
      automatic.add(project);
  }
  for (const [key, value] of Object.entries(data.actualAllocations || {})) {
    const [person, project] = key.split("|");
    if (value && restrictedIds.has(project) && people.has(person))
      automatic.add(project);
  }

  const allowed = new Set<string>();
  for (const project of restricted) {
    const access = project.access!;
    if (
      automatic.has(project.id) ||
      access.roles.includes(user.role as Exclude<Role, "admin">) ||
      (!!user.resourceId && access.people.includes(user.resourceId)) ||
      access.teams.some((team) => teams.has(team)) ||
      access.leaders.some((leader) => leaders.has(leader))
    )
      allowed.add(project.id);
  }
  return (projectId: string) =>
    !restrictedIds.has(projectId) || allowed.has(projectId);
}

/** Short summary for the project list and editor. */
export function projectAccessSummary(
  project: Pick<Project, "access">,
  names: {
    leader: (id: string) => string;
    team: (id: string) => string;
    person: (id: string) => string;
  },
) {
  const access = project.access;
  if (!access) return "Herkes";
  const parts = [
    ...access.roles.map(
      (role) =>
        PROJECT_ACCESS_ROLES.find((item) => item.id === role)?.label || role,
    ),
    ...access.leaders.map(names.leader),
    ...access.teams.map(names.team),
    ...access.people.map(names.person),
  ];
  return parts.length ? parts.join(", ") : "Herkes";
}
