import { ownValue } from "../../../../shared/records";
import { useMemo } from "react";
import { visibleActualInScope } from "../../../../shared/actual-visibility.ts";
import { createActualMonthIndex } from "../../../../shared/actual-months.ts";
import { groupPage } from "../../metrics";
import type { PersonAllocationPanelProps } from "./types";

type Scope = Pick<
  PersonAllocationPanelProps,
  | "data"
  | "teams"
  | "projects"
  | "months"
  | "currentMonth"
  | "selectedPersonIds"
  | "ownResourceId"
  | "monthSummaries"
>;

/** Derives a view of the snapshot; project filters never reduce capacity totals. */
export function useActualAllocationView(
  {
    data,
    teams,
    projects,
    months,
    currentMonth,
    selectedPersonIds,
    ownResourceId,
    monthSummaries,
  }: Scope,
  page: number,
) {
  const teamKey = teams.map((team) => team.id).join("|");
  const monthKey = months.join("|");
  const teamIds = useMemo(
    () => new Set(teams.map((team) => team.id)),
    [teamKey],
  );
  const eligible = useMemo(() => {
    const cells = new Set<string>();
    for (const resource of data.resources)
      for (const month of months)
        if (
          visibleActualInScope(
            resource,
            month,
            currentMonth,
            teamIds,
            ownResourceId,
          )
        )
          cells.add(resource.id + "|" + month);
    return cells;
  }, [data.resources, monthKey, teamIds, currentMonth, ownResourceId]);
  const selected = new Set(selectedPersonIds);
  const people = data.resources
    .filter(
      (resource) =>
        months.some((month) => eligible.has(resource.id + "|" + month)) &&
        (!selected.size || selected.has(resource.id)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const scopeKey =
    projects.map((project) => project.id).join("|") +
    ";" +
    people.map((person) => person.id).join("|") +
    ";" +
    monthKey;
  const pageSize = Math.max(
    20,
    Math.min(100, Math.floor(1200 / months.length)),
  );
  const totalRows = projects.length * Math.max(people.length, 1);
  const visiblePage = Math.min(
    page,
    Math.max(0, Math.ceil(totalRows / pageSize) - 1),
  );
  const groups = groupPage(
    projects.length,
    Math.max(people.length, 1),
    visiblePage,
    pageSize,
  );
  const actualMonths = useMemo(() => {
    const index = createActualMonthIndex(data);
    return {
      ...index,
      get: (id: string, month: string) =>
        ownValue(monthSummaries, id + "|" + month) || index.get(id, month),
    };
  }, [data, monthSummaries]);
  const personMonthTotals: Record<string, number> = {};
  for (const resource of people)
    for (const month of months)
      personMonthTotals[resource.id + "|" + month] = actualMonths.get(
        resource.id,
        month,
      ).totalFte;
  const years = [...new Set(months.map((month) => month.slice(0, 4)))];
  return {
    eligible,
    people,
    scopeKey,
    monthKey,
    pageSize,
    totalRows,
    visiblePage,
    groups,
    actualMonths,
    personMonthTotals,
    years,
  };
}
export type ActualAllocationView = ReturnType<typeof useActualAllocationView>;
