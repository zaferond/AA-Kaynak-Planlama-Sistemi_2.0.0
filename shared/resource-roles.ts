import { ownValue } from "./records.ts";
import {
  isActualStatus,
  versionAt,
  type Data,
  type Version,
  type ResourceRole,
} from "./model.ts";
import {
  currentPlanningDate,
  normalizeResourceDate,
} from "./resource-dates.ts";

export const resourceRoleLabels: Record<ResourceRole, string> = {
  leader: "Lider",
  productOwner: "Product Owner",
  member: "Team Member",
  coe: "CoE",
};
/** Old direct-leadership assignments remain leaders without rewriting their history. */
export function resourceRole(
  data: Pick<Data, "teams">,
  version: Version,
): ResourceRole {
  return (
    version.assignmentRole ||
    (data.teams.find((team) => team.id === version.team)?.kind === "leadership"
      ? "leader"
      : "member")
  );
}
export function assertResourceRole(
  data: Pick<Data, "teams" | "leaders">,
  version: Version,
) {
  if (!version.assignmentRole) return; // Legacy, unassigned import records retain their existing validation.
  const team = data.teams.find((team) => team.id === version.team);
  if (
    !team ||
    (version.assignmentRole === "leader" && !version.lead) ||
    (!!version.lead && !data.leaders?.includes(version.lead)) ||
    (team.lead || "") !== (version.lead || "")
  )
    throw Error("Kaynak rolü için geçerli liderlik ve birim seçin.");
  if (
    version.assignmentRole === "leader"
      ? team.kind !== "leadership"
      : team.kind === "leadership"
  )
    throw Error(
      version.assignmentRole === "leader"
        ? "Lider doğrudan liderlik satırına atanmalıdır."
        : "Product Owner, Team Member ve CoE için takım seçimi zorunludur.",
    );
}
/** Names are a projection of current employment, never a manually synchronized copy.
 * Planning inclusion and account permissions do not determine organisational responsibility.
 */
export function directoryResponsibilityIndex(
  data: Pick<Data, "teams" | "resources">,
  date = currentPlanningDate(),
) {
  const teams = new Map(data.teams.map((team) => [team.id, team]));
  const leaders = new Map<string, Set<string>>(),
    owners = new Map<string, Set<string>>();
  for (const resource of data.resources) {
    const version = versionAt(resource, date.slice(0, 7));
    const team = version && teams.get(version.team);
    if (
      !version ||
      !team ||
      !isActualStatus(version.status) ||
      !resource.name.trim() ||
      (version.start && normalizeResourceDate(version.start, "start") > date) ||
      (version.end && normalizeResourceDate(version.end, "end") < date)
    )
      continue;
    const role =
      version.assignmentRole ||
      (team.kind === "leadership" ? "leader" : "member");
    const target =
      role === "leader" && team.kind === "leadership"
        ? leaders
        : role === "productOwner" && team.kind !== "leadership"
          ? owners
          : undefined;
    const key = role === "leader" ? team.lead : team.id;
    if (!target || !key) continue;
    if (!target.has(key)) target.set(key, new Set());
    target.get(key)!.add(resource.name.trim());
  }
  const names = (map: Map<string, Set<string>>) =>
    Object.fromEntries(
      [...map].map(([key, values]) => [
        key,
        [...values].sort((a, b) => a.localeCompare(b, "tr")).join(", "),
      ]),
    );
  return { leaders: names(leaders), teams: names(owners) };
}

/** Read-only planning labels, derived before personal resource redaction. */
export function planningUnitManagerIndex(
  data: Pick<Data, "teams" | "resources">,
  date = currentPlanningDate(),
) {
  const responsibility = directoryResponsibilityIndex(data, date);
  return Object.fromEntries(
    data.teams.map((team) => [
      team.id,
      (team.kind === "leadership"
        ? ownValue(responsibility.leaders, team.lead)
        : ownValue(responsibility.teams, team.id)) || "",
    ]),
  );
}

export const LEADER_CONFLICT = "LEADER_CONFLICT";
export class LeaderConflictError extends Error {
  readonly status = 400;
  readonly code = LEADER_CONFLICT;
  constructor(ownerName: string) {
    super(
      `Bu liderlikte ${ownerName} kişisi Lider olarak atanmış durumdadır. Bu kişi Lider olarak atanamaz.`,
    );
    this.name = "LeaderConflictError";
  }
}
export function isResponsibilityConflictCode(code: unknown): boolean {
  return code === PRODUCT_OWNER_CONFLICT || code === LEADER_CONFLICT;
}
export function isResponsibilityConflict(error: unknown): error is Error {
  return (
    error instanceof Error &&
    "code" in error &&
    isResponsibilityConflictCode(error.code)
  );
}
export const PRODUCT_OWNER_CONFLICT = "PRODUCT_OWNER_CONFLICT";
export class ProductOwnerConflictError extends Error {
  readonly status = 400;
  readonly code = PRODUCT_OWNER_CONFLICT;
  constructor(ownerName: string) {
    super(
      `Bu birimde ${ownerName} kişisi Product Owner olarak atanmış durumdadır. Bu kişi Product Owner olarak atanamaz.`,
    );
    this.name = "ProductOwnerConflictError";
  }
}
export function isProductOwnerConflict(error: unknown): error is Error {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === PRODUCT_OWNER_CONFLICT
  );
}
type PreviousVersions = ReadonlyMap<string, ReadonlyMap<string, Version>>;
/** One owner per real team over intersecting effective/employment periods. Both
 * future reservations and historic changes are checked; adjacent handovers are valid.
 * Called after complete snapshot normalization, inside Store's write transaction.
 */
function assertUniqueResponsibility(
  data: Pick<Data, "resources" | "teams">,
  previous: PreviousVersions | undefined,
  role: "leader" | "productOwner",
) {
  const byTeam = new Map<
    string,
    { id: string; name: string; from: string; to: string; changed: boolean }[]
  >();
  const teams = new Map(data.teams.map((team) => [team.id, team]));
  function interval(versions: Version[], index: number) {
    const version = versions[index],
      next = versions[index + 1];
    return {
      from: [
        version.effective + "-01",
        normalizeResourceDate(version.start, "start") || "0000-01-01",
      ]
        .sort()
        .at(-1)!,
      to: [
        next
          ? new Date(Date.parse(next.effective + "-01T12:00:00Z") - 86400000)
              .toISOString()
              .slice(0, 10)
          : "9999-12-31",
        normalizeResourceDate(version.end, "end") || "9999-12-31",
      ].sort()[0],
    };
  }
  function responsibilityKey(version: Version) {
    const team = teams.get(version.team);
    if (!team || !isActualStatus(version.status)) return undefined;
    if (role === "leader")
      return resourceRole(data, version) === "leader" &&
        team.kind === "leadership"
        ? team.lead
        : undefined;
    return version.assignmentRole === "productOwner" &&
      team.kind !== "leadership"
      ? team.id
      : undefined;
  }
  // Existing legacy overlaps must not prevent unrelated saves. Only overlap
  // already covered by BOTH previous assignments is retained; new/wider overlap fails.
  function previouslyCovered(
    id: string,
    key: string,
    from: string,
    to: string,
  ) {
    const versions = [...(previous?.get(id)?.values() || [])].sort((a, b) =>
      a.effective.localeCompare(b.effective),
    );
    let through = "";
    for (let i = 0; i < versions.length; i++) {
      if (responsibilityKey(versions[i]) !== key) continue;
      const old = interval(versions, i);
      if (old.from > old.to || old.to < from) continue;
      const contiguous = !through
        ? old.from <= from
        : old.from <=
          new Date(Date.parse(through + "T12:00:00Z") + 86400000)
            .toISOString()
            .slice(0, 10);
      if (!contiguous) return false;
      through = old.to > through ? old.to : through;
      if (through >= to) return true;
    }
    return false;
  }
  for (const person of data.resources) {
    const versions = [...person.versions].sort((a, b) =>
      a.effective.localeCompare(b.effective),
    );
    versions.forEach((version, index) => {
      const key = responsibilityKey(version);
      if (!key) return;
      const { from, to } = interval(versions, index);
      if (from > to) return;
      const prior = previous?.get(person.id)?.get(version.effective);
      const changed =
        !prior ||
        ["assignmentRole", "team", "status", "start", "end"].some(
          (key) =>
            prior[key as keyof Version] !== version[key as keyof Version],
        );
      const entries = byTeam.get(key) || [];
      const conflict = entries.find(
        (entry) =>
          entry.id !== person.id &&
          entry.from <= to &&
          from <= entry.to &&
          !(
            role === "leader" &&
            previous &&
            previouslyCovered(
              entry.id,
              key,
              entry.from > from ? entry.from : from,
              entry.to < to ? entry.to : to,
            ) &&
            previouslyCovered(
              person.id,
              key,
              entry.from > from ? entry.from : from,
              entry.to < to ? entry.to : to,
            )
          ),
      );
      if (conflict)
        throw new (
          role === "leader" ? LeaderConflictError : ProductOwnerConflictError
        )(conflict.changed && !changed ? person.name : conflict.name);
      entries.push({ id: person.id, name: person.name, from, to, changed });
      byTeam.set(key, entries);
    });
  }
}

export function assertUniqueProductOwners(
  data: Pick<Data, "resources" | "teams">,
  previous?: PreviousVersions,
) {
  assertUniqueResponsibility(data, previous, "productOwner");
}
export function assertUniqueLeadershipLeaders(
  data: Pick<Data, "resources" | "teams">,
  previous?: PreviousVersions,
) {
  assertUniqueResponsibility(data, previous, "leader");
}
export function assertUniqueResourceResponsibilities(
  data: Pick<Data, "resources" | "teams">,
  previous?: PreviousVersions,
) {
  assertUniqueProductOwners(data, previous);
  assertUniqueLeadershipLeaders(data, previous);
}
