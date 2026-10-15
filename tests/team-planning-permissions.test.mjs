import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { hashPassword, publicUser } from "../backend/auth.mjs";
import {
  permissionInput,
  updatePermissions,
  revokePermissions,
} from "../backend/user-commands.mjs";
import { planningCommand, applyChanges } from "../backend/operations.mjs";
import {
  allowedPlanningTeam,
  allowedActualTeam,
  canReadPersonalCalendar,
} from "../shared/access.ts";
import {
  planningPermissionRows,
  planningRowState,
  togglePlanningRow,
} from "../frontend/src/features/access/planning-permission-tree.ts";

const directory = {
  leaders: ["Root", "Child", "Other"],
  leaderParents: { Child: "Root" },
  teams: [
    { id: "unit", name: "Root", lead: "Root", kind: "leadership" },
    { id: "a", name: "Team A", lead: "Root" },
    { id: "b", name: "Team B", lead: "Child" },
    { id: "c", name: "Team C", lead: "Other" },
    { id: "free", name: "Independent", lead: "" },
  ],
};
test("team grants are exact and planning-only; hierarchy grants retain descendants; normal users cannot write", () => {
  const manager = {
    role: "manager",
    leaders: [],
    planningTeams: ["b", "free", "missing"],
  };
  for (const id of ["b", "free"])
    assert(allowedPlanningTeam(directory, manager, id));
  for (const id of ["a", "c", "unit", "missing"])
    assert(!allowedPlanningTeam(directory, manager, id));
  assert(!allowedActualTeam(directory, manager, "b"));
  assert(!canReadPersonalCalendar(manager, "other-person"));
  assert(!allowedPlanningTeam(directory, { ...manager, role: "normal" }, "b"));
  assert(
    allowedPlanningTeam(directory, { ...manager, leaders: ["Root"] }, "b"),
  );
});
test("permission tree renders teams below leaderships and derives inherited checks without saving redundant grants", () => {
  const rows = planningPermissionRows(directory);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["Root", "a", "Child", "b", "Other", "c", "free"],
  );
  assert.equal(rows.find((row) => row.id === "b").depth, 2);
  const root = rows.find((row) => row.id === "Root");
  const selected = togglePlanningRow(
    directory,
    { leaders: ["Child"], planningTeams: ["b", "free"] },
    root,
    true,
  );
  assert.deepEqual(selected, { leaders: ["Root"], planningTeams: ["free"] });
  for (const id of ["Child", "a", "b"])
    assert.deepEqual(
      planningRowState(
        directory,
        selected,
        rows.find((row) => row.id === id),
      ),
      { checked: true, inherited: true },
    );
  assert.deepEqual(
    planningPermissionRows(directory, "Team B").map((row) => row.id),
    ["Root", "Child", "b"],
  );
  const cleared = togglePlanningRow(directory, selected, root, false);
  assert.deepEqual(cleared, { leaders: [], planningTeams: ["free"] });
  const team = rows.find((row) => row.id === "b");
  assert.deepEqual(togglePlanningRow(directory, cleared, team, true), {
    leaders: [],
    planningTeams: ["free", "b"],
  });
});
test("team permissions persist across reopen, authorize both planning paths, revoke sessions and reject invalid/stale or non-admin changes", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-team-grants-"));
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
  };
  let store = new Store({ env });
  try {
    await store.connect();
    const password = await hashPassword("Synthetic-team-grant-only-284!");
    for (const [id, role] of [
      ["root-admin", "admin"],
      ["manager", "manager"],
      ["normal", "normal"],
    ])
      await store.bootstrapUser({
        _id: id,
        username: "qa." + id,
        name: "Synthetic " + id,
        role,
        leaders: [],
        active: true,
        password,
        version: 1,
        revision: 1,
      });
    const admin = await store.findUser({ id: "root-admin" });
    const data = (await store.read()).data;
    const team = data.teams.find((t) => t.kind !== "leadership");
    const outside = data.teams.find(
      (t) => t.id !== team.id && t.kind !== "leadership",
    );
    await store.mutate(admin, (d) => {
      d.projects.push({
        id: "qa-project",
        name: "Synthetic",
        start: "2026-01",
        end: "2026-12",
        phases: {},
        milestones: [],
      });
    });
    const input = permissionInput.parse({
      id: "manager",
      role: "manager",
      leaders: [],
      planningTeams: [team.id],
      resourceId: "",
      revision: 1,
    });
    await store.createSession({
      _id: "a".repeat(64),
      userId: "manager",
      userVersion: 1,
      csrf: "synthetic",
      expiresAt: new Date(Date.now() + 60000),
    });
    const grant = (body, actor = admin) =>
      store.mutate(
        actor,
        (d, u, c) => updatePermissions(store, d, u, c, body),
        { auditUsers: true },
      );
    await grant(input);
    assert.equal(await store.session("a".repeat(64)), undefined);
    const manager = await store.findUser({ id: "manager" });
    assert.deepEqual(manager.planningTeams, [team.id]);
    assert.deepEqual(publicUser(manager).planningTeams, [team.id]);
    const single = {
      kind: "allocation",
      id: team.id + "|qa-project|2026-01",
      value: 0.5,
      revision: 0,
    };
    await store.mutate(manager, planningCommand([single]));
    await store.mutate(manager, (d, u) =>
      applyChanges(d, u, [{ ...single, id: team.id + "|qa-project|2026-02" }]),
    );
    await assert.rejects(
      () =>
        store.mutate(
          manager,
          planningCommand([
            { ...single, id: outside.id + "|qa-project|2026-01" },
          ]),
        ),
      (e) => e.status === 403,
    );
    const before = await store.read();
    await assert.rejects(
      () => grant(input),
      (e) => e.status === 409,
    );
    await assert.rejects(
      () => grant({ ...input, revision: 2, planningTeams: ["missing"] }),
      (e) => e.status === 400,
    );
    await assert.rejects(
      () => grant({ ...input, revision: 2 }, manager),
      (e) => e.status === 403,
    );
    assert.deepEqual(await store.read(), before);
    await store.mutate(admin, (d) => {
      d.teams.push({
        id: "qa-empty-team",
        name: "Synthetic empty team",
        lead: "",
        excelCapacity: 0,
      });
    });
    await grant(
      permissionInput.parse({
        id: "normal",
        role: "manager",
        leaders: [],
        planningTeams: ["qa-empty-team"],
        resourceId: "",
        revision: 1,
      }),
    );
    const beforeDelete = await store.read();
    await assert.rejects(
      () =>
        store.mutate(admin, (d, u) =>
          applyChanges(d, u, [
            {
              kind: "team",
              id: "qa-empty-team",
              operation: "delete",
              revision: d.revisions["team:qa-empty-team"] || 0,
            },
          ]),
        ),
      (e) => e.status === 409 && /kullanıcı yetkilerinde/.test(e.message),
    );
    assert.deepEqual(await store.read(), beforeDelete);
    await grant(
      permissionInput.parse({
        id: "normal",
        role: "normal",
        leaders: [],
        planningTeams: ["qa-empty-team"],
        resourceId: "",
        revision: 2,
      }),
    );
    assert.deepEqual(
      (await store.findUser({ id: "normal" })).planningTeams,
      [],
    );
    await store.close();
    store = new Store({ env });
    await store.connect();
    assert.deepEqual((await store.findUser({ id: "manager" })).planningTeams, [
      team.id,
    ]);
    assert.equal((await store.read()).data.allocations[single.id], 0.5);
    assert.equal(
      (await store.db.query("PRAGMA foreign_key_check")).rows.length,
      0,
    );
    await store.mutate(
      admin,
      (d, u, c) =>
        revokePermissions(store, u, c, { id: "manager", revision: 2 }),
      { auditUsers: true },
    );
    assert.deepEqual(
      (await store.findUser({ id: "manager" })).planningTeams,
      [],
    );
    const audit = (await store.auditLog(admin)).entries;
    assert(
      audit.some((row) =>
        row.changes.some((change) => change.path[0] === "planningTeams"),
      ),
    );
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
