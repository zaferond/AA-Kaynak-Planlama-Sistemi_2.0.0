export type EmployeePermission =
  | {
      action: "create";
      directoryId: string;
      role: "normal" | "manager" | "admin";
      leaders: string[];
      planningTeams?: string[];
      resourceId: string;
    }
  | {
      action: "update";
      id: string;
      role: "normal" | "manager" | "admin";
      leaders: string[];
      planningTeams?: string[];
      resourceId: string;
      revision: number;
      reactivate?: boolean;
    }
  | { action: "revoke"; id: string; revision: number };
