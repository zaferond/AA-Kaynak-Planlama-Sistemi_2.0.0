import type { Data, Project, Resource, Team } from "../../model";
import type { ActualEntry } from "../actual-allocation-commands";

export type PersonAllocationPanelProps = {
  data: Data;
  loading?: boolean;
  user: import("../../access").Principal;
  monthSummaries?: Record<
    string,
    import("../../../../shared/actual-months").ActualMonthSummary
  >;
  teams: Team[];
  projects: Project[];
  months: string[];
  currentMonth: string;
  todayDate: string;
  selectedPersonIds: string[];
  canEditCalendar: boolean;
  sharedCalendarOpen: boolean;
  onSharedCalendarClose: () => void;
  ownResourceId?: string;
  onSaved: (data: Data) => void;
};
export type ActualCellSelection = {
  key: string;
  resourceId: string;
  month: string;
};
export type ActualPhaseDetail = { project: Project; month: string };
export type ActualCalendarMode = "shared" | "personal" | null;
export type ActualAllocationSave = (
  resource: Resource,
  project: Project,
  month: string,
  entry: ActualEntry,
) => Promise<void>;
export type WorkedHoursSave = (
  resource: Resource,
  month: string,
  hours: number | null,
  input: HTMLInputElement | null,
) => Promise<boolean>;
