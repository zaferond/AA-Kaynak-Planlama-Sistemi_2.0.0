import { useMemo } from "react";
import type { Data } from "../../model";
import type { Principal } from "../../access";
import { activeTeamMembers, actualTeamTotalIndex } from "../../model";
import { buildCapacityIndex, projectTotalIndex } from "../../metrics";
import type { WorkspaceFilterValues } from "./workspace-options";
import {
  selectWorkspaceScope,
  selectWorkspacePages,
  workspaceMetric,
} from "./workspace-selectors";
type ViewFilters = WorkspaceFilterValues & {
  months: string[];
  currentMonth: string;
  planPage: number;
  projectPage: number;
};
export function useWorkspaceView(
  data: Data | null,
  user: Principal | null,
  filters: ViewFilters,
) {
  const {
    leads,
    teamIds,
    projectIds,
    start,
    months,
    currentMonth,
    count,
    view,
    planPage,
    projectPage,
  } = filters;
  const scope = useMemo(
    () => selectWorkspaceScope(data, user, filters),
    [data, user, leads, teamIds, projectIds, start, months, currentMonth],
  );
  const currentTeamMembers = useMemo(
    () => (data ? activeTeamMembers(data, currentMonth) : {}),
    [data, currentMonth],
  );
  // Capacity always uses the full authorized snapshot, never the project filter.
  const cache = useMemo(
    () => (data ? buildCapacityIndex(data, months) : {}),
    [data, months],
  );
  const projectTotals = useMemo(
    () => (data ? projectTotalIndex(data, scope.ids, months) : {}),
    [data, scope.ids, months],
  );
  const actualTotals = useMemo(
    () => (data ? data.actualTeamTotals || actualTeamTotalIndex(data) : {}),
    [data],
  );
  const pages = useMemo(
    () => selectWorkspacePages(scope.teams, scope.projects, filters),
    [scope.teams, scope.projects, count, view, planPage, projectPage],
  );
  const metric = (ids: string[], month: string) =>
    workspaceMetric(cache, ids, month);
  return {
    ...scope,
    ...pages,
    currentTeamMembers,
    cache,
    projectTotals,
    actualTotals,
    metric,
  };
}
