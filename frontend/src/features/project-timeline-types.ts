import type { MouseEvent } from "react";
import type { Milestone, Project } from "../model";
import type { TimelinePeriod } from "../timeline-periods";
import type { milestoneRanges } from "../milestone-ranges";
import type { milestoneBarsForPeriods } from "../milestone-bars";
import type { weeklyNoteLayout } from "../weekly-note-bars";
import type { usePhaseGrid } from "./usePhaseGrid";
import type { useProjectRowOrder } from "./useProjectRowOrder";
import type { ProjectSnapshot } from "./project-snapshot";

export type ProjectTimelineRowProps = {
  ordering: ReturnType<ReturnType<typeof useProjectRowOrder>["rowProps"]>;
  phaseSelection: ReturnType<typeof usePhaseGrid>;
  project: Project;
  projectRevision: number;
  periods: TimelinePeriod[];
  density: "detail" | "compact" | "overview";
  expandAllDetails: boolean;
  showCodes?: boolean;
  windowKey?: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  isAdmin: boolean;
  saving: boolean;
  onProjectInfo: () => void;
  onPhaseClick: (month: string) => void;
  onPhaseContextMenu: (
    event: MouseEvent<HTMLButtonElement>,
    month: string,
  ) => void;
  onAddMilestone: () => void;
  onEditMilestone: (milestone: Milestone) => void;
  onDeleteMilestone: (milestone: Milestone) => void;
  onReorderMilestone: (
    sourceId: string,
    targetId: string,
    after: boolean,
  ) => void;
  onMilestoneContextMenu: (
    event: MouseEvent<HTMLButtonElement>,
    milestone: Milestone,
    rangeIndex: number,
  ) => void;
  onChangeMilestoneRange: (
    snapshot: ProjectSnapshot,
    milestoneId: string,
    rangeIndex: number,
    mode: "move" | "start" | "end",
    days: number,
  ) => Promise<void>;
  onChangeMilestoneNote: (
    snapshot: ProjectSnapshot,
    milestoneId: string,
    rangeIndex: number,
    noteIndex: number,
    mode: "move" | "start" | "end",
    days: number,
  ) => Promise<void>;
};

export type MilestoneTrackProps = Pick<
  ProjectTimelineRowProps,
  | "isAdmin"
  | "saving"
  | "projectRevision"
  | "onEditMilestone"
  | "onMilestoneContextMenu"
  | "onChangeMilestoneRange"
  | "onChangeMilestoneNote"
> & {
  project: Project;
  milestone: Milestone;
  ranges: ReturnType<typeof milestoneRanges>;
  bars: ReturnType<typeof milestoneBarsForPeriods>;
  periods: TimelinePeriod[];
  weeklyLayout: ReturnType<typeof weeklyNoteLayout> | null;
};
