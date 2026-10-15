import { activityQuery } from "./activity-report.mjs";
import { scopeData, allowedActualTeam } from "../shared/access.ts";
import {
  employeeAssignment,
  createEmployeeAssignmentIndex,
} from "../shared/employee-directory.ts";
import { selectedLeadershipScope } from "../shared/leadership-planning.ts";
import { visibleLeaderParents } from "../shared/leadership-hierarchy.ts";
import { resourceRole } from "../shared/resource-roles.ts";
import {
  actualVersionAt,
  monthsFrom,
  isWorkingStatus,
} from "../shared/model.ts";
import {
  currentPlanningDate,
  normalizeResourceDate,
} from "../shared/resource-dates.ts";
import { createActualMonthIndex } from "../shared/actual-months.ts";
import { filterOwnRecords } from "../shared/records.ts";

export const actualViewQuery = activityQuery.pick({ start: true, count: true });

/** Read scope only. Existing command authorization remains authoritative. */
export function actualViewTeams(data, user, date = currentPlanningDate()) {
  if (user.role === "admin") return data.teams;
  const ids =
    user.role === "manager" && user.leaders.length
      ? new Set(
          data.teams
            .filter((team) => allowedActualTeam(data, user, team.id))
            .map((team) => team.id),
        )
      : new Set();
  const own = employeeAssignment(data, user.resourceId || "", date.slice(0, 7));
  if (
    own &&
    isWorkingStatus(own.version.status) &&
    (!own.version.start ||
      normalizeResourceDate(own.version.start, "start") <= date) &&
    (!own.version.end || normalizeResourceDate(own.version.end, "end") >= date)
  ) {
    if (resourceRole(data, own.version) === "leader" && own.team.lead) {
      const leaders = selectedLeadershipScope(data, [own.team.lead], true);
      for (const team of data.teams)
        if (leaders.has(team.lead)) ids.add(team.id);
    } else ids.add(own.team.id);
  }
  return data.teams.filter((team) => ids.has(team.id));
}

export function actualViewResources(data, user, teams, currentMonth) {
  const ids = new Set(teams.map((team) => team.id));
  const assignments = createEmployeeAssignmentIndex(data, currentMonth);
  return data.resources.filter(
    (resource) =>
      resource.id === (user.resourceId || "") ||
      ids.has(assignments.get(resource.id)?.team.id),
  );
}

/** Peers receive monthly totals, never colleagues' private calendar entries. */
export function actualView(data, user, query, date = currentPlanningDate()) {
  const currentMonth = date.slice(0, 7);
  const teams = actualViewTeams(data, user, date);
  const ids = new Set(teams.map((team) => team.id));
  const months = monthsFrom(query.start, query.count).filter(
    (month) => month <= currentMonth,
  );
  const monthSet = new Set(months);
  const ownId = user.resourceId || "";
  // This endpoint edits actual work/calendars, never planned allocations or
  // risks. Do not project their values/revisions through this read-only view.
  const base = scopeData(
    {
      ...data,
      allocations: {},
      revisions: filterOwnRecords(
        data.revisions,
        (key) =>
          key.startsWith("actual:") ||
          key.startsWith("workedHours:") ||
          key.startsWith("personDay:") ||
          key === "calendar:shared",
      ),
    },
    user,
  );
  const resources = actualViewResources(data, user, teams, currentMonth);
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  const canRead = (id, month) =>
    byId.has(id) &&
    monthSet.has(month) &&
    (id === ownId || ids.has(actualVersionAt(byId.get(id), month)?.team));
  const entries = (values, monthIndex) =>
    filterOwnRecords(values, (key) => {
      const parts = key.split("|");
      return canRead(parts[0], parts[monthIndex]);
    });
  const index = createActualMonthIndex(data);
  const monthSummaries = {};
  for (const resource of resources)
    for (const month of months)
      if (canRead(resource.id, month))
        monthSummaries[resource.id + "|" + month] = index.get(
          resource.id,
          month,
        );
  const leaders = [...new Set(teams.map((team) => team.lead).filter(Boolean))];
  return {
    data: {
      ...base,
      users: undefined,
      legacyArchive: undefined,
      risks: [],
      allocations: {},
      actualTeamTotals: {},
      leaderManagers: {},
      leadershipUnits: filterOwnRecords(
        data.leadershipUnits,
        (name) => leaders.includes(name) && ids.has(data.leadershipUnits[name]),
      ),
      teams: teams.map((team) => ({
        id: team.id,
        name: team.name,
        lead: team.lead,
        excelCapacity: 0,
        ...(team.kind === "leadership" ? { kind: "leadership" } : {}),
      })),
      leaders,
      leaderParents: visibleLeaderParents(data, leaders),
      resources: resources.map((resource) => ({
        ...resource,
        note: "",
        code: undefined,
        versions: resource.versions.map((version) =>
          resource.id === ownId || ids.has(version.team)
            ? version
            : {
                effective: version.effective,
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
      // Descendant edits need the current revision even when generic/private
      // calendar scope is narrower. Keep optimistic locking authoritative.
      revisions: {
        ...filterOwnRecords(base.revisions, (key) => {
          if (key.startsWith("actual:")) {
            const parts = key.slice(7).split("|");
            return canRead(parts[0], parts[2]);
          }
          if (key.startsWith("workedHours:")) {
            const parts = key.slice(12).split("|");
            return canRead(parts[0], parts[1]);
          }
          return true;
        }),
        ...filterOwnRecords(data.revisions, (key) => {
          if (user.role !== "manager") return false;
          const actual = key.startsWith("actual:");
          const hours = key.startsWith("workedHours:");
          if (!actual && !hours) return false;
          const parts = key.slice(actual ? 7 : 12).split("|");
          const month = parts[actual ? 2 : 1];
          const resource = byId.get(parts[0]);
          const team = resource && actualVersionAt(resource, month)?.team;
          return (
            canRead(parts[0], month) &&
            !!team &&
            allowedActualTeam(data, user, team)
          );
        }),
      },
      actualAllocations: entries(data.actualAllocations, 2),
      actualWorkedHours: entries(data.actualWorkedHours, 1),
      actualPercentEntries: entries(data.actualPercentEntries, 2),
    },
    monthSummaries,
  };
}
