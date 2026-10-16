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

test("transferring a scenario closes the others on its projects; undo reopens them", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-scenario-close-"));
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
  };
  const store = new Store({ env });
  try {
    await store.connect();
    await store.bootstrapUser({
      _id: "root-admin",
      username: "qa.admin",
      name: "Admin",
      role: "admin",
      resourceId: "",
      leaders: [],
      active: true,
      password: await hashPassword("Scenario-close-test-1!"),
      version: 1,
      revision: 1,
    });
    const admin = await store.findUser({ id: "root-admin" });
    const team = (await store.read()).data.teams.find((t) => t.lead);
    const project = (id) => ({
      id,
      name: "Proje " + id,
      start: "2026-01",
      end: "2026-12",
      phases: {},
      milestones: [],
    });
    await store.mutate(admin, (d, u) =>
      applyChanges(d, u, [
        { kind: "project", id: "p1", value: project("p1"), revision: 0 },
        { kind: "project", id: "p2", value: project("p2"), revision: 0 },
        {
          kind: "allocation",
          id: `${team.id}|p1|2026-10`,
          value: 1,
          revision: 0,
        },
      ]),
    );
    const draft = (id, projectId, months) => ({
      ...scenario(projectId),
      id,
      name: "Senaryo " + id,
      shifts: [{ projectId, months, fromMonth: "2026-10" }],
    });
    const write = (value, extra = []) =>
      store.mutate(admin, (d, u) =>
        applyChanges(d, u, [
          ...extra,
          {
            kind: "scenario",
            id: value.id,
            value,
            revision: d.revisions["scenario:" + value.id] || 0,
          },
        ]),
      );
    await write(draft("A", "p1", 3));
    await write(draft("B", "p1", 5));
    await write(draft("C", "p2", 2));
    await write(draft("E", "p1", 1));
    const byId = async (id) =>
      (await store.read()).data.scheduleScenarios.find((s) => s.id === id);
    await write({ ...(await byId("B")), status: "approved" });
    await write({ ...(await byId("A")), status: "approved" });

    // Transfer A: B (same project, even though approved) closes; C stays.
    const a = await byId("A");
    const plan = scenarioApplyPlan((await store.read()).data, a);
    await write({ ...a, status: "applied", undo: plan.undo }, plan.changes);
    const closed = await byId("B");
    assert.equal(closed.status, "closed");
    assert.equal(closed.closedByScenarioId, "A");
    assert.equal(closed.closedByName, "Senaryo A");
    assert.equal((await byId("C")).status, "draft");
    // A closed scenario can neither be approved nor transferred.
    await assert.rejects(
      write({ ...closed, status: "approved" }),
      /bu duruma geçirilemez/,
    );
    await assert.rejects(
      write({ ...closed, status: "applied", undo: plan.undo }),
      /bu duruma geçirilemez/,
    );
    // Clients cannot close scenarios themselves.
    await assert.rejects(
      write({ ...(await byId("C")), status: "closed" }),
      /bu duruma geçirilemez/,
    );

    // A closed scenario can be deleted while it is closed.
    assert.equal((await byId("E")).status, "closed");
    await store.mutate(admin, (d, u) =>
      applyChanges(d, u, [
        {
          kind: "scenario",
          id: "E",
          value: null,
          operation: "delete",
          revision: d.revisions["scenario:E"],
        },
      ]),
    );
    assert.equal(await byId("E"), undefined);

    // Undo A: B returns to draft, without the old approval.
    const applied = await byId("A");
    await store.mutate(admin, (d, u) =>
      applyChanges(d, u, [
        ...scenarioRevertPlan(d, applied.undo),
        {
          kind: "scenario",
          id: "A",
          value: { ...applied, status: "reverted" },
          revision: d.revisions["scenario:A"],
        },
      ]),
    );
    const reopened = await byId("B");
    assert.equal(reopened.status, "draft");
    assert.equal(reopened.closedByScenarioId, undefined);
    assert.equal(reopened.approvedByName, undefined);

    // A transfer on another project leaves B (on p1) open; scenarios
    // created after a transfer are not affected by it.
    await write({ ...(await byId("C")), status: "approved" });
    const c = await byId("C");
    const planC = scenarioApplyPlan((await store.read()).data, c);
    await write({ ...c, status: "applied", undo: planC.undo }, planC.changes);
    assert.equal((await byId("B")).status, "draft");
    await write(draft("D", "p2", 4));
    assert.equal((await byId("D")).status, "draft");
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
