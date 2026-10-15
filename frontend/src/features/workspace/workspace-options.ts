import {
  PLANNING_PERIODS,
  validPlanningMonth,
  clampFilterStart,
} from "../../../../shared/planning-dates.ts";
import { monthLabel } from "../../format.ts";
import type { WorkspaceDensity } from "../WorkspaceNavigation";
import { ACTUAL_DEFAULT_PERIOD_MONTHS } from "../../settings.ts";

export type WorkspaceFilterValues = {
  leads: string[];
  teamIds: string[];
  projectIds: string[];
  start: string;
  count: number;
  view: string;
  density: WorkspaceDensity;
};
export type WorkspaceOptions = WorkspaceFilterValues & { fullPlan: boolean };
export function readWorkspaceOptions(
  search: string,
  defaults: { start: string; count: number },
): WorkspaceOptions {
  const query = new URLSearchParams(search);
  const fullPlan = query.get("allocation") === "full";
  const start = query.get("start"),
    count = Number(query.get("count")),
    density = query.get("density");
  return {
    fullPlan,
    start:
      fullPlan && start && validPlanningMonth(start)
        ? clampFilterStart(start)
        : defaults.start,
    count:
      fullPlan && PLANNING_PERIODS.includes(count) ? count : defaults.count,
    density:
      fullPlan && (density === "compact" || density === "overview")
        ? density
        : "detail",
    view: fullPlan && query.get("view") === "team" ? "team" : "project",
    leads: fullPlan ? query.getAll("lead") : [],
    teamIds: fullPlan ? query.getAll("team") : [],
    projectIds: fullPlan ? query.getAll("project") : [],
  };
}
export function planWorkspacePath(
  href: string,
  filters: WorkspaceFilterValues,
) {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("allocation", "full");
  url.searchParams.set("view", filters.view);
  url.searchParams.set("start", filters.start);
  url.searchParams.set("count", String(filters.count));
  url.searchParams.set("density", filters.density);
  for (const lead of filters.leads) url.searchParams.append("lead", lead);
  for (const team of filters.teamIds) url.searchParams.append("team", team);
  for (const project of filters.projectIds)
    url.searchParams.append("project", project);
  return url.pathname + url.search;
}
export function filterResetNotice(tab: string, firstMonth: string) {
  return tab === "actual"
    ? "Filtreler sıfırlandı: " +
        monthLabel(firstMonth) +
        " · " +
        ACTUAL_DEFAULT_PERIOD_MONTHS +
        " ay."
    : tab === "resources"
      ? "Filtreler sıfırlandı: tüm liderlikler ve takımlar · " +
        monthLabel(firstMonth) +
        "."
      : tab === "overview"
        ? "Filtreler sıfırlandı: tüm liderlikler ve takımlar · " +
          monthLabel(firstMonth) +
          " · 12 ay."
        : tab === "projects"
          ? "Filtreler sıfırlandı: tüm projeler · " +
            monthLabel(firstMonth) +
            " · 12 ay."
          : "Filtreler sıfırlandı: tüm liderlikler, takımlar ve projeler · " +
            monthLabel(firstMonth) +
            " · 12 ay.";
}
