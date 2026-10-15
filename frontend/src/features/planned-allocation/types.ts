import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Data, Team, Project } from "../../model";
import type { Metric } from "../../metrics";
import type { usePlannedGrid } from "../usePlannedGrid";
import type { ProjectTimelineActions } from "../ProjectTimelinePanel";
type PlanningGrid = Pick<
  ReturnType<typeof usePlannedGrid>,
  | "planCellWritable"
  | "startPlanDrag"
  | "openPlanMenu"
  | "firstSelectedPlanCell"
  | "fillSelectedPlanCells"
  | "completePlanEntry"
>;
export type PlannedAllocationProps = {
  data: Data;
  teams: Team[];
  projects: Project[];
  months: string[];
  view: string;
  density: "detail" | "compact" | "overview";
  todayDate: string;
  currentMonth: string;
  labelWidth: number;
  monthWidth: number;
  page: number;
  pageSize: number;
  groups: { outer: number; inners: number[] }[];
  onPageChange: (page: number) => void;
  showCapacity: boolean;
  onCapacityChange: (open: boolean) => void;
  capacityFilters: { label: string; values: string[]; active: boolean }[];
  metric: (ids: string[], month: string) => Metric;
  projectIds: string[];
  projectTotals: Record<string, number>;
  actualTotals: Record<string, number>;
  showAllActual: boolean;
  onShowAllActualChange: (show: boolean) => void;
  expandedActualTeams: string[];
  onExpandedTeamsChange: Dispatch<SetStateAction<string[]>>;
  currentTeamMembers: Record<string, string[]>;
  cells: string[];
  grid: PlanningGrid;
  planTableRef: RefObject<HTMLTableElement | null>;
  capacityTableRef: RefObject<HTMLTableElement | null>;
  onSaveAllocation: (id: string, value: number) => Promise<void>;
  onPhaseClick: ProjectTimelineActions["onPhaseClick"];
  onPhaseContextMenu: ProjectTimelineActions["onPhaseContextMenu"];
};
