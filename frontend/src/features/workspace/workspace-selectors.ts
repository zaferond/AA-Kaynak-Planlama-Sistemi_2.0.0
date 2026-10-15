import { orderedLeaderships } from "../../../../shared/leadership-hierarchy.ts";
import {
  orderedPlanningUnits,
  leadershipScopedUnits,
} from "../../../../shared/leadership-planning.ts";
import { topLevelReportGroups } from "../resource-report-groups.ts";
import type { Data, Team, Project } from "../../model.ts";
import type { Principal } from "../../access.ts";
import { visibleActualInScope } from "../../../../shared/actual-visibility.ts";
import { groupPage, sumCapacityMetrics, type Metric } from "../../metrics.ts";
import { monthLabel } from "../../format.ts";
import { type WorkspaceFilterValues } from "./workspace-options.ts";
export function selectWorkspaceScope(
  data: Data | null,
  user: Principal | null,
  {
    leads,
    teamIds,
    projectIds,
    start,
    months,
    currentMonth,
  }: Pick<
    WorkspaceFilterValues,
    "leads" | "teamIds" | "projectIds" | "start"
  > & {
    months: string[];
    currentMonth: string;
  },
) {
  const allLeads = data?.leaders || [];
  const availableUnits = data
    ? leadershipScopedUnits(data, data.teams, leads)
    : [];
  const availableTeams = availableUnits.filter(
    (team) => team.kind !== "leadership",
  );
  const filteredTeams = availableUnits.filter(
    (t) => !teamIds.length || teamIds.includes(t.id),
  );
  const teams = data?.leadershipUnits
    ? orderedPlanningUnits(data, filteredTeams)
    : filteredTeams;
  const projects =
    data?.projects.filter(
      (p) => !projectIds.length || projectIds.includes(p.id),
    ) || [];
  const ids = teams.map((t) => t.id);
  const actualTeamIds = new Set(ids);
  const leaderReportGroups = topLevelReportGroups(data || {}, teams);
  const teamReportGroups = teams.map((t) => ({ name: t.name, ids: [t.id] }));
  const availablePeople =
    data?.resources
      .filter(
        (r) =>
          !!r.name &&
          months.some((m) => {
            return !!visibleActualInScope(
              r,
              m,
              currentMonth,
              actualTeamIds,
              user?.role !== "admin" ? user?.resourceId : undefined,
            );
          }),
      )
      .map((r) => ({ id: r.id, name: r.name })) || [];
  const capacityFilters = [
    { label: "Liderlik", values: leads, active: leads.length > 0 },
    {
      label: "Takım",
      values: teamIds.map(
        (id) => data?.teams.find((t) => t.id === id)?.name || id,
      ),
      active: teamIds.length > 0,
    },
    {
      label: "Proje",
      values: projectIds.map(
        (id) => data?.projects.find((p) => p.id === id)?.name || id,
      ),
      active: projectIds.length > 0,
    },
    { label: "Başlangıç Ayı", values: [monthLabel(start)], active: true },
  ];
  const leaderItems = orderedLeaderships(data || {});
  const leaderFilterItems = leaderItems;
  return {
    allLeads,
    leaderFilterItems,
    leaderItems,
    availableTeams,
    teams,
    projects,
    ids,
    leaderReportGroups,
    teamReportGroups,
    availablePeople,
    capacityFilters,
  };
}
export function workspaceMetric(
  cache: Record<string, Metric>,
  tids: string[],
  month: string,
): Metric {
  return sumCapacityMetrics(cache, tids, month);
}
export function selectWorkspacePages(
  teams: Team[],
  projects: Project[],
  {
    count,
    view,
    planPage,
    projectPage,
  }: { count: number; view: string; planPage: number; projectPage: number },
) {
  const planPageSize = Math.max(1, teams.length * projects.length);
  const effectivePlanPage = 0;
  const planGroups = groupPage(
    view === "team" ? teams.length : projects.length,
    view === "team" ? projects.length : teams.length,
    0,
    planPageSize,
  );
  const effectiveProjectPage = 0;
  const visiblePlanRows = planGroups.flatMap((group) =>
    group.inners.map((index) =>
      view === "team"
        ? teams[group.outer].id + "|" + projects[index].id
        : teams[index].id + "|" + projects[group.outer].id,
    ),
  );
  return {
    planPageSize,
    effectivePlanPage,
    planGroups,
    effectiveProjectPage,
    visiblePlanRows,
  };
}
