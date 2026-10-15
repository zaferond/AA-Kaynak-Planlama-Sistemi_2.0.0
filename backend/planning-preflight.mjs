import { parseAllocationKey } from "../shared/allocation-key.ts";

// One fixed parameterized lookup under Store's existing Exclusive transaction.
// This is a staging context, NEVER a snapshot to validate, persist or return.
// Use returned SQL identities verbatim (including legacy case/whitespace), as
// the full reader does; do not manufacture entries under the requested key.
const query = `SELECT t.id AS team_id,t.leader_name,p.id AS project_id,
  a.team_id AS allocation_team_id,a.project_id AS allocation_project_id,
  a.[month] AS allocation_month,a.amount,
  r.record_id AS revision_id,r.revision,s.leader_parents
FROM (SELECT @p0 AS owner_id,@p1 AS project_id,@p2 AS [month],@p3 AS record_id) target
LEFT JOIN kp_teams t ON t.id=target.owner_id
LEFT JOIN kp_projects p ON p.id=target.project_id
LEFT JOIN kp_allocations a ON a.team_id=target.owner_id AND a.project_id=target.project_id AND a.[month]=target.[month]
LEFT JOIN kp_revisions r ON r.kind='allocation' AND r.record_id=target.record_id
LEFT JOIN kp_settings s ON s.id=1`;

export async function readPlanningPreflight(c, id) {
  const parts = parseAllocationKey(id);
  if (!parts) throw Error("Invalid planning preflight key.");
  const { rows } = await c.query(query, [...parts, id]);
  if (rows.length !== 1) throw Error("Planning preflight read was incomplete.");
  const row = rows[0];
  return {
    teams:
      row.team_id == null
        ? []
        : [{ id: row.team_id, lead: row.leader_name || "" }],
    projects: row.project_id == null ? [] : [{ id: row.project_id }],
    resources: [],
    leaderParents: row.leader_parents ? JSON.parse(row.leader_parents) : {},
    allocations:
      row.allocation_team_id == null
        ? {}
        : {
            [row.allocation_team_id +
            "|" +
            row.allocation_project_id +
            "|" +
            row.allocation_month]: row.amount,
          },
    revisions:
      row.revision_id == null
        ? {}
        : {
            ["allocation:" + row.revision_id]: Number(row.revision),
          },
  };
}
