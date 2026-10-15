import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  validate,
  effectivePersonHoursInMonth,
  DEFAULT_MONTHLY_HOURS,
} from "../shared/server-domain.ts";

// Only synthetic data. Callers provide a disposable test Store; SQL.js callers
// use os.tmpdir(), while native MSSQL callers must hold the test database lease.
export async function seedBenchmarkStore(
  store,
  size,
  {
    resources = 200,
    actuals = 0,
    percentages = 0,
    calendarDays = 1000,
    auditEvents = 0,
  } = {},
) {
  const { data } = await store.read();
  const teams = data.teams.filter((team) => team.lead);
  // Synthetic members belong to real teams; repeatedly filling a direct
  // leadership unit would create conflicting implicit Leader assignments.
  const resourceTeams = teams.filter((team) => team.kind !== "leadership");
  assert(resourceTeams.length, "Synthetic members require a real team.");
  const months = Array.from(
    { length: 48 },
    (_, i) =>
      `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
  );
  const actualMonths = months.slice(0, 9);
  const projectCount = Math.max(
    Math.ceil(size / (teams.length * months.length)),
    Math.ceil(actuals / (resources * actualMonths.length)),
  );
  data.projects = Array.from({ length: projectCount }, (_, i) => ({
    id: "bench-p" + i,
    name: "Synthetic project " + i,
    start: "2026-01",
    end: "2029-12",
    phases: {},
  }));
  data.resources = Array.from({ length: resources }, (_, i) => {
    const team = resourceTeams[i % resourceTeams.length];
    return {
      id: "bench-r" + i,
      name: "Synthetic resource " + i,
      note: "",
      versions: [
        {
          effective: "2026-01",
          team: team.id,
          lead: team.lead,
          status: "Aktif Çalışan",
          included: true,
          start: "2026-01-01",
          end: "",
          amount: 1,
        },
      ],
    };
  });
  for (let i = 0; i < size; i++) {
    const key =
      teams[i % teams.length].id +
      "|" +
      data.projects[Math.floor(i / (teams.length * months.length))].id +
      "|" +
      months[Math.floor(i / teams.length) % months.length];
    data.allocations[key] = 0.25;
    data.revisions["allocation:" + key] = 1;
  }
  for (let i = 0; i < actuals; i++) {
    const key =
      data.resources[i % resources].id +
      "|" +
      data.projects[Math.floor(i / (resources * actualMonths.length))].id +
      "|" +
      actualMonths[Math.floor(i / resources) % actualMonths.length];
    data.actualAllocations[key] = Math.min(0.01, 0.5 / projectCount);
    data.revisions["actual:" + key] = 1;
  }
  assert.equal(Object.keys(data.allocations).length, size);
  assert.equal(Object.keys(data.actualAllocations).length, actuals);
  for (let i = 0; i < calendarDays; i++) {
    const date = new Date(
      Date.UTC(2026, 0, 1 + Math.floor(i / data.resources.length)),
    )
      .toISOString()
      .slice(0, 10);
    data.personCalendar[
      data.resources[i % data.resources.length].id + "|" + date + "|leave"
    ] = { type: "leave", hours: 0.5, label: "" };
  }
  const hours = new Map();
  for (const key of Object.keys(data.actualAllocations).slice(0, percentages)) {
    const [resourceId, , month] = key.split("|");
    const personMonth = resourceId + "|" + month;
    if (!hours.has(personMonth))
      hours.set(
        personMonth,
        effectivePersonHoursInMonth(
          month,
          resourceId,
          undefined,
          data.workCalendar,
          data.personCalendar,
        ),
      );
    const worked = hours.get(personMonth);
    data.actualPercentEntries[key] = worked
      ? ((data.actualAllocations[key] * DEFAULT_MONTHLY_HOURS) / worked) * 100
      : 0;
  }
  const valid = validate(data);
  await store.transaction(async (c) => {
    const before = (await store.read(c)).data;
    await store.persist(before, valid, c);
    await c.query("UPDATE kp_settings SET person_calendar=@p0 WHERE id=1", [
      JSON.stringify(valid.personCalendar),
    ]);
    await c.upsert(
      "audit_events",
      Array.from({ length: auditEvents }, () => ({
        id: randomUUID(),
        occurred_at: "2026-01-01T00:00:00.000Z",
        actor_id: "bench-admin",
        actor_name: "Synthetic admin",
        kind: "allocation",
        record_id: "synthetic",
        record_name: "Synthetic history",
        action: "update",
        changes: '[{"path":["amount"],"before":0,"after":0.25}]',
      })),
    );
  });
  return Object.keys(data.allocations)[0];
}
