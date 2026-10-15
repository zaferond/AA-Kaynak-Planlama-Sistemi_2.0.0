export type AuditValue = string | number | boolean | null;
export type AuditChange = {
  path: string[];
  before: AuditValue;
  after: AuditValue;
};
export type AuditEntry = {
  id: string;
  occurred_at: string;
  actor_id: string;
  actor_name: string;
  kind: string;
  record_id: string;
  record_name: string;
  action: "create" | "update" | "delete";
  changes: AuditChange[];
};
export type AuditPage = { total: number; entries: AuditEntry[] };
