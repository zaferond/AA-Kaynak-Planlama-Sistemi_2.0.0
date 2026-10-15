import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { validate } from "../backend/domain/index.mjs";

const admin = { _id: "root-admin", role: "admin", leaders: [] };

test("deleting a project removes its planned and actual details while preserving other projects", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-project-delete-"));
  const env = {
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "plan.sqlite"),
  };
  let store = new Store({ env });
  try {
    await store.connect();
    const initial = (await store.read()).data;
    const team = initial.teams.find((item) => item.lead);
    const month = "2026-09";
    const project = {
      id: "delete_project",
      name: "Silinecek Proje",
      start: "2026-01",
      end: "2026-12",
      phases: { [month]: "Tasarım" },
      milestones: [
        {
          id: "note",
          name: "Kritik Bilgi",
          start: "2026-09-01",
          end: "2026-09-03",
          barNotes: [{ text: "Kontrol", includeInReport: true }],
        },
      ],
    };
    const other = {
      id: "keep_project",
      name: "Korunacak Proje",
      start: "2026-01",
      end: "2026-12",
      phases: {},
    };
    const resource = {
      id: "delete_test_person",
      name: "Deneme Çalışanı",
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
    const plannedKey = `${team.id}|${project.id}|${month}`;
    const otherPlannedKey = `${team.id}|${other.id}|${month}`;
    const actualKey = `${resource.id}|${project.id}|${month}`;
    const otherActualKey = `${resource.id}|${other.id}|${month}`;
    const hoursKey = `${resource.id}|${month}`;
    async function change(changes) {
      await store.transaction(async (c) => {
        const { data } = await store.read(c),
          before = structuredClone(data);
        applyChanges(
          data,
          admin,
          changes.map((item) => ({
            revision: data.revisions[item.kind + ":" + item.id] || 0,
            ...item,
          })),
        );
        await store.persist(before, validate(data), c);
      });
    }
    await change([
      { kind: "project", id: project.id, value: project },
      { kind: "project", id: other.id, value: other },
      { kind: "resource", id: resource.id, value: resource },
      { kind: "workedHours", id: hoursKey, value: 200 },
      { kind: "allocation", id: plannedKey, value: 0.6 },
      { kind: "allocation", id: otherPlannedKey, value: 0.4 },
      { kind: "actual", id: actualKey, value: { unit: "percent", value: 20 } },
      {
        kind: "actual",
        id: otherActualKey,
        value: { unit: "percent", value: 30 },
      },
    ]);
    const before = (await store.read()).data;
    assert.equal(before.actualPercentEntries[actualKey], 20);
    assert.equal(
      before.projects.find((p) => p.id === project.id).milestones.length,
      1,
    );
    await change([{ kind: "project", id: project.id, operation: "delete" }]);
    await store.close();
    store = new Store({ env });
    await store.connect();
    const after = (await store.read()).data;
    assert(!after.projects.some((p) => p.id === project.id));
    assert.equal(after.allocations[plannedKey], undefined);
    assert.equal(after.actualAllocations[actualKey], undefined);
    assert.equal(after.actualPercentEntries[actualKey], undefined);
    assert(after.projects.some((p) => p.id === other.id));
    assert.equal(after.allocations[otherPlannedKey], 0.4);
    assert(after.actualAllocations[otherActualKey] > 0);
    assert.equal(after.actualPercentEntries[otherActualKey], 30);
    assert.equal(after.actualWorkedHours[hoursKey], 200);
    assert(after.resources.some((r) => r.id === resource.id));
    for (const table of [
      "kp_projects",
      "kp_project_phases",
      "kp_project_milestones",
      "kp_allocations",
      "kp_actual_allocations",
      "kp_actual_percent_entries",
    ]) {
      const count = (
        await store.db.query(
          `SELECT count(*) AS count FROM ${table} WHERE ${table === "kp_projects" ? "id" : "project_id"}=@p0`,
          [project.id],
        )
      ).rows[0].count;
      assert.equal(count, 0, `${table} still contains the deleted project`);
    }
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
