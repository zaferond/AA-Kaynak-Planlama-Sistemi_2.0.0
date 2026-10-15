import { dataChanges } from "./change-set.mjs";
import { table, tables, ident } from "./tables.mjs";
import { entityCollections as kinds } from "../shared/entity-kinds.ts";
import { fail } from "./auth.mjs";
import { DIRECTORY_REVISION_KEY } from "../shared/directory-policy.ts";

// SQL persistence only; Store.mutate owns validation, revisions, audit and commit.
export async function persistPlanningSnapshot(
  before,
  next,
  c,
  { settings } = {},
) {
  const removedLeaders = new Set(
    (before.leaders || []).filter((name) => !next.leaders?.includes(name)),
  );
  if (removedLeaders.size) {
    const linked = (
      await c.query("SELECT DISTINCT leader_name FROM kp_user_leaders")
    ).rows.filter((row) => removedLeaders.has(row.leader_name));
    if (linked.length)
      fail(
        409,
        "Kaldırılacak liderlikler mevcut kullanıcı yetkilerinde kullanılıyor: " +
          linked.map((row) => row.leader_name).join(", ") +
          ". Önce Yetki Kontrol Ekranı'ndaki liderlik eşleştirmelerini güncelleyin.",
      );
  }
  const nextTeamIds = new Set(next.teams.map((team) => team.id));
  const removedTeams = new Set(
    before.teams.filter((team) => !nextTeamIds.has(team.id)).map((t) => t.id),
  );
  if (
    removedTeams.size &&
    (
      await c.query("SELECT DISTINCT team_id FROM kp_user_planning_teams")
    ).rows.some((row) => removedTeams.has(row.team_id))
  )
    fail(
      409,
      "Kaldırılacak takım veya liderlik kaynak satırı kullanıcı yetkilerinde kullanılıyor. Önce Çalışan & Yetki Tanımlama ekranından takım yetkisini kaldırın.",
    );
  const changed = dataChanges(before, next, { settings });
  await c.upsert(
    "leaders",
    changed.leader
      .filter((item) => item.value !== undefined)
      .map(({ value }) => ({
        name: value.name,
        manager_name: value.managerName,
      })),
  );
  const up = (kind) =>
    changed[kind].filter((x) => x.value !== undefined).map((x) => x.value);
  await c.upsert("risk_systems", up("riskSystem"));
  await c.remove(
    "risk_systems",
    changed.riskSystem
      .filter((x) => x.value === undefined)
      .map((x) => ({ id: x.id })),
  );
  await c.upsert(
    "teams",
    up("team").map((t) => ({
      id: t.id,
      name: t.name,
      leader_name: t.lead || null,
      manager_name: t.managerName || "",
      excel_capacity: t.excelCapacity,
      catalog: t.catalog !== false,
    })),
  );
  const ps = up("project");
  await c.upsert(
    "projects",
    ps.map((p) => ({
      id: p.id,
      name: p.name,
      responsible_name: p.responsibleName || "",
      project_code: p.code || "",
      sort_order: p.sortOrder ?? null,
      start_month: p.start,
      end_month: p.end,
    })),
  );
  await c.upsert(
    "project_risks",
    up("risk").map((r) => ({
      id: r.id,
      project_id: r.projectId,
      payload: JSON.stringify(r),
    })),
  );
  await c.remove(
    "project_risks",
    changed.risk
      .filter((x) => x.value === undefined)
      .map((x) => ({ id: x.id })),
  );
  const rs = up("resource");
  await c.upsert(
    "resources",
    rs.map((r) => ({
      id: r.id,
      name: r.name,
      note: r.note,
      code: r.code || null,
    })),
  );
  // Replace children for changed parents. Fixed IDs are parameters, never interpolated SQL.
  const clearChildren = async (name, field, ids) => {
    if (!Object.hasOwn(tables[name]?.columns || {}, field))
      throw Error("Unknown child field");
    const values = [...ids];
    for (let offset = 0; offset < values.length; offset += 500) {
      const batch = values.slice(offset, offset + 500);
      await c.query(
        `DELETE FROM ${table(name)} WHERE ${ident(field)} IN (${batch.map((_, i) => "@p" + i).join(",")})`,
        batch,
      );
    }
  };
  if (ps.length) {
    await clearChildren(
      "project_phases",
      "project_id",
      new Set(ps.map((p) => p.id)),
    );
    await c.upsert(
      "project_phases",
      ps.flatMap((p) =>
        [
          ...new Set([
            ...Object.keys(p.phases),
            ...Object.keys(p.phaseColors || {}),
          ]),
        ].map((month) => ({
          project_id: p.id,
          month,
          label: p.phases[month] ?? null,
          color: p.phaseColors?.[month] || null,
        })),
      ),
    );
    await clearChildren(
      "project_milestones",
      "project_id",
      new Set(ps.map((p) => p.id)),
    );
    await c.upsert(
      "project_milestones",
      ps.flatMap((p) =>
        (p.milestones || []).map((milestone, sort_order) => ({
          project_id: p.id,
          id: milestone.id,
          name: milestone.name,
          start_month: milestone.start.slice(0, 7),
          end_month: milestone.end.slice(0, 7),
          start_date: milestone.start,
          end_date: milestone.end,
          bar_color: milestone.barColor || "red",
          bar_style: milestone.barStyle || "solid",
          display_kind: milestone.displayKind || "range",
          diamond_style: milestone.diamondStyle || "solid",
          has_critical_topics: milestone.hasCriticalTopics === false ? 0 : 1,
          bar_text: milestone.barText || "",
          bar_notes: JSON.stringify(milestone.barNotes || []),
          extra_ranges: JSON.stringify(milestone.additionalRanges || []),
          sort_order,
        })),
      ),
    );
  }
  if (rs.length) {
    await clearChildren(
      "resource_versions",
      "resource_id",
      new Set(rs.map((r) => r.id)),
    );
    await c.upsert(
      "resource_versions",
      rs.flatMap((r) =>
        r.versions.map((v) => ({
          resource_id: r.id,
          effective_month: v.effective,
          assignment_role: v.assignmentRole || null,
          team_id: v.team || null,
          leader_name: v.lead || null,
          status: v.status,
          included: v.included,
          start_month: v.start ? v.start.slice(0, 7) : null,
          end_month: v.end ? v.end.slice(0, 7) : null,
          start_date: v.start || null,
          end_date: v.end || null,
          amount: v.amount,
        })),
      ),
    );
  }
  const allocationKey = (id) => {
    const [team_id, project_id, month] = id.split("|");
    return { team_id, project_id, month };
  };
  await c.remove(
    "allocations",
    changed.allocation
      .filter((x) => x.value === undefined)
      .map((x) => allocationKey(x.id)),
  );
  await c.upsert(
    "allocations",
    changed.allocation
      .filter((x) => x.value !== undefined)
      .map((x) => ({ ...allocationKey(x.id), amount: x.value })),
  );
  const actualKey = (id) => {
    const [resource_id, project_id, month] = id.split("|");
    return { resource_id, project_id, month };
  };
  await c.remove(
    "actual_allocations",
    changed.actual
      .filter((x) => x.value === undefined)
      .map((x) => actualKey(x.id)),
  );
  await c.upsert(
    "actual_allocations",
    changed.actual
      .filter((x) => x.value !== undefined)
      .map((x) => ({ ...actualKey(x.id), amount: x.value })),
  );
  const worked = changed.workedHours;
  const workedKey = (id) => {
    const [resource_id, month] = id.split("|");
    return { resource_id, month };
  };
  await c.remove(
    "actual_worked_hours",
    worked.filter((x) => x.value === undefined).map((x) => workedKey(x.id)),
  );
  await c.upsert(
    "actual_worked_hours",
    worked
      .filter((x) => x.value !== undefined)
      .map((x) => ({ ...workedKey(x.id), hours: x.value })),
  );
  const percentages = changed.percent;
  await c.remove(
    "actual_percent_entries",
    percentages
      .filter((x) => x.value === undefined)
      .map((x) => actualKey(x.id)),
  );
  await c.upsert(
    "actual_percent_entries",
    percentages
      .filter((x) => x.value !== undefined)
      .map((x) => ({ ...actualKey(x.id), percent: x.value })),
  );
  for (const kind of ["resource", "project", "team"])
    await c.remove(
      kinds[kind],
      changed[kind]
        .filter((x) => x.value === undefined)
        .map((x) => ({ id: x.id })),
    );
  await c.upsert(
    "revisions",
    Object.keys(next.revisions)
      .filter(
        (k) =>
          !k.startsWith("user:") &&
          next.revisions[k] !== (before.revisions[k] || 0),
      )
      .map((k) => {
        const revision = next.revisions[k];
        if (k === DIRECTORY_REVISION_KEY)
          return {
            kind: "allocation",
            record_id: "@directory:shared",
            revision,
          };
        const i = k.indexOf(":");
        return k.startsWith("riskSystem:")
          ? {
              kind: "allocation",
              record_id: "@riskSystem:" + k.slice(11),
              revision,
            }
          : k.startsWith("risk:")
            ? { kind: "allocation", record_id: "@risk:" + k.slice(5), revision }
            : k.startsWith("actual:")
              ? {
                  kind: "allocation",
                  record_id: "@actual:" + k.slice(7),
                  revision,
                }
              : k.startsWith("workedHours:")
                ? {
                    kind: "allocation",
                    record_id: "@worked:" + k.slice(12),
                    revision,
                  }
                : k.startsWith("calendar:")
                  ? {
                      kind: "allocation",
                      record_id: "@calendar:" + k.slice(9),
                      revision,
                    }
                  : k.startsWith("personDay:")
                    ? {
                        kind: "allocation",
                        record_id: "@person:" + k.slice(10),
                        revision,
                      }
                    : {
                        kind: k.slice(0, i),
                        record_id: k.slice(i + 1),
                        revision,
                      };
      }),
  );
  await c.remove(
    "leaders",
    changed.leader
      .filter((item) => item.value === undefined)
      .map(({ id: name }) => ({ name })),
  );
  return changed;
}
