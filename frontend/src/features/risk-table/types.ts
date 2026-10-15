import type { RefObject } from "react";
import type { Data, Risk, RiskSystem } from "../../model";
export type RiskLeaveGuard = () => Promise<boolean>;
export type RiskUpdate = <K extends keyof Risk>(key: K, value: Risk[K]) => void;
export type RiskTableProps = {
  leaveGuardRef: RefObject<RiskLeaveGuard | null>;
  risks: Risk[];
  systems: RiskSystem[];
  revisions: Record<string, number>;
  onEditingChange: (editing: boolean) => void;
  onReload: () => Promise<Data>;
  selectedProjectIds: string[];
  projectNames: Record<string, string>;
  createSignal: number;
  createRisk: () => Risk;
  canEdit: (risk: Risk) => boolean;
  canDelete: boolean;
  onSave: (risk: Risk, revision: number) => Promise<void>;
  onDelete: (risk: Risk, revision: number) => Promise<void>;
};
export type RiskDraftOptions = Pick<
  RiskTableProps,
  | "leaveGuardRef"
  | "revisions"
  | "onEditingChange"
  | "onReload"
  | "createSignal"
  | "createRisk"
  | "canDelete"
  | "onSave"
  | "onDelete"
>;
