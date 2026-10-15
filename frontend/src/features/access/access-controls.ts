import type { Account } from "../../access";
export type AccessControls = {
  busy: boolean;
  selectedId?: string;
  onEdit: (account: Account) => void;
  onAudit: () => void;
  notice: string;
  error: string;
};
