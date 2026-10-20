import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { hashPassword } from "../backend/auth.mjs";
import {
  applyChanges,
  applyLeaderChange,
  planningCommand,
} from "../backend/operations.mjs";
import { synchronizeProgressStarts } from "../backend/progress-commands.mjs";

const password = hashPassword("Progress-store-test-only-284!");
const project = {
  id: "kartal",
  name: "KARTAL 8x8",
  responsibleName: "Synthetic owner",
  start: "2026-01",
  end: "2027-01",
  phases: {},
  phaseColors: {},
  milestones: [],
};
const targets = { "2026-11": 50, "2026-12": 70, "2027-01": 100 };

async function setup(t) {
  // Actual progress is entered for past months: run in December 2026.
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-12-03T09:00:00Z"),
  });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-progress-"));
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "test.sqlite"),
  };
  let store = new Store({ env });
  t.after(async () => {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await store.connect();
  const data = (await store.read()).data;
  const leads = data.teams.filter((team) => team.lead).map((team) => team.lead);
  const lead = leads[0],
    otherLead = leads.find((name) => name !== lead);
  const users = {};
  for (const [id, role, leaders] of [
    ["admin", "admin", []],
    ["lead", "manager", [lead]],
    ["other", "manager", [otherLead]],
    ["normal", "normal", []],
  ]) {
    await store.bootstrapUser({
      _id: id,
      username: "progress." + id,
      name: "Synthetic " + id,
      role,
      leaders,
      resourceId: "",
      active: true,
      password: await password,
      revision: 1,
      version: 1,
    });
    users[id] = await store.findUser({ id });
  }
  await store.mutate(users.admin, (d, u) =>
    applyChanges(d, u, [
      { kind: "project", id: project.id, value: project, revision: 0 },
      ...["2026-11", "2026-12", "2027-01"].map((month) => ({
        kind: "allocation",
        id: `${data.teams.find((team) => team.lead === lead).id}|${project.id}|${month}`,
        value: 1,
        revision: 0,
      })),
    ]),
  );
  const state = async () => (await store.read()).data;
  const record = async () =>
    (await state()).projectProgress?.find((item) => item.id === "prg-1");
  async function save(user, value, operation) {
    const d = await state();
    return store.mutate(user, (draft, u) =>
      applyChanges(draft, u, [
        {
          kind: "progress",
          id: "prg-1",
          value,
          revision: d.revisions["progress:prg-1"] || 0,
          ...(operation ? { operation } : {}),
        },
      ]),
    );
  }
  async function lock(user, month, operation) {
    const d = await state();
    return store.mutate(user, (draft, u) =>
      applyChanges(draft, u, [
        {
          kind: "progressLock",
          id: month,
          value: { id: month },
          revision: d.revisions["progressLock:" + month] || 0,
          ...(operation ? { operation } : {}),
        },
      ]),
    );
  }
  const reopen = async () => {
    await store.close();
    store = new Store({ env });
    await store.connect();
  };
  return {
    get store() {
      return store;
    },
    users,
    lead,
    save,
    lock,
    record,
    state,
    reopen,
  };
}
const draft = (lead, over = {}) => ({
  id: "prg-1",
  projectId: project.id,
  leader: lead,
  baselines: [],
  actuals: {},
  proposal: {
    openingMonth: "2026-10",
    openingPct: 40,
    targets,
    status: "draft",
  },
  createdBy: "client",
  createdByName: "client",
  createdAt: "client",
  ...over,
});
const status = (code) => (error) => error.status === code;

test("resource writes automatically align approved plans without losing targets or actuals", async (t) => {
  const f = await setup(t);
  await f.save(f.users.admin, {
    ...draft(f.lead),
    proposal: { ...draft(f.lead).proposal, status: "approved" },
  });
  let saved = await f.record();
  await f.save(f.users.lead, {
    ...saved,
    actuals: { "2026-11": { pct: 45, note: "Korunacak gerçekleşen" } },
  });
  const before = await f.state();
  const team = before.teams.find((team) => team.lead === f.lead);
  const id = `${team.id}|${project.id}|2026-09`;
  const response = await f.store.mutate(
    f.users.lead,
    planningCommand([{ kind: "allocation", id, value: 0.5, revision: 0 }]),
    { returnView: true, planningDelta: true },
  );
  saved = await f.record();
  assert.equal(saved.baselines[0].openingMonth, "2026-08");
  assert.deepEqual(saved.baselines[0].targets, targets);
  assert.deepEqual(saved.actuals, before.projectProgress[0].actuals);
  assert.equal(
    response.data.projectProgress[0].baselines[0].openingMonth,
    "2026-08",
  );
  assert(
    (await f.state()).revisions["progress:prg-1"] >
      before.revisions["progress:prg-1"],
  );
  assert.equal(before.projectProgress[0].baselines[0].openingMonth, "2026-10");
  await f.store.mutate(
    f.users.lead,
    planningCommand([
      {
        kind: "allocation",
        id,
        operation: "delete",
        revision: (await f.state()).revisions["allocation:" + id],
      },
    ]),
  );
  saved = await f.record();
  assert.equal(saved.baselines[0].openingMonth, "2026-10");
  assert.deepEqual(saved.actuals, before.projectProgress[0].actuals);
  const audit = await f.store.auditLog(f.users.admin, { kind: "progress" });
  assert(
    audit.entries.some((event) =>
      event.changes.some(
        (change) => change.path.join(".") === "baselines.0.openingMonth",
      ),
    ),
  );
});

test("legacy alignment is immutable, preserves entry history and does nothing without resources", () => {
  const record = {
    ...draft("A"),
    baselines: [
      {
        version: 1,
        openingMonth: "2026-10",
        openingPct: 40,
        targets,
        approvedByName: "A",
        approvedAt: "2026-10-01",
      },
    ],
    actuals: { "2026-11": { pct: 60, note: "Geçmiş" } },
  };
  const d = {
    projects: [project],
    teams: [
      { id: "t", lead: "A" },
      { id: "other", lead: "B" },
    ],
    allocations: { "t|kartal|2026-01": 1, "other|kartal|2025-01": 2 },
    revisions: {},
    projectProgress: [record],
  };
  assert.equal(synchronizeProgressStarts(d), 1);
  assert.equal(d.projectProgress[0].baselines[0].openingMonth, "2025-12");
  assert.equal(d.projectProgress[0].proposal.openingMonth, "2025-12");
  assert.deepEqual(d.projectProgress[0].actuals, record.actuals);
  assert.equal(record.baselines[0].openingMonth, "2026-10");
  assert.equal(synchronizeProgressStarts(d), 0);
  assert.equal(synchronizeProgressStarts({ ...d, allocations: {} }), 0);
});

test("a plan cannot be created before its leadership has positive planned resource", async (t) => {
  const f = await setup(t);
  await f.store.mutate(f.users.admin, (d) => {
    d.allocations = {};
  });
  await assert.rejects(
    f.save(f.users.lead, draft(f.lead)),
    (error) => error.status === 400 && /kaynak dağılımı/.test(error.message),
  );
  assert.equal(await f.record(), undefined);
});

test("a leader proposes, an admin approves, and the baseline is frozen", async (t) => {
  const f = await setup(t);
  const { users, lead } = f;
  await assert.rejects(f.save(users.normal, draft(lead)), status(403));
  await assert.rejects(f.save(users.other, draft(lead)), status(403));
  await f.save(users.lead, draft(lead));
  let saved = await f.record();
  // Who and when are stamped by the server, never taken from the request.
  assert.equal(saved.createdBy, "lead");
  assert.equal(saved.createdByName, "Synthetic lead");
  assert.equal(saved.proposal.updatedByName, "Synthetic lead");

  // Submitting checks the curve.
  await assert.rejects(
    f.save(users.lead, {
      ...saved,
      proposal: {
        ...saved.proposal,
        targets: { "2026-11": 50 },
        status: "pending",
      },
    }),
    (e) => e.status === 400 && /%100'e ulaşmalı/.test(e.message),
  );
  await f.save(users.lead, {
    ...saved,
    proposal: { ...saved.proposal, status: "pending" },
  });
  saved = await f.record();
  assert.equal(saved.proposal.submittedByName, "Synthetic lead");
  // A pending proposal is frozen and only an admin approves it.
  await assert.rejects(
    f.save(users.lead, {
      ...saved,
      proposal: { ...saved.proposal, openingPct: 30 },
    }),
    status(409),
  );
  await assert.rejects(
    f.save(users.lead, {
      ...saved,
      proposal: { ...saved.proposal, status: "approved" },
    }),
    status(403),
  );
  await f.save(users.admin, {
    ...saved,
    proposal: { ...saved.proposal, status: "approved" },
  });
  saved = await f.record();
  assert.equal(saved.proposal, undefined);
  assert.equal(saved.baselines.length, 1);
  assert.equal(saved.baselines[0].version, 1);
  assert.equal(saved.baselines[0].approvedByName, "Synthetic admin");
  assert.deepEqual(saved.baselines[0].targets, targets);
  // The approved baseline itself cannot be edited.
  await assert.rejects(
    f.save(users.lead, {
      ...saved,
      baselines: [{ ...saved.baselines[0], openingPct: 10 }],
    }),
    status(409),
  );
  // A new baseline needs a reason.
  await assert.rejects(
    f.save(users.lead, {
      ...saved,
      proposal: {
        openingMonth: "2026-11",
        openingPct: 45,
        targets: { "2026-12": 60, "2027-01": 100 },
        status: "pending",
      },
    }),
    (e) => e.status === 400 && /gerekçe/.test(e.message),
  );
});

test("monthly actuals: past months only, with a note, and never in a locked month", async (t) => {
  const f = await setup(t);
  const { users, lead } = f;
  await assert.rejects(
    f.save(users.lead, {
      ...draft(lead),
      actuals: { "2026-11": { pct: 45, note: "x" } },
    }),
    status(400),
  );
  await f.save(users.admin, {
    ...draft(lead),
    proposal: { ...draft(lead).proposal, status: "approved" },
  });
  let saved = await f.record();
  const enter = (actuals, user = users.lead) =>
    f.save(user, { ...saved, actuals: { ...saved.actuals, ...actuals } });
  await assert.rejects(
    enter({ "2026-11": { pct: 45, note: " " } }),
    status(400),
  );
  await assert.rejects(
    enter({ "2027-01": { pct: 45, note: "x" } }),
    status(400),
  );
  await assert.rejects(
    enter({ "2026-10": { pct: 45, note: "x" } }),
    status(400),
  );
  await assert.rejects(
    enter({ "2026-11": { pct: 45, note: "x" } }, users.other),
    status(403),
  );
  await enter({
    "2026-11": { pct: 45, note: " Tedarik gecikmesi ", byName: "x" },
  });
  saved = await f.record();
  assert.deepEqual(saved.actuals["2026-11"], {
    pct: 45,
    note: "Tedarik gecikmesi",
    byName: "Synthetic lead",
    at: "2026-12-03T09:00:00.000Z",
  });
  // Managers cannot lock; an admin lock blocks everyone until it is lifted.
  await assert.rejects(f.lock(users.lead, "2026-11"), status(403));
  await f.lock(users.admin, "2026-11");
  assert.equal(
    (await f.state()).progressLocks[0].lockedByName,
    "Synthetic admin",
  );
  await assert.rejects(
    enter({ "2026-11": { pct: 47, note: "y" } }),
    status(409),
  );
  await assert.rejects(
    enter({ "2026-11": { pct: 47, note: "y" } }, users.admin),
    status(409),
  );
  // Other months stay open; an unchanged locked month is not touched.
  await enter({ "2026-12": { pct: 52, note: "Aralık" } });
  saved = await f.record();
  await f.lock(users.admin, "2026-11", "delete");
  await enter({ "2026-11": { pct: 47, note: "Düzeltme" } });
  assert.equal((await f.record()).actuals["2026-11"].pct, 47);
  // Weights are the admin's.
  saved = await f.record();
  await assert.rejects(
    f.save(users.lead, { ...saved, weight: 5 }),
    status(403),
  );
  await f.save(users.admin, { ...saved, weight: 5 });
  assert.equal((await f.record()).weight, 5);
});

test("progress persists, is audited and reaches only leaders and admins", async (t) => {
  const f = await setup(t);
  const { users, lead } = f;
  await f.save(users.lead, draft(lead));
  await f.reopen();
  assert.equal((await f.record()).proposal.openingPct, 40);
  const log = await f.store.auditLog(users.admin, { kind: "progress" });
  assert.equal(log.entries[0].record_name, "KARTAL 8x8 · " + lead);
  const manager = await f.store.view(users.other);
  assert.equal(manager.data.projectProgress.length, 1);
  assert(manager.data.revisions["progress:prg-1"] > 0);
  const normal = await f.store.view(users.normal);
  assert.equal(normal.data.projectProgress, undefined);
  assert.equal(normal.data.revisions["progress:prg-1"], undefined);
});

test("a leadership rename follows into progress and a project delete removes it", async (t) => {
  const f = await setup(t);
  const { users, lead } = f;
  await f.save(users.lead, draft(lead));
  await f.store.mutate(users.admin, (d, u, c, generation) =>
    applyLeaderChange(
      d,
      u,
      { action: "rename", name: lead, newName: lead + " Yeni", generation },
      c,
      generation,
    ),
  );
  assert.equal((await f.record()).leader, lead + " Yeni");
  // A leadership with progress records cannot be deleted.
  await assert.rejects(
    f.store.mutate(users.admin, (d, u, c, generation) =>
      applyLeaderChange(
        d,
        u,
        { action: "delete", name: lead + " Yeni", generation },
        c,
        generation,
      ),
    ),
    (e) => e.status === 409,
  );
  const d = await f.state();
  await f.store.mutate(users.admin, (draft, u) =>
    applyChanges(draft, u, [
      {
        kind: "project",
        id: project.id,
        value: null,
        operation: "delete",
        revision: d.revisions["project:" + project.id],
      },
    ]),
  );
  assert.equal(await f.record(), undefined);
  assert((await f.state()).revisions["progress:prg-1"] >= 3);
});
