import type { Project, Risk, RiskSystem, Resource, Team } from "./model.ts";
import type { SavedScenario } from "./schedule-shift.ts";
import type { ProgressLock, ProjectProgress } from "./project-progress.ts";
import type { ActualUnit, WorkCalendar, PersonDay } from "./actual-units.ts";
export type ChangeValues = {
  allocation: number;
  actual: number | { unit: ActualUnit; value: number };
  workedHours: number | null;
  calendar: WorkCalendar;
  personDay: PersonDay;
  project: Project;
  risk: Risk;
  riskSystem: RiskSystem;
  resource: Resource;
  team: Team;
  scenario: SavedScenario;
  progress: ProjectProgress;
  progressLock: ProgressLock;
};
export type ChangeKind = keyof ChangeValues;
export type Change<K extends ChangeKind = ChangeKind> = {
  kind: K;
  id: string;
  value: ChangeValues[K] | null;
  revision: number;
  operation?: "delete";
};
