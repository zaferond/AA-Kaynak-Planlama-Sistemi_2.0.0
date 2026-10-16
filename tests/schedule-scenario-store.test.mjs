import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { scopeData } from "../shared/access.ts";
import {
  scenarioApplyPlan,
  scenarioRevertPlan,
} from "../shared/schedule-shift.ts";

const scenario = (projectId, extra = {}) => ({
  id: "sc-1",
  name: "+3 ay",
  includeTimeline: true,
  shifts: [{ projectId, months: 3, fromMonth: "2026-10" }],
  status: "draft",
  createdBy: "spoofed",
  createdByName: "Sahte",
  createdAt: "2000-01-01T00:00:00.000Z",
  ...extra,
});

test("saved scenarios: drafts, approval, transfer to the calendar and undo", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-scenario-"));
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
  };
  let store = new Store({ env });
  try {
    await store.connect();
    const password = await hashPassword("Scenario-store-test-1!");
    const account = (id, role, leaders = []) =>
      store.bootstrapUser({
        _id: id,
        username: "qa." + id,
        name: "QA " + id,
        role,
        resourceId: "",
        leaders,
        active: true,
        password,
        version: 1,
        revision: 1,
      });
    await account("root-admin", "admin");
    const admin = await store.findUser({ id: "root-admin" });
    const team = (await store.read()).data.teams.find((t) => t.lead);
    await account("manager", "manager", [team.lead]);
    await account("employee", "normal");
    const manager = await store.findUser({ id: "manager" });
    const employee = await store.findUser({ id: "employee" });

    const project = {
      id: "p-shift",
      name: "Kaydırılacak Proje",
      start: "2026-01",
      end: "2026-12",
      phases: { "2026-10": "Prototip" },
      milestones: [],
    };
    const months = ["2026-09", "2026-10", "2026-11", "2026-12"];
    await store.mutate(admin, (d, u) =>
      applyChanges(d, u, [
        { kind: "project", id: project.id, value: project, revision: 0 },
        ...months.map((m) => ({
          kind: "allocation",
          id: `${team.id}|${project.id}|${m}`,
          value: 1,
          revision: 0,
        })),
      ]),
    );
    const save = (user, value, kind = "scenario") =>
      store.mutate(user, (d, u) =>
        applyChanges(d, u, [
          {
            kind,
            id: value.id,
            value,
            revision: d.revisions["scenario:" + value.id] || 0,
          },
        ]),
      );

    // A manager saves a draft; creator fields are stamped by the server.
    await save(manager, scenario(project.id));
    let saved = (await store.read()).data.scheduleScenarios[0];
    assert.equal(saved.createdBy, "manager");
    assert.equal(saved.createdByName, "QA manager");
    assert.notEqual(saved.createdAt, "2000-01-01T00:00:00.000Z");
    // Normal users cannot save; managers cannot approve.
    await assert.rejects(save(employee, scenario(project.id)), /yetkiniz yok/);
    await assert.rejects(
      save(manager, { ...saved, status: "approved" }),
      /yalnız admin/,
    );

    // The draft survives a restart; the admin approves it.
    await store.close();
    store = new Store({ env });
    await store.connect();
    saved = (await store.read()).data.scheduleScenarios[0];
    await save(admin, { ...saved, status: "approved" });
    saved = (await store.read()).data.scheduleScenarios[0];
    assert.equal(saved.status, "approved");
    assert.equal(saved.approvedByName, "QA root-admin");
    await assert.rejects(
      save(admin, { ...saved, name: "Değişti" }),
      /içeriği değiştirilemez/,
    );

    // Transfer: plan and scenario status in one batch.
    const before = (await store.read()).data;
    const plan = scenarioApplyPlan(before, saved);
    await store.mutate(admin, (d, u) =>
      applyChanges(d, u, [
        ...plan.changes,
        {
          kind: "scenario",
          id: saved.id,
          value: { ...saved, status: "applied", undo: plan.undo },
          revision: d.revisions["scenario:" + saved.id],
        },
      ]),
    );
    let after = (await store.read()).data;
    const keys = (d) =>
      Object.keys(d.allocations)
        .filter((k) => k.includes("|" + project.id + "|"))
        .sort();
    assert.deepEqual(
      keys(after).map((k) => k.slice(-7)),
      ["2026-09", "2027-01", "2027-02", "2027-03"],
    );
    const moved = after.projects.find((p) => p.id === project.id);
    assert.equal(moved.end, "2027-03");
    assert.equal(moved.phases["2027-01"], "Prototip");
    saved = after.scheduleScenarios[0];
    assert.equal(saved.status, "applied");
    assert.equal(saved.appliedByName, "QA root-admin");
    await assert.rejects(
      store.mutate(admin, (d, u) =>
        applyChanges(d, u, [
          {
            kind: "scenario",
            id: saved.id,
            value: null,
            operation: "delete",
            revision: d.revisions["scenario:" + saved.id],
          },
        ]),
      ),
      /önce geri alın/,
    );

    // Managers see the scenario without the undo snapshot; others see none.
    const managerView = scopeData(after, manager).scheduleScenarios;
    assert.equal(managerView.length, 1);
    assert.equal(managerView[0].undo, undefined);
    assert.deepEqual(scopeData(after, employee).scheduleScenarios, []);

    // Undo restores the previous calendar exactly.
    await store.mutate(admin, (d, u) =>
      applyChanges(d, u, [
        ...scenarioRevertPlan(d, d.scheduleScenarios[0].undo),
        {
          kind: "scenario",
          id: saved.id,
          value: { ...d.scheduleScenarios[0], status: "reverted" },
          revision: d.revisions["scenario:" + saved.id],
        },
      ]),
    );
    after = (await store.read()).data;
    assert.deepEqual(keys(after), keys(before));
    const restored = after.projects.find((p) => p.id === project.id);
    assert.equal(restored.end, "2026-12");
    assert.equal(restored.phases["2026-10"], "Prototip");
    assert.equal(after.scheduleScenarios[0].status, "reverted");
    assert.equal(after.scheduleScenarios[0].revertedByName, "QA root-admin");
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("undo is refused once the shifted plan was edited after the transfer", () => {
  const data = {
    teams: [{ id: "a", name: "A", lead: "L", excelCapacity: 0 }],
    resources: [],
    projects: [
      { id: "p", name: "P", start: "2026-01", end: "2026-12", phases: {} },
    ],
    allocations: { "a|p|2026-10": 1 },
    revisions: { "project:p": 2, "allocation:a|p|2026-10": 1 },
  };
  const plan = scenarioApplyPlan(data, {
    id: "s",
    name: "s",
    includeTimeline: true,
    shifts: [{ projectId: "p", months: 2, fromMonth: "2026-10" }],
  });
  // Simulate the stored state right after the transfer.
  const transferred = {
    ...data,
    projects: [{ ...data.projects[0], end: "2027-02" }],
    allocations: { "a|p|2026-12": 1 },
    revisions: { "project:p": 3, "allocation:a|p|2026-12": 1 },
  };
  assert.equal(scenarioRevertPlan(transferred, plan.undo).length, 3);
  const edited = {
    ...transferred,
    allocations: { "a|p|2026-12": 1.5 },
  };
  assert.throws(
    () => scenarioRevertPlan(edited, plan.undo),
    /otomatik geri alma güvenli değil/,
  );
  const renamed = {
    ...transferred,
    revisions: { ...transferred.revisions, "project:p": 4 },
  };
  assert.throws(() => scenarioRevertPlan(renamed, plan.undo), /güvenli değil/);
});
