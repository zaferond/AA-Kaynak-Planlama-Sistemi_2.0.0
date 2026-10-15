import { ownValue } from "../shared/records.ts";

// Fixed identifiers only. Never accept table/column names from an API request.
export const tables = {
  rate_limits: {
    key: ["bucket_hash"],
    columns: {
      bucket_hash: "varchar(64)",
      window_id: "varchar(36)",
      attempts: "int",
      expires_at: "bigint",
    },
  },
  audit_events: {
    key: ["id"],
    columns: {
      id: "varchar(36)",
      occurred_at: "varchar(30)",
      actor_id: "nvarchar(120)",
      actor_name: "nvarchar(150)",
      kind: "varchar(20)",
      record_id: "nvarchar(400)",
      record_name: "nvarchar(300)",
      action: "varchar(10)",
      changes: "nvarchar(max)",
    },
  },
  leaders: {
    key: ["name"],
    columns: { name: "nvarchar(200)", manager_name: "nvarchar(200)" },
  },
  teams: {
    key: ["id"],
    columns: {
      id: "nvarchar(120)",
      name: "nvarchar(200)",
      leader_name: "nvarchar(200)",
      manager_name: "nvarchar(200)",
      excel_capacity: "float",
      catalog: "bit",
    },
  },
  projects: {
    key: ["id"],
    columns: {
      id: "nvarchar(120)",
      name: "nvarchar(200)",
      sort_order: "int",
      responsible_name: "nvarchar(200)",
      project_code: "nvarchar(100)",
      start_month: "varchar(7)",
      end_month: "varchar(7)",
    },
  },
  project_risks: {
    key: ["id"],
    columns: {
      id: "nvarchar(120)",
      project_id: "nvarchar(120)",
      payload: "nvarchar(max)",
    },
  },
  risk_systems: {
    key: ["id"],
    columns: { id: "nvarchar(120)", name: "nvarchar(200)" },
  },
  project_phases: {
    key: ["project_id", "month"],
    columns: {
      project_id: "nvarchar(120)",
      month: "varchar(7)",
      label: "nvarchar(3000)",
      color: "varchar(20)",
    },
  },
  project_milestones: {
    key: ["project_id", "id"],
    columns: {
      project_id: "nvarchar(120)",
      id: "nvarchar(120)",
      name: "nvarchar(200)",
      start_month: "varchar(7)",
      end_month: "varchar(7)",
      start_date: "varchar(10)",
      end_date: "varchar(10)",
      bar_color: "varchar(20)",
      bar_style: "varchar(20)",
      display_kind: "varchar(20)",
      diamond_style: "varchar(20)",
      has_critical_topics: "bit",
      bar_text: "nvarchar(max)",
      bar_notes: "nvarchar(max)",
      extra_ranges: "nvarchar(max)",
      sort_order: "int",
    },
  },
  resources: {
    key: ["id"],
    columns: {
      id: "nvarchar(120)",
      name: "nvarchar(200)",
      note: "nvarchar(max)",
      code: "nvarchar(100)",
    },
  },
  resource_versions: {
    key: ["resource_id", "effective_month"],
    columns: {
      resource_id: "nvarchar(120)",
      effective_month: "varchar(7)",
      assignment_role: "varchar(20)",
      team_id: "nvarchar(120)",
      leader_name: "nvarchar(200)",
      status: "nvarchar(50)",
      included: "bit",
      start_month: "varchar(7)",
      end_month: "varchar(7)",
      start_date: "varchar(10)",
      end_date: "varchar(10)",
      amount: "float",
    },
  },
  allocations: {
    key: ["team_id", "project_id", "month"],
    columns: {
      team_id: "nvarchar(120)",
      project_id: "nvarchar(120)",
      month: "varchar(7)",
      amount: "float",
    },
  },
  actual_allocations: {
    key: ["resource_id", "project_id", "month"],
    columns: {
      resource_id: "nvarchar(120)",
      project_id: "nvarchar(120)",
      month: "varchar(7)",
      amount: "float",
    },
  },
  actual_worked_hours: {
    key: ["resource_id", "month"],
    columns: {
      resource_id: "nvarchar(120)",
      month: "varchar(7)",
      hours: "float",
    },
  },
  actual_percent_entries: {
    key: ["resource_id", "project_id", "month"],
    columns: {
      resource_id: "nvarchar(120)",
      project_id: "nvarchar(120)",
      month: "varchar(7)",
      percent: "float",
    },
  },
  person_allocations: {
    key: ["resource_id", "project_id", "month"],
    columns: {
      resource_id: "nvarchar(120)",
      project_id: "nvarchar(120)",
      month: "varchar(7)",
      amount: "float",
    },
  },
  revisions: {
    key: ["kind", "record_id"],
    columns: {
      kind: "varchar(20)",
      record_id: "nvarchar(400)",
      revision: "bigint",
    },
  },
  users: {
    key: ["id"],
    columns: {
      id: "nvarchar(120)",
      username: "nvarchar(100)",
      name: "nvarchar(150)",
      role: "varchar(10)",
      resource_id: "nvarchar(120)",
      directory_id: "varchar(32)",
      email: "nvarchar(320)",
      auth_source: "varchar(10)",
      active: "bit",
      password_salt: "varchar(100)",
      password_hash: "varchar(200)",
      revision: "bigint",
      version: "bigint",
    },
  },
  user_leaders: {
    key: ["user_id", "leader_name"],
    columns: { user_id: "nvarchar(120)", leader_name: "nvarchar(200)" },
  },
  user_planning_teams: {
    key: ["user_id", "team_id"],
    columns: { user_id: "nvarchar(120)", team_id: "nvarchar(120)" },
  },
  sessions: {
    key: ["token_hash"],
    columns: {
      token_hash: "varchar(64)",
      user_id: "nvarchar(120)",
      user_version: "bigint",
      csrf: "varchar(100)",
      expires_at: "varchar(30)",
    },
  },
  settings: {
    key: ["id"],
    columns: {
      id: "int",
      generation: "bigint",
      legacy_archive: "nvarchar(max)",
      calendar_days: "nvarchar(max)",
      person_calendar: "nvarchar(max)",
      leader_parents: "nvarchar(max)",
      leadership_units: "nvarchar(max)",
    },
  },
};
export const ident = (s) => "[" + s + "]";
export function tableSpec(name) {
  const spec = ownValue(tables, name);
  if (!spec) throw Error("Unknown table");
  return spec;
}
export function table(name) {
  if (name !== "schema_migrations") tableSpec(name);
  return "[kp_" + name + "]";
}
// Validate before OPENJSON casts, which could otherwise truncate long string inputs.
export function validateRows(name, rows) {
  const spec = tableSpec(name);
  for (const row of rows)
    for (const [column, type] of Object.entries(spec.columns)) {
      const v = row[column];
      if (v == null) continue;
      let invalid = false;
      if (type.includes("char")) {
        const n = type.match(/\((\d+)\)/)?.[1];
        invalid = typeof v !== "string" || (n && v.length > Number(n));
      } else if (type === "bit")
        invalid = typeof v !== "boolean" && v !== 0 && v !== 1;
      else
        invalid =
          typeof v !== "number" ||
          !Number.isFinite(v) ||
          (["int", "bigint"].includes(type) && !Number.isSafeInteger(v));
      if (invalid)
        throw Object.assign(
          Error(`Geçersiz alan veya alan uzunluğu: ${name}.${column}`),
          { status: 400 },
        );
    }
}
