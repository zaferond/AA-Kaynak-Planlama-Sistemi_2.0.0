import { useState, useEffect, useMemo, useRef } from "react";
import { ACTUAL_DEFAULT_PERIOD_MONTHS, DEFAULT_FILTERS } from "../../settings";
import { currentPlanningDate } from "../../resource-dates";
import { monthsFrom } from "../../model";
import type { WorkspaceDensity } from "../WorkspaceNavigation";
import { filterResetNotice, type WorkspaceOptions } from "./workspace-options";
export function useWorkspaceFilters(
  options: WorkspaceOptions,
  tab: string,
  setNotice: (message: string) => void,
) {
  const [leads, setLeads] = useState(options.leads),
    [teamIds, setTeamIds] = useState(options.teamIds),
    [projectIds, setProjectIds] = useState(options.projectIds),
    [start, setStart] = useState(options.start),
    [workspaceCount, setWorkspaceCount] = useState(options.count),
    [actualCount, setActualCount] = useState(ACTUAL_DEFAULT_PERIOD_MONTHS),
    [workspaceDensity, setWorkspaceDensity] = useState<WorkspaceDensity>(
      options.density,
    ),
    [actualDensity, setActualDensity] = useState<WorkspaceDensity>("detail"),
    [view, setView] = useState(options.view),
    [search, setSearch] = useState("");
  const [cells, setCells] = useState<string[]>([]),
    [resourceIds, setResourceIds] = useState<string[]>([]),
    [personIds, setPersonIds] = useState<string[]>([]),
    [planPage, setPlanPage] = useState(0),
    [projectPage, setProjectPage] = useState(0),
    [resourcePage, setResourcePage] = useState(0),
    [showAllActual, setShowAllActual] = useState(false),
    [expandedActualTeams, setExpandedActualTeams] = useState<string[]>([]),
    [showCapacity, setShowCapacity] = useState(true),
    [showProjectDetails, setShowProjectDetails] = useState(false),
    [projectWeekly, setProjectWeekly] = useState(false),
    [showProjectCodes, setShowProjectCodes] = useState(false),
    [filterResetKey, setFilterResetKey] = useState(0);
  const count = tab === "actual" ? actualCount : workspaceCount;
  const setCount = tab === "actual" ? setActualCount : setWorkspaceCount;
  const density = tab === "actual" ? actualDensity : workspaceDensity;
  const setDensity = tab === "actual" ? setActualDensity : setWorkspaceDensity;
  const [todayDate, setTodayDate] = useState(currentPlanningDate);
  const currentMonth = todayDate.slice(0, 7);
  const months = useMemo(() => monthsFrom(start, count), [start, count]);
  const cellSet = useMemo(() => new Set(cells), [cells]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setTodayDate(currentPlanningDate()),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);
  const defaultYearRef = useRef(currentMonth.slice(0, 4));
  useEffect(() => {
    const year = currentMonth.slice(0, 4);
    if (year === defaultYearRef.current) return;
    const previousDefault = defaultYearRef.current + "-01";
    setStart((old) => (old === previousDefault ? year + "-01" : old));
    defaultYearRef.current = year;
  }, [currentMonth]);
  useEffect(() => {
    setCells([]);
    setResourceIds([]);
    setPlanPage(0);
    setProjectPage(0);
    setResourcePage(0);
  }, [leads, teamIds, projectIds, start, count, search, view]);
  function resetFilters() {
    const firstMonth = currentMonth.slice(0, 4) + "-01";
    setDensity("detail");
    setProjectWeekly(false);
    setShowProjectCodes(false);
    setLeads([]);
    setTeamIds([]);
    setProjectIds([]);
    setStart(firstMonth);
    setCount(
      tab === "actual" ? ACTUAL_DEFAULT_PERIOD_MONTHS : DEFAULT_FILTERS.count,
    );
    setSearch("");
    setCells([]);
    setResourceIds([]);
    setPersonIds([]);
    setFilterResetKey((k) => k + 1);
    setNotice(filterResetNotice(tab, firstMonth));
  }
  return {
    leads,
    setLeads,
    teamIds,
    setTeamIds,
    projectIds,
    setProjectIds,
    start,
    setStart,
    count,
    setCount,
    search,
    setSearch,
    view,
    setView,
    density,
    setDensity,
    cells,
    setCells,
    cellSet,
    resourceIds,
    setResourceIds,
    personIds,
    setPersonIds,
    planPage,
    setPlanPage,
    projectPage,
    setProjectPage,
    resourcePage,
    setResourcePage,
    showAllActual,
    setShowAllActual,
    expandedActualTeams,
    setExpandedActualTeams,
    showCapacity,
    setShowCapacity,
    showProjectDetails,
    setShowProjectDetails,
    projectWeekly,
    setProjectWeekly,
    showProjectCodes,
    setShowProjectCodes,
    filterResetKey,
    resetFilters,
    todayDate,
    currentMonth,
    months,
  };
}
