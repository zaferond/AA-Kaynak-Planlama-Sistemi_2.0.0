// One catalog for ordinary reads and the native transaction batch. Queries are
// fixed SELECTs; no submitted identifiers, values or SQL are assembled here.
const metadataQueries = Object.freeze({
  settings: "SELECT * FROM kp_settings WHERE id=1",
  leaders: "SELECT * FROM kp_leaders ORDER BY name",
  riskSystems: "SELECT id,name FROM kp_risk_systems ORDER BY name,id",
  teams: "SELECT * FROM kp_teams ORDER BY id",
  projects:
    "SELECT * FROM kp_projects ORDER BY CASE WHEN sort_order IS NULL THEN 0 ELSE 1 END,sort_order,id",
  risks: "SELECT * FROM kp_project_risks ORDER BY id",
  phases: "SELECT * FROM kp_project_phases",
  milestones:
    "SELECT * FROM kp_project_milestones ORDER BY project_id,sort_order,id",
  resources: "SELECT * FROM kp_resources ORDER BY id",
  resourceVersions:
    "SELECT * FROM kp_resource_versions ORDER BY effective_month",
});

export async function snapshotMetadataReader(
  c,
  { batch = false, report } = {},
) {
  if (report !== undefined && !["actual", "activity"].includes(report))
    throw Error("Unknown read-only report metadata.");
  if (report && batch)
    throw Error("Read-only report metadata cannot use the full batch.");
  const names = Object.keys(metadataQueries);
  if (!batch || typeof c.queryMany !== "function")
    return (name) => {
      if (!Object.hasOwn(metadataQueries, name))
        throw Error("Unknown snapshot metadata query.");
      if (report && name === "risks") return Promise.resolve({ rows: [] });
      if (
        report === "activity" &&
        ["riskSystems", "phases", "milestones"].includes(name)
      )
        return Promise.resolve({ rows: [] });
      if (report && name === "settings")
        return c.query(
          "SELECT generation,calendar_days,person_calendar,leader_parents,leadership_units FROM kp_settings WHERE id=1",
        );
      if (report && name === "resources")
        return c.query("SELECT id,name FROM kp_resources ORDER BY id");
      return c.query(metadataQueries[name]);
    };
  const parts = await c.queryMany(Object.values(metadataQueries));
  if (
    !Array.isArray(parts) ||
    parts.length !== names.length ||
    Array.from(parts).some((part) => !Array.isArray(part?.rows))
  )
    throw Error("SQL snapshot metadata read was incomplete.");
  const pending = new Map(names.map((name, index) => [name, parts[index]]));
  // Owned for this one snapshot only. Release each consumed rowset; never cache
  // metadata across transactions, generations or principals.
  return (name) => {
    if (!pending.has(name))
      throw Error("Unknown or repeated snapshot metadata query.");
    const result = pending.get(name);
    pending.delete(name);
    return Promise.resolve(result);
  };
}
