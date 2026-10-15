import { snapshotMetadataReader } from "./snapshot-metadata.mjs";

// Metadata only; never a validated mutation snapshot. The complete Store reader
// and the dedicated read-only report reader share the same SQL-to-model mapping.
export async function readSnapshotMetadata(c, { batch = false, report } = {}) {
  const metadata = await snapshotMetadataReader(c, {
    batch,
    report,
  });
  const s = (await metadata("settings")).rows[0];
  const leaderRows = (await metadata("leaders")).rows;
  const d = {
    teams: [],
    projects: [],
    risks: [],
    riskSystems: (await metadata("riskSystems")).rows,
    resources: [],
    allocations: {},
    actualAllocations: {},
    actualWorkedHours: {},
    actualPercentEntries: {},
    workCalendar: s.calendar_days ? JSON.parse(s.calendar_days) : {},
    personCalendar: s.person_calendar ? JSON.parse(s.person_calendar) : {},
    revisions: {},
    leaderParents: s.leader_parents ? JSON.parse(s.leader_parents) : {},
    leadershipUnits: s.leadership_units ? JSON.parse(s.leadership_units) : {},
    leaders: leaderRows.map((r) => r.name),
    leaderManagers: Object.fromEntries(
      leaderRows
        .filter((r) => r.manager_name)
        .map((r) => [r.name, r.manager_name]),
    ),
    catalogVersion: 2,
  };
  if (!report && s.legacy_archive)
    d.legacyArchive = JSON.parse(s.legacy_archive);
  d.teams = (await metadata("teams")).rows.map((r) => ({
    id: r.id,
    name: r.name,
    lead: r.leader_name || "",
    managerName: r.manager_name || "",
    excelCapacity: r.excel_capacity,
    catalog: !!r.catalog,
    ...(Object.values(d.leadershipUnits).includes(r.id)
      ? { kind: "leadership" }
      : {}),
  }));
  d.projects = (await metadata("projects")).rows.map((r) => ({
    id: r.id,
    name: r.name,
    ...(r.sort_order !== null && r.sort_order !== undefined
      ? { sortOrder: Number(r.sort_order) }
      : {}),
    responsibleName: r.responsible_name || "",
    ...(r.project_code ? { code: r.project_code } : {}),
    start: r.start_month,
    end: r.end_month,
    phases: {},
    phaseColors: {},
    milestones: [],
  }));
  const pm = new Map(d.projects.map((p) => [p.id, p]));
  d.risks = (await metadata("risks")).rows.map((row) =>
    JSON.parse(row.payload),
  );
  for (const r of (await metadata("phases")).rows) {
    const p = pm.get(r.project_id);
    if (r.label !== null) p.phases[r.month] = r.label;
    if (r.color) p.phaseColors[r.month] = r.color;
  }
  for (const r of (await metadata("milestones")).rows) {
    pm.get(r.project_id)?.milestones.push({
      id: r.id,
      name: r.name,
      start: r.start_date || r.start_month + "-01",
      end:
        r.end_date ||
        new Date(
          Date.UTC(
            Number(r.end_month.slice(0, 4)),
            Number(r.end_month.slice(5, 7)),
            0,
          ),
        )
          .toISOString()
          .slice(0, 10),
      barColor: r.bar_color || "red",
      barStyle: r.bar_style || "solid",
      ...(r.display_kind === "milestone" ? { displayKind: "milestone" } : {}),
      ...(r.diamond_style === "outline" ? { diamondStyle: "outline" } : {}),
      ...(Number(r.has_critical_topics) === 0
        ? { hasCriticalTopics: false }
        : {}),
      ...(r.bar_text ? { barText: r.bar_text } : {}),
      ...(r.bar_notes && r.bar_notes !== "[]"
        ? { barNotes: JSON.parse(r.bar_notes) }
        : {}),
      ...(r.extra_ranges && r.extra_ranges !== "[]"
        ? { additionalRanges: JSON.parse(r.extra_ranges) }
        : {}),
    });
  }
  d.resources = (await metadata("resources")).rows.map((r) => ({
    id: r.id,
    name: r.name,
    note: r.note,
    ...(r.code ? { code: r.code } : {}),
    versions: [],
  }));
  const rm = new Map(d.resources.map((r) => [r.id, r]));
  for (const r of (await metadata("resourceVersions")).rows)
    rm.get(r.resource_id).versions.push({
      effective: r.effective_month,
      ...(r.assignment_role ? { assignmentRole: r.assignment_role } : {}),
      team: r.team_id || "",
      lead: r.leader_name || "",
      status: r.status,
      included: !!r.included,
      start: r.start_date || (r.start_month ? r.start_month + "-01" : ""),
      end:
        r.end_date ||
        (r.end_month
          ? new Date(
              Date.UTC(
                Number(r.end_month.slice(0, 4)),
                Number(r.end_month.slice(5, 7)),
                0,
              ),
            )
              .toISOString()
              .slice(0, 10)
          : ""),
      amount: r.amount,
    });
  return { data: d, generation: Number(s.generation) };
}
