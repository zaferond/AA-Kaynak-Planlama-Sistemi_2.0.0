import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { Store } from "../backend/store.mjs";
import { createApp } from "../backend/app.mjs";
import { syntheticDirectory } from "./directory-fixture.mjs";
import { hashPassword, verifyPassword } from "../backend/auth.mjs";
import { activeTeamMembers } from "../shared/model.ts";
import { applyLeaderChange, stageChanges } from "../backend/operations.mjs";
import {
  DIRECTORY_REVISION_KEY,
  directoryRevision,
} from "../shared/directory-policy.ts";

async function setup(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-record-http-"));
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "test.sqlite"),
  };
  const store = new Store({ env });
  const password = "Record-access-test-only-284!";
  const hashed = await hashPassword(password);
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const app = createApp(store, { origin, ...options });
  server.on("request", app);
  t.after(async () => {
    app.locals.close();
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await store.connect();
  async function request(url, body, auth = {}) {
    const response = await fetch(origin + "/api" + url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: auth.cookie || "",
        ...(body === undefined
          ? {}
          : {
              Origin: origin,
              "Content-Type": "application/json",
              "X-Requested-With": "KaynakPortal",
              "X-CSRF-Token": auth.csrf || "",
            }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, json: await response.json(), response };
  }
  async function user(id, role = "admin", resourceId = "", leaders = []) {
    await store.bootstrapUser({
      _id: id,
      username: "record." + id,
      name: id,
      role,
      resourceId,
      leaders,
      active: true,
      password: hashed,
      revision: 1,
      version: 1,
    });
    const result = await request("/auth/login", {
      username: "record." + id,
      password,
    });
    assert.equal(result.status, 200);
    return {
      cookie: result.response.headers.get("set-cookie").split(";")[0],
      csrf: result.json.csrf,
    };
  }
  const admin = await user("admin");
  async function state() {
    const result = await request("/data", undefined, admin);
    assert.equal(result.status, 200);
    return result.json;
  }
  async function write(changes, auth = admin) {
    const current = await state();
    return request(
      "/changes",
      {
        changes: changes.map((change) => ({
          revision: current.data.revisions[change.kind + ":" + change.id] || 0,
          ...change,
        })),
      },
      auth,
    );
  }
  return { store, env, admin, request, user, state, write };
}
const risk = (id) => ({
  id,
  projectId: id,
  reportedBy: "Team",
  category: "Teknik",
  reportedAt: "2026-09-01",
  system: "System",
  description: "Risk " + id,
  cause: "Cause",
  actionPlan: "Plan",
  targetAt: "",
  status: "Açık",
  owner: "Owner",
  likelihood: 2,
  impact: 3,
  strategy: "Kontrol",
  implementedAt: "",
  actionResult: "",
  residualLikelihood: null,
  residualImpact: null,
});

test("numeric and personal deletions validate targets without manufacturing revision tombstones", async (t) => {
  const { store, user, state, write } = await setup(t);
  const team = (await state()).data.teams.find((item) => item.lead);
  assert.equal(
    (
      await write([
        {
          kind: "project",
          id: "p",
          value: {
            id: "p",
            name: "Synthetic project",
            start: "2026-01",
            end: "2026-12",
            phases: {},
          },
        },
        {
          kind: "resource",
          id: "r-own",
          value: {
            id: "r-own",
            name: "Synthetic employee",
            note: "",
            versions: [
              {
                team: team.id,
                lead: team.lead,
                effective: "2026-01",
                start: "2026-01-01",
                end: "",
                status: "Aktif Çalışan",
                included: true,
                amount: 1,
              },
            ],
          },
        },
      ])
    ).status,
    200,
  );
  const owner = await user("delete-owner", "normal", "r-own");
  const foreign = await user("delete-foreign", "normal");
  const manager = await user("delete-manager", "manager", "", [team.lead]);
  const sqlRevisions = async () =>
    (await store.db.query("SELECT * FROM kp_revisions ORDER BY kind,record_id"))
      .rows;
  const del = (kind, id) => ({ kind, id, operation: "delete" });

  await t.test(
    "the original 32-command phantom-project attack is rejected atomically",
    async () => {
      const before = await state(),
        revisions = await sqlRevisions();
      const ids = [
        ...Array.from({ length: 30 }, (_, i) => `r-own|ghost-${i}|2026-01`),
        "r-own|ghost-missing-month",
        "r-own|ghost-extra|2026-01|extra",
      ];
      assert.equal(
        (
          await write(
            ids.map((id) => del("actual", id)),
            owner,
          )
        ).status,
        404,
      );
      assert.deepEqual(await state(), before);
      assert.deepEqual(await sqlRevisions(), revisions);
    },
  );

  await t.test(
    "malformed dates, missing owners/projects and extra components cannot bypass validation by deletion",
    async () => {
      const before = await state(),
        revisions = await sqlRevisions();
      const cases = [
        ["actual", "r-own|p", 400, owner],
        ["actual", "r-own|p|2026-01|extra", 400, owner],
        ["actual", "r-own||2026-01", 400, owner],
        ["actual", "r-own|p|2200-01", 400, owner],
        ["actual", "missing|p|2026-01", 404],
        ["allocation", `${team.id}|missing|2026-01`, 404, manager],
        ["allocation", `${team.id}|p|2026-13`, 400, manager],
        ["allocation", "missing|p|2026-01", 404],
        ["workedHours", "r-own|1999-12", 400, owner],
        ["workedHours", "r-own|2026-01|extra", 400, owner],
        ["workedHours", "missing|2026-01", 404],
        ["personDay", "r-own|2026-02-30|leave", 400, owner],
        ["personDay", "r-own|2200-01-01|leave", 400, owner],
        ["personDay", "r-own|2026-01-05|leave|extra", 400, owner],
        ["personDay", "missing|2026-01-05|leave", 400],
      ];
      for (const [kind, id, expected, auth] of cases)
        assert.equal(
          (await write([del(kind, id)], auth)).status,
          expected,
          `${kind}:${id}`,
        );
      assert.equal(
        (
          await write(
            [{ kind: "workedHours", id: "r-own|2200-01", value: null }],
            owner,
          )
        ).status,
        400,
      );
      assert.deepEqual(await state(), before);
      assert.deepEqual(await sqlRevisions(), revisions);
    },
  );

  const records = [
    ["allocation", `${team.id}|p|2026-01`, "allocations", 0, manager],
    [
      "actual",
      "r-own|p|2026-01",
      "actualAllocations",
      { unit: "percent", value: 25 },
      owner,
    ],
    ["workedHours", "r-own|2026-01", "actualWorkedHours", 0, owner],
    [
      "personDay",
      "r-own|2026-01-05|leave",
      "personCalendar",
      { type: "leave", hours: 1, label: "Synthetic" },
      owner,
    ],
  ];
  await t.test(
    "empty clears and automatic-hour resets succeed without new revision rows; authorization still applies",
    async () => {
      const before = (await state()).data,
        revisions = await sqlRevisions();
      for (const [kind, id, , , auth] of records) {
        assert.equal((await write([del(kind, id)], foreign)).status, 403);
        assert.equal((await write([del(kind, id)], auth)).status, 200);
      }
      assert.equal(
        (
          await write(
            [{ kind: "workedHours", id: "r-own|2026-01", value: null }],
            owner,
          )
        ).status,
        200,
      );
      assert.deepEqual((await state()).data, before);
      assert.deepEqual(await sqlRevisions(), revisions);
    },
  );

  await t.test(
    "real deletions (including zero) retain tombstones, reject stale writes and allow recreation",
    async () => {
      for (const [kind, id, collection, value, auth] of records) {
        assert.equal((await write([{ kind, id, value }], auth)).status, 200);
        const revision = (await state()).data.revisions[kind + ":" + id];
        const remove =
          kind === "workedHours" ? { kind, id, value: null } : del(kind, id);
        assert.equal((await write([remove], auth)).status, 200);
        const removed = (await state()).data;
        assert.equal(Object.hasOwn(removed[collection], id), false);
        if (kind === "actual")
          assert.equal(Object.hasOwn(removed.actualPercentEntries, id), false);
        assert.equal(removed.revisions[kind + ":" + id], revision + 1);
        assert.equal(
          (await write([{ ...remove, revision }], auth)).status,
          409,
        );
        assert.equal(
          (await write([{ kind, id, value, revision }], auth)).status,
          409,
        );
        const rows = await sqlRevisions();
        assert.equal((await write([remove], auth)).status, 200);
        assert.deepEqual(await sqlRevisions(), rows);
        assert.equal((await write([{ kind, id, value }], auth)).status, 200);
        assert.equal(
          (await state()).data.revisions[kind + ":" + id],
          revision + 2,
        );
        assert.equal((await write([remove], auth)).status, 200);
      }
    },
  );

  await t.test(
    "a rejected deletion rolls back earlier valid changes in the same batch",
    async () => {
      const before = await state(),
        revisions = await sqlRevisions();
      assert.equal(
        (
          await write(
            [
              { kind: "actual", id: "r-own|p|2026-01", value: 0.1 },
              del("actual", "r-own|missing|2026-01"),
            ],
            owner,
          )
        ).status,
        404,
      );
      assert.deepEqual(await state(), before);
      assert.deepEqual(await sqlRevisions(), revisions);
    },
  );
});

test("manual leadership and team HTTP CRUD survives reload/reopen and guards roles, duplicates and stale drafts", async (t) => {
  const { store, env, admin, request, user, state, write } = await setup(t);
  const normal = await user("directory-normal", "normal");
  const manager = await user("directory-manager", "manager");
  const changeLeader = async (input, auth = admin) =>
    request(
      "/leaders/change",
      {
        generation: (await state()).generation,
        ...input,
      },
      auth,
    );
  const leader = {
    action: "create",
    name: "Manual Leadership",
    managerName: "Synthetic manager",
  };
  for (const auth of [normal, manager]) {
    assert.equal((await changeLeader(leader, auth)).status, 403);
    assert.equal(
      (
        await write(
          [
            {
              kind: "team",
              id: "manual-t",
              value: {
                id: "manual-t",
                name: "Manual Team",
                lead: "",
                excelCapacity: 0,
              },
            },
          ],
          auth,
        )
      ).status,
      403,
    );
  }
  assert.equal((await changeLeader(leader)).status, 200);
  assert.equal(
    (await changeLeader({ ...leader, name: "  manual leadership  " })).status,
    400,
  );
  assert.equal(
    (await changeLeader({ action: "create", name: "İLERİ" })).status,
    200,
  );
  assert.equal(
    (await changeLeader({ action: "create", name: "ileri" })).status,
    400,
  );
  const value = {
    id: "manual-t",
    name: "Manual Team",
    lead: leader.name,
    managerName: "Synthetic team manager",
    excelCapacity: 0,
  };
  assert.equal(
    (await write([{ kind: "team", id: value.id, value }])).status,
    200,
  );
  let current = await state();
  assert.equal(current.data.teams.find((t) => t.id === value.id).catalog, true);
  assert.equal(
    (
      await write([
        {
          kind: "team",
          id: "duplicate",
          value: { ...value, id: "duplicate", name: "manual team" },
        },
      ])
    ).status,
    400,
  );
  assert.equal(
    (
      await changeLeader({
        action: "update",
        name: leader.name,
        newName: "Renamed Leadership",
        managerName: "Updated manager",
      })
    ).status,
    200,
  );
  current = await state();
  assert.equal(
    current.data.teams.find((t) => t.id === value.id).lead,
    "Renamed Leadership",
  );
  const pinned = current.data.revisions["team:" + value.id];
  const updated = {
    ...current.data.teams.find((t) => t.id === value.id),
    name: "Renamed Team",
  };
  assert.equal(
    (await write([{ kind: "team", id: value.id, value: updated }])).status,
    200,
  );
  assert.equal(
    (
      await write([
        {
          kind: "team",
          id: value.id,
          value: { ...updated, name: "Stale Team" },
          revision: pinned,
        },
      ])
    ).status,
    409,
  );
  assert.equal(
    (
      await changeLeader({
        action: "delete",
        name: "Renamed Leadership",
        generation: current.generation,
      })
    ).status,
    409,
  );
  assert.equal(
    (await state()).data.leaderManagers["Renamed Leadership"],
    "Updated manager",
  );
  assert.equal(
    (await changeLeader({ action: "delete", name: "Renamed Leadership" }))
      .status,
    200,
  );
  current = await state();
  assert(!current.data.teams.some((t) => t.id === value.id));
  assert(!current.data.leaders.includes("Renamed Leadership"));
  assert.equal((await store.read()).data.leaders.includes("İLERİ"), true);
  await store.close();
  const reopened = new Store({ env });
  try {
    await reopened.connect();
    const persisted = (await reopened.read()).data;
    assert(persisted.leaders.includes("İLERİ"));
    assert(!persisted.leaders.includes("Renamed Leadership"));
    assert(!persisted.teams.some((t) => t.id === value.id));
  } finally {
    await reopened.close();
  }
});

test("leadership catalog revision ignores unrelated writes but rejects concurrent catalog drafts and survives reopen", async (t) => {
  const { store, env, admin, request, user, state, write } = await setup(t);
  const change = (body, auth = admin) => request("/leaders/change", body, auth);
  const initial = await state();
  assert.equal(directoryRevision(initial.data), 0);
  const create = { action: "create", name: "Catalog test", catalogRevision: 0 };
  for (const role of ["normal", "manager"]) {
    const auth = await user("catalog-" + role, role);
    assert.equal((await change(create, auth)).status, 403);
  }
  assert.equal(
    (await change({ action: "create", name: "Missing token" })).status,
    400,
  );
  assert.equal((await change({ ...create, catalogRevision: -1 })).status, 400);
  assert.equal((await change(create)).status, 200);
  const opened = await state();
  assert.equal(directoryRevision(opened.data), 1);
  const project = {
    id: "catalog-project",
    name: "Unrelated project",
    start: "2026-01",
    end: "2026-12",
    phases: {},
    phaseColors: {},
    milestones: [],
  };
  assert.equal(
    (await write([{ kind: "project", id: project.id, value: project }])).status,
    200,
  );
  assert.equal(
    (await write([{ kind: "risk", id: project.id, value: risk(project.id) }]))
      .status,
    200,
  );
  const team = opened.data.teams.find((team) => team.lead);
  assert.equal(
    (
      await write([
        {
          kind: "allocation",
          id: team.id + "|" + project.id + "|2026-01",
          value: 1,
        },
      ])
    ).status,
    200,
  );
  assert.equal(directoryRevision((await state()).data), 1);
  const draft = {
    action: "update",
    name: create.name,
    managerName: "Saved manager",
    generation: opened.generation,
    catalogRevision: 1,
  };
  const legacy = { ...draft };
  delete legacy.catalogRevision;
  const legacyConflict = await change(legacy);
  assert.equal(legacyConflict.status, 409);
  assert.match(legacyConflict.json.error, /Uygulama verileri değişti/);
  assert.equal((await change(draft)).status, 200);
  assert.equal(directoryRevision((await state()).data), 2);
  const teamOpened = await state();
  assert.equal(
    (
      await write([
        {
          kind: "team",
          id: team.id,
          value: { ...team, name: team.name + " updated" },
        },
      ])
    ).status,
    200,
  );
  assert.equal(directoryRevision((await state()).data), 3);
  const stale = await change({
    ...draft,
    managerName: "Stale manager",
    catalogRevision: directoryRevision(teamOpened.data),
  });
  assert.equal(stale.status, 409);
  assert.match(stale.json.error, /Liderlik veya takım listesi değişti/);
  assert.equal(
    (await state()).data.leaderManagers[create.name],
    "Saved manager",
  );
  const revision = directoryRevision((await state()).data);
  const secondAdmin = await user("second-admin");
  const results = await Promise.all([
    change({
      action: "create",
      name: "Concurrent A",
      catalogRevision: revision,
    }),
    change(
      { action: "create", name: "Concurrent B", catalogRevision: revision },
      secondAdmin,
    ),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const current = await state();
  assert.equal(directoryRevision(current.data), revision + 1);
  await store.close();
  const reopened = new Store({ env });
  try {
    await reopened.connect();
    assert.equal(directoryRevision((await reopened.read()).data), revision + 1);
  } finally {
    await reopened.close();
  }
});

test("catalog revisions resist failed batches, delete/recreate ABA and identical JSON restore", async (t) => {
  const { admin, request, state, write } = await setup(t);
  const change = (body) => request("/leaders/change", body, admin);
  const start = await state();
  const team = start.data.teams.find((team) => team.lead);
  const failed = await write([
    { kind: "team", id: team.id, value: { ...team, name: "Must roll back" } },
    { kind: "project", id: "invalid", value: { id: "wrong" } },
  ]);
  assert.equal(failed.status, 400);
  assert.deepEqual(await state(), start);
  const create = { action: "create", name: "ABA catalog", catalogRevision: 0 };
  assert.equal((await change(create)).status, 200);
  assert.equal(
    (await change({ action: "delete", name: create.name, catalogRevision: 1 }))
      .status,
    200,
  );
  assert.equal((await change({ ...create, catalogRevision: 2 })).status, 200);
  assert.equal(
    (
      await change({
        action: "update",
        name: create.name,
        managerName: "Old draft",
        catalogRevision: 1,
      })
    ).status,
    409,
  );
  const before = await state();
  const backup = (await request("/backup", undefined, admin)).json.data;
  backup.revisions[DIRECTORY_REVISION_KEY] = 999999;
  assert.equal(
    (
      await request(
        "/restore",
        { data: backup, generation: before.generation },
        admin,
      )
    ).status,
    200,
  );
  const after = await state();
  assert.equal(
    directoryRevision(after.data),
    directoryRevision(before.data) + 1,
  );
  assert.equal(
    (
      await change({
        action: "delete",
        name: create.name,
        catalogRevision: directoryRevision(before.data),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await change({
        action: "delete",
        name: create.name,
        catalogRevision: directoryRevision(after.data),
      })
    ).status,
    200,
  );
});

test("manual team moves preserve allocations and historical resource links; used records cannot be deleted", async (t) => {
  const { store, env, admin, request, state, write } = await setup(t);
  async function leader(input) {
    return request(
      "/leaders/change",
      { generation: (await state()).generation, ...input },
      admin,
    );
  }
  for (const name of ["Manual A", "Manual B"])
    assert.equal((await leader({ action: "create", name })).status, 200);
  const team = {
    id: "linked-team",
    name: "Linked team",
    lead: "Manual A",
    excelCapacity: 0,
  };
  assert.equal(
    (
      await write([
        { kind: "team", id: team.id, value: team },
        {
          kind: "project",
          id: "linked-project",
          value: {
            id: "linked-project",
            name: "Synthetic project",
            start: "2026-01",
            end: "2026-12",
            phases: {},
          },
        },
        {
          kind: "resource",
          id: "linked-resource",
          value: {
            id: "linked-resource",
            name: "Synthetic employee",
            note: "",
            versions: ["2026-01", "2026-07"].map((effective) => ({
              team: team.id,
              lead: team.lead,
              effective,
              start: "2026-01-01",
              end: "",
              status: "Aktif Çalışan",
              included: true,
              amount: 1,
            })),
          },
        },
        {
          kind: "allocation",
          id: team.id + "|linked-project|2026-01",
          value: 0.5,
        },
      ])
    ).status,
    200,
  );
  const before = await state();
  assert.equal(
    (
      await write([
        {
          kind: "team",
          id: team.id,
          value: { ...team, name: "Moved team", lead: "Manual B" },
        },
      ])
    ).status,
    200,
  );
  let after = await state();
  assert.equal(
    after.data.resources.find((r) => r.id === "linked-resource").versions[0]
      .lead,
    "Manual B",
  );
  assert.equal(
    after.data.revisions["resource:linked-resource"],
    before.data.revisions["resource:linked-resource"] + 1,
  );
  assert.deepEqual(
    after.data.resources
      .find((r) => r.id === "linked-resource")
      .versions.map((v) => v.lead),
    ["Manual B", "Manual B"],
    "all historical versions move while the resource revision advances once",
  );
  const beforeFailedBatch = await state();
  const beforeAudit = (await request("/audit", undefined, admin)).json;
  assert.equal(
    (
      await write([
        {
          kind: "team",
          id: team.id,
          value: { ...team, name: "Rejected move", lead: "Manual A" },
        },
        {
          kind: "resource",
          id: "linked-resource",
          value: beforeFailedBatch.data.resources.find(
            (r) => r.id === "linked-resource",
          ),
          revision:
            beforeFailedBatch.data.revisions["resource:linked-resource"],
        },
      ])
    ).status,
    409,
  );
  assert.deepEqual(await state(), beforeFailedBatch);
  assert.deepEqual(
    (await request("/audit", undefined, admin)).json,
    beforeAudit,
  );
  assert.deepEqual(after.data.allocations, before.data.allocations);
  const snapshot = structuredClone(after);
  assert.equal(
    (
      await write([
        { kind: "team", id: team.id, operation: "delete", value: null },
      ])
    ).status,
    409,
  );
  assert.equal(
    (await leader({ action: "delete", name: "Manual B" })).status,
    409,
  );
  after = await state();
  assert.deepEqual(
    after,
    snapshot,
    "rejected deletes must roll back all data and generation",
  );
  await store.close();
  const reopened = new Store({ env });
  try {
    await reopened.connect();
    const persisted = (await reopened.read()).data;
    assert.equal(
      persisted.teams.find((t) => t.id === team.id).name,
      "Moved team",
    );
    assert.equal(
      persisted.teams.find((t) => t.id === team.id).lead,
      "Manual B",
    );
    assert.equal(persisted.teams.find((t) => t.id === team.id).catalog, true);
    assert.equal(
      persisted.resources.find((r) => r.id === "linked-resource").versions[0]
        .lead,
      "Manual B",
    );
    assert.deepEqual(persisted.allocations, before.data.allocations);
  } finally {
    await reopened.close();
  }
});

test("HTTP CRUD with prototype-like team/project/resource/risk IDs preserves permissions, cascade revisions and account links", async (t) => {
  const { store, admin, request, user, state, write } = await setup(t);
  const initial = await state();
  const team = initial.data.teams.find((item) => item.lead);
  const other = initial.data.teams.find(
    (item) => item.lead && item.lead !== team.lead,
  );
  const ids = ["constructor", "toString", "__proto__"];
  const key = (id) => id + "|" + id + "|2026-09";
  const created = await write(
    ids.flatMap((id) => [
      {
        kind: "team",
        id,
        value: {
          id,
          name: "Team " + id,
          lead: team.lead,
          excelCapacity: 0,
          catalog: true,
        },
      },
      {
        kind: "project",
        id,
        value: {
          id,
          name: "Project " + id,
          start: "2026-01",
          end: "2026-12",
          phases: { "2026-09": "Analysis" },
        },
      },
      {
        kind: "resource",
        id,
        value: {
          id,
          name: "Person " + id,
          note: "Private",
          versions: [
            {
              team: id,
              lead: team.lead,
              effective: "2026-01",
              status: "Aktif Çalışan",
              included: true,
              start: "2026-01-01",
              end: "",
              amount: 1,
            },
          ],
        },
      },
      { kind: "allocation", id: key(id), value: 0.5 },
      { kind: "actual", id: key(id), value: 0.25 },
      { kind: "workedHours", id: id + "|2026-09", value: 180 },
      {
        kind: "personDay",
        id: id + "|2026-09-01|leave",
        value: { type: "leave", hours: 2, label: "Private absence" },
      },
    ]),
  );
  assert.equal(created.status, 200);
  const members = activeTeamMembers(created.json.data, "2026-09");
  for (const id of ids) assert.deepEqual(members[id], ["Person " + id]);
  const owner = await user("owner", "normal", "constructor");
  const outsider = await user("outsider", "normal", "toString");
  const manager = await user("manager", "manager", "", [team.lead]);
  for (const id of ids) {
    assert.equal(
      (await write([{ kind: "risk", id, value: risk(id) }], owner)).status,
      200,
    );
    const value = (await state()).data.risks.find((item) => item.id === id);
    assert.equal(
      (
        await write(
          [
            {
              kind: "risk",
              id,
              value: { ...value, description: "Owner update" },
            },
          ],
          outsider,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await write(
          [
            {
              kind: "risk",
              id,
              value: { ...value, description: "Owner update" },
            },
          ],
          owner,
        )
      ).status,
      200,
    );
    const latest = (await state()).data.risks.find((item) => item.id === id);
    assert.equal(
      (
        await write(
          [
            {
              kind: "risk",
              id,
              value: { ...latest, description: "Manager update" },
            },
          ],
          manager,
        )
      ).status,
      200,
    );
  }
  assert.equal(
    (
      await write(
        [
          {
            kind: "actual",
            id: key("constructor"),
            value: { unit: "percent", value: 20 },
          },
        ],
        owner,
      )
    ).status,
    200,
  );
  assert.equal(
    (await write([{ kind: "actual", id: key("toString"), value: 0.1 }], owner))
      .status,
    403,
  );
  assert.equal(
    (
      await write(
        [
          {
            kind: "allocation",
            id: other.id + "|constructor|2026-09",
            value: 0.2,
          },
        ],
        manager,
      )
    ).status,
    403,
  );
  const before = await state();
  assert.equal(
    (
      await write(
        [{ kind: "actual", id: key("constructor"), value: 0.1, revision: 1 }],
        owner,
      )
    ).status,
    409,
  );
  assert.deepEqual(await state(), before);
  assert.equal(
    (await write([{ kind: "team", id: "constructor", operation: "delete" }]))
      .status,
    409,
  );
  assert.equal(
    (
      await write(
        [{ kind: "risk", id: "constructor", operation: "delete" }],
        owner,
      )
    ).status,
    403,
  );
  const savedRisk = before.data.risks.find((item) => item.id === "constructor");
  assert.equal(
    (await write([{ kind: "project", id: "constructor", operation: "delete" }]))
      .status,
    200,
  );
  const deleted = await state();
  assert(!deleted.data.risks.some((item) => item.id === "constructor"));
  assert.equal(
    deleted.data.revisions["risk:constructor"],
    before.data.revisions["risk:constructor"] + 1,
  );
  assert(!Object.hasOwn(deleted.data.allocations, key("constructor")));
  assert(!Object.hasOwn(deleted.data.actualAllocations, key("constructor")));
  assert.equal(
    (
      await write([
        {
          kind: "project",
          id: "constructor",
          value: before.data.projects.find((item) => item.id === "constructor"),
        },
      ])
    ).status,
    200,
  );
  const recreated = await state();
  const stale = await write(
    [
      {
        kind: "risk",
        id: "constructor",
        value: savedRisk,
        revision: before.data.revisions["risk:constructor"],
      },
    ],
    owner,
  );
  assert.equal(stale.status, 409);
  assert.deepEqual(await state(), recreated);
  assert.equal(
    (
      await write([
        { kind: "resource", id: "constructor", operation: "delete" },
      ])
    ).status,
    200,
  );
  const removed = await state();
  assert(!removed.data.resources.some((item) => item.id === "constructor"));
  assert(!Object.hasOwn(removed.data.actualWorkedHours, "constructor|2026-09"));
  assert(
    !Object.hasOwn(removed.data.personCalendar, "constructor|2026-09-01|leave"),
  );
  assert.equal((await store.findUser({ id: "owner" })).resourceId, "");
  const currentOwner = await request("/auth/me", undefined, owner);
  assert.equal(currentOwner.status, 200);
  assert.equal(currentOwner.json.user.resourceId, "");
  assert.equal(
    (
      await write(
        [{ kind: "actual", id: key("constructor"), value: 0.1 }],
        owner,
      )
    ).status,
    403,
  );
  assert.equal(
    (await write([{ kind: "team", id: "constructor", operation: "delete" }]))
      .status,
    200,
  );
  const final = await state();
  for (const id of ["toString", "__proto__"]) {
    assert(final.data.teams.some((item) => item.id === id));
    assert(final.data.risks.some((item) => item.id === id));
    assert.equal(final.data.allocations[key(id)], 0.5);
  }
  const history = await request("/audit?limit=100", undefined, admin);
  assert.equal(history.status, 200);
  assert(!JSON.stringify(history.json).includes("[native code]"));
  assert(!JSON.stringify(history.json).includes("Private absence"));
});

test("HTTP leadership rename and manager updates support __proto__, survive backup/restart and retain account scopes", async (t) => {
  const { store, env, admin, request, user, state } = await setup(t);
  const initial = await state();
  const original = initial.data.teams.find((item) => item.lead).lead;
  await user("manager", "manager", "", [original]);
  async function change(body) {
    const current = await state();
    return request(
      "/leaders/change",
      { generation: current.generation, ...body },
      admin,
    );
  }
  assert.equal(
    (
      await change({
        action: "rename",
        name: original,
        newName: "constructor",
        managerName: "",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await change({
        action: "rename",
        name: "constructor",
        newName: "__proto__",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await change({
        action: "update",
        name: "__proto__",
        managerName: "Manager",
      })
    ).status,
    200,
  );
  const updated = await state();
  assert.equal(updated.data.leaderManagers.__proto__, "Manager");
  assert.equal(Object.hasOwn(updated.data.leaderManagers, "__proto__"), true);
  assert.deepEqual((await store.findUser({ id: "manager" })).leaders, [
    "__proto__",
  ]);
  const backup = await request("/backup", undefined, admin);
  assert.equal(backup.status, 200);
  assert.equal(backup.json.data.leaderManagers.__proto__, "Manager");
  const restored = await request(
    "/restore",
    { generation: updated.generation, data: backup.json.data },
    admin,
  );
  assert.equal(restored.status, 200);
  assert.equal(restored.json.data.leaderManagers.__proto__, "Manager");
  const invalid = structuredClone(backup.json.data);
  Object.defineProperty(invalid.leaderManagers, "__proto__", {
    value: { polluted: true },
    enumerable: true,
    writable: true,
  });
  const before = await state();
  const invalidRestore = await request(
    "/restore",
    { generation: before.generation, data: invalid },
    admin,
  );
  assert.equal(invalidRestore.status, 400);
  assert.deepEqual(await state(), before);
  assert.equal(Object.prototype.polluted, undefined);
  await store.close();
  const reopened = new Store({ env });
  try {
    await reopened.connect();
    const data = (await reopened.read()).data;
    assert.equal(Object.getPrototypeOf(data.leaderManagers), Object.prototype);
    assert.equal(data.leaderManagers.__proto__, "Manager");
    assert.deepEqual((await reopened.findUser({ id: "manager" })).leaders, [
      "__proto__",
    ]);
  } finally {
    await reopened.close();
  }
});

test("leadership rename rolls back SQL links and catalog on a late connection failure, then retries atomically", async (t) => {
  const { store, admin, request, user, state, write } = await setup(t);
  const team = (await state()).data.teams.find((item) => item.lead);
  await user("cascade-manager", "manager", "", [team.lead]);
  assert.equal(
    (
      await write([
        {
          kind: "resource",
          id: "cascade-worker",
          value: {
            id: "cascade-worker",
            name: "Synthetic cascade worker",
            note: "",
            versions: ["2026-01", "2026-07"].map((effective) => ({
              effective,
              team: team.id,
              lead: team.lead,
              start: "2026-01-01",
              end: "",
              status: "Aktif Çalışan",
              included: true,
              amount: 1,
            })),
          },
        },
      ])
    ).status,
    200,
  );
  const before = await state();
  const beforeUser = await store.findUser({ id: "cascade-manager" });
  const beforeAudit = (await request("/audit", undefined, admin)).json;
  const links = async () =>
    (
      await store.db.query(
        "SELECT * FROM kp_user_leaders ORDER BY user_id,leader_name",
      )
    ).rows;
  const beforeLinks = await links();
  const actor = await store.findUser({ id: "admin" });
  const change = {
    action: "rename",
    name: team.lead,
    newName: "Synthetic cascade renamed leadership",
    catalogRevision: directoryRevision(before.data),
  };
  let newLinksWritten = false,
    failureReached = false;
  await assert.rejects(
    store.mutate(
      actor,
      (data, active, connection, generation) =>
        applyLeaderChange(
          data,
          active,
          change,
          new Proxy(connection, {
            get(target, property) {
              if (property === "upsert")
                return async (table, rows) => {
                  await target.upsert(table, rows);
                  if (table === "user_leaders")
                    newLinksWritten = rows.length > 0;
                };
              if (property === "remove")
                return async (table, rows) => {
                  if (table === "user_leaders") {
                    assert(
                      newLinksWritten,
                      "fail only after replacement user links were written",
                    );
                    failureReached = true;
                    throw Error("Synthetic user-link removal failure");
                  }
                  return target.remove(table, rows);
                };
              const value = Reflect.get(target, property);
              return typeof value === "function" ? value.bind(target) : value;
            },
          }),
          generation,
        ),
      { auditUsers: true },
    ),
    /Synthetic user-link removal failure/,
  );
  assert(failureReached);
  assert.deepEqual(await state(), before);
  assert.deepEqual(await links(), beforeLinks);
  assert.deepEqual(await store.findUser({ id: "cascade-manager" }), beforeUser);
  assert.deepEqual(
    (await request("/audit", undefined, admin)).json,
    beforeAudit,
  );
  assert.deepEqual(
    (
      await store.db.query("SELECT name FROM kp_leaders WHERE name=@p0", [
        change.newName,
      ])
    ).rows,
    [],
  );
  assert.equal((await request("/leaders/change", change, admin)).status, 200);
  const after = await state();
  assert(after.data.leaders.includes(change.newName));
  assert(!after.data.leaders.includes(change.name));
  assert.equal(
    after.data.teams.find((item) => item.id === team.id).lead,
    change.newName,
  );
  assert.deepEqual(
    after.data.resources
      .find((item) => item.id === "cascade-worker")
      .versions.map((version) => version.lead),
    [change.newName, change.newName],
  );
  assert.equal(
    after.data.revisions["resource:cascade-worker"],
    before.data.revisions["resource:cascade-worker"] + 1,
  );
  assert.equal(
    after.data.revisions["team:" + team.id],
    (before.data.revisions["team:" + team.id] || 0) + 1,
  );
  assert.deepEqual((await store.findUser({ id: "cascade-manager" })).leaders, [
    change.newName,
  ]);
  assert.equal(
    directoryRevision(after.data),
    directoryRevision(before.data) + 1,
  );
  assert.equal(after.generation, before.generation + 1);
  await store.close();
  await store.connect();
  assert.deepEqual(await state(), after);
  assert.deepEqual((await store.findUser({ id: "cascade-manager" })).leaders, [
    change.newName,
  ]);
});

test("HTTP session identity is stable for one session, rotates on login without generation changes, and grants no authentication", async (t) => {
  const { admin, request, user, state } = await setup(t);
  const before = await state();
  const me = await request("/auth/me", undefined, admin);
  const marker = me.json.sessionIdentity;
  assert.match(marker, /^[a-f0-9]{64}$/);
  assert.equal(me.response.headers.get("X-Session-Identity"), marker);
  assert.notEqual(marker, admin.csrf);
  const version = await request("/version", undefined, admin);
  assert.equal(version.json.sessionIdentity, marker);
  assert.equal(version.json.generation, before.generation);
  assert.equal(
    (await request("/data", undefined, admin)).response.headers.get(
      "X-Session-Identity",
    ),
    marker,
  );
  const next = await user("admin");
  const nextVersion = await request("/version", undefined, next);
  assert.notEqual(nextVersion.json.sessionIdentity, marker);
  assert.equal(nextVersion.json.generation, before.generation);
  const denied = await request(
    "/changes",
    { changes: [] },
    { cookie: next.cookie, csrf: admin.csrf },
  );
  assert.equal(denied.status, 403);
  assert.equal(
    denied.response.headers.get("X-Session-Identity"),
    nextVersion.json.sessionIdentity,
  );
  assert.deepEqual((await state()).data, before.data);
  const forgery = await request("/auth/me", undefined, {
    cookie: "kp_session=" + marker,
  });
  assert.equal(forgery.status, 401);
  assert.equal(forgery.response.headers.get("X-Session-Identity"), null);
});

test("mixed actual/calendar batches preserve deferred revisions and roll back every staged kind", async (t) => {
  for (const reverse of [false, true])
    await t.test(
      reverse ? "reverse command order" : "forward command order",
      async (t) => {
        const { store, state, write } = await setup(t);
        const team = (await state()).data.teams.find((item) => item.lead);
        const month = "2026-09";
        const actual = (resource, project, period = month) =>
          `${resource}|${project}|${period}`;
        const resource = (id) => ({
          id,
          name: "Synthetic " + id,
          note: "",
          versions: [
            {
              effective: "2026-01",
              start: "2026-01-01",
              end: "",
              team: team.id,
              lead: team.lead,
              status: "Aktif Çalışan",
              included: true,
              amount: 1,
            },
          ],
        });
        assert.equal(
          (
            await write([
              ...["p", "q"].map((id) => ({
                kind: "project",
                id,
                value: {
                  id,
                  name: "Synthetic " + id,
                  start: "2026-01",
                  end: "2026-12",
                  phases: {},
                },
              })),
              ...["r", "s"].map((id) => ({
                kind: "resource",
                id,
                value: resource(id),
              })),
              { kind: "workedHours", id: "r|" + month, value: 200 },
              {
                kind: "actual",
                id: actual("r", "p"),
                value: { unit: "percent", value: 50 },
              },
              {
                kind: "actual",
                id: actual("r", "q"),
                value: { unit: "percent", value: 25 },
              },
              {
                kind: "actual",
                id: actual("s", "p"),
                value: { unit: "percent", value: 50 },
              },
              {
                kind: "actual",
                id: actual("s", "p", "2026-08"),
                value: { unit: "percent", value: 50 },
              },
            ])
          ).status,
          200,
        );
        const before = await state();
        const changes = [
          {
            kind: "calendar",
            id: "shared",
            value: {
              "2026-09-01": {
                type: "official",
                label: "Synthetic half day",
                fraction: 0.5,
              },
            },
          },
          {
            kind: "personDay",
            id: "r|2026-09-02|leave",
            value: { type: "leave", hours: 2, label: "" },
          },
          {
            kind: "personDay",
            id: "r|2026-09-03|training",
            value: { type: "training", hours: 3, label: "" },
          },
          { kind: "workedHours", id: "r|" + month, value: 100 },
          {
            kind: "actual",
            id: actual("r", "p"),
            value: { unit: "hours", value: 30 },
          },
          {
            kind: "actual",
            id: actual("r", "q"),
            value: { unit: "percent", value: 20 },
          },
        ];
        const ordered = reverse ? [...changes].reverse() : changes;
        const audit = async () =>
          (await store.db.query("SELECT * FROM kp_audit_events ORDER BY id"))
            .rows;
        const beforeAudit = await audit();
        // A late stale revision must undo calendar, personal day, hours and actual edits.
        assert.equal(
          (
            await write(
              ordered.map((change, index) =>
                index === ordered.length - 1
                  ? { ...change, revision: 999 }
                  : change,
              ),
            )
          ).status,
          409,
        );
        assert.deepEqual(await state(), before);
        assert.deepEqual(await audit(), beforeAudit);
        // A valid command sequence that exceeds capacity fails only at finalization.
        assert.equal(
          (
            await write([
              ...ordered,
              { kind: "workedHours", id: "s|" + month, value: 1 },
            ])
          ).status,
          400,
        );
        assert.deepEqual(await state(), before);
        assert.deepEqual(await audit(), beforeAudit);
        assert.equal((await write(ordered)).status, 200);
        const saved = await state();
        const d = saved.data;
        // Percent input uses the hours at its position in the command sequence;
        // final percentages use final hours. Both existing semantics must survive.
        const qHours = reverse ? 40 : 18.7;
        // 100 manual hours minus 4.5 holiday hours and 2 leave hours.
        const finalHours = 93.5;
        assert(
          Math.abs(d.actualAllocations[actual("r", "q")] * 180 - qHours) < 1e-9,
        );
        assert(
          Math.abs(
            d.actualPercentEntries[actual("r", "q")] -
              (qHours / finalHours) * 100,
          ) < 1e-9,
        );
        assert.equal(
          d.revisions["actual:" + actual("r", "q")],
          reverse ? 3 : 2,
        );
        assert.equal(d.actualAllocations[actual("r", "p")], 30 / 180);
        assert.equal(d.actualPercentEntries[actual("r", "p")], undefined);
        assert.equal(d.revisions["actual:" + actual("r", "p")], 2);
        assert.equal(d.actualWorkedHours["r|" + month], 100);
        assert.equal(d.personCalendar["r|2026-09-02|leave"].hours, 2);
        assert.equal(d.personCalendar["r|2026-09-03|training"].hours, 3);
        const otherKey = actual("s", "p"),
          untouchedKey = actual("s", "p", "2026-08");
        assert.equal(
          d.actualAllocations[otherKey],
          before.data.actualAllocations[otherKey],
        );
        assert(
          d.actualPercentEntries[otherKey] >
            before.data.actualPercentEntries[otherKey],
        );
        assert.equal(d.revisions["actual:" + otherKey], 2);
        assert.equal(
          d.actualPercentEntries[untouchedKey],
          before.data.actualPercentEntries[untouchedKey],
        );
        assert.equal(d.revisions["actual:" + untouchedKey], 1);
        assert.equal(saved.generation, before.generation + 1);
        const persisted = await store.read();
        await store.close();
        const reopened = new Store({ env: store.env });
        try {
          await reopened.connect();
          assert.deepEqual(await reopened.read(), persisted);
        } finally {
          await reopened.close();
        }
      },
    );
});

test("project/resource cascades roll back after SQL deletion and retain child ABA protection", async (t) => {
  for (const kind of ["project", "resource"])
    await t.test(kind, async (t) => {
      const { store, state, write, user, request } = await setup(t);
      const team = (await state()).data.teams.find((item) => item.lead);
      const key = (resource, project) => `${resource}|${project}|2026-09`;
      const project = (id) => ({
        id,
        name: "Synthetic " + id,
        start: "2026-01",
        end: "2026-12",
        sortOrder: id === "p" ? 0 : 1,
        phases: { "2026-09": "Analysis" },
        phaseColors: { "2026-09": "blue" },
        milestones: [
          {
            id: "heading",
            name: "Synthetic heading",
            start: "2026-09-01",
            end: "2026-09-02",
            barNotes: [
              {
                text: "Synthetic note",
                includeInReport: true,
                start: "2026-09-01",
                end: "2026-09-02",
              },
            ],
          },
        ],
      });
      const resource = (id) => ({
        id,
        name: "Synthetic " + id,
        note: "",
        versions: ["2026-01", "2026-07"].map((effective) => ({
          effective,
          start: "2026-01-01",
          end: "",
          team: team.id,
          lead: team.lead,
          status: "Aktif Çalışan",
          included: true,
          amount: 1,
        })),
      });
      assert.equal(
        (
          await write([
            ...["p", "q"].map((id) => ({
              kind: "project",
              id,
              value: project(id),
            })),
            ...["r", "s"].map((id) => ({
              kind: "resource",
              id,
              value: resource(id),
            })),
            ...["p", "q"].map((id) => ({ kind: "risk", id, value: risk(id) })),
            ...["p", "q"].map((id) => ({
              kind: "allocation",
              id: key(team.id, id),
              value: 0.5,
            })),
            ...["r", "s"].flatMap((id) => [
              { kind: "workedHours", id: id + "|2026-09", value: 180 },
              {
                kind: "personDay",
                id: id + "|2026-09-01|leave",
                value: { type: "leave", hours: 2, label: "" },
              },
              ...["p", "q"].map((p) => ({
                kind: "actual",
                id: key(id, p),
                value: { unit: "percent", value: 25 },
              })),
            ]),
          ])
        ).status,
        200,
      );
      const owner = await user("cascade-owner", "normal", "r");
      const actor = await store.findUser({ id: "admin" });
      // Synthetic historical archive, written only to this temporary fixture.
      await store.mutate(actor, (d) => {
        d.legacyArchive = {
          teams: [],
          resourceTeams: {},
          allocations: {
            [key("archived", "p")]: 0.4,
            [key("archived", "q")]: 0.6,
          },
        };
      });
      const before = await state(),
        beforeOwner = await store.findUser({ id: "cascade-owner" });
      const targetId = kind === "project" ? "p" : "r";
      const deletion = {
        kind,
        id: targetId,
        operation: "delete",
        revision: before.data.revisions[kind + ":" + targetId],
      };
      const audit = async () =>
        (await store.db.query("SELECT * FROM kp_audit_events ORDER BY id"))
          .rows;
      const beforeAudit = await audit();
      const staleChild =
        kind === "project"
          ? {
              kind: "risk",
              id: "p",
              value: before.data.risks.find((r) => r.id === "p"),
              revision: before.data.revisions["risk:p"],
            }
          : {
              kind: "personDay",
              id: "r|2026-09-01|leave",
              operation: "delete",
              revision: before.data.revisions["personDay:r|2026-09-01|leave"],
            };
      assert.equal((await write([deletion, staleChild])).status, 409);
      assert.deepEqual(await state(), before);
      assert.deepEqual(await audit(), beforeAudit);
      assert.deepEqual(
        await store.findUser({ id: "cascade-owner" }),
        beforeOwner,
      );
      // This Store instance's persistence receives a local connection proxy.
      // Let parent/child SQL deletes (and resource FK SET NULL) really execute,
      // then fail before revision/audit/generation persistence can complete.
      const persist = store.persist;
      let reached = false;
      store.persist = function (previous, next, connection) {
        return persist.call(
          this,
          previous,
          next,
          new Proxy(connection, {
            get(target, property) {
              const fn = Reflect.get(target, property, target);
              if (property === "remove")
                return async (name, keys) => {
                  const result = await fn.call(target, name, keys);
                  if (
                    name === (kind === "project" ? "projects" : "resources") &&
                    keys.some((k) => k.id === targetId)
                  ) {
                    reached = true;
                    if (kind === "resource") {
                      const row = (
                        await target.query(
                          "SELECT resource_id FROM kp_users WHERE id=@p0",
                          ["cascade-owner"],
                        )
                      ).rows[0];
                      assert.equal(row.resource_id, null);
                    } else {
                      const rows = (
                        await target.query(
                          "SELECT COUNT(*) AS n FROM kp_project_milestones WHERE project_id=@p0",
                          ["p"],
                        )
                      ).rows;
                      assert.equal(rows[0].n, 0);
                    }
                    throw Error("Synthetic late cascade failure");
                  }
                  return result;
                };
              return typeof fn === "function" ? fn.bind(target) : fn;
            },
          }),
        );
      };
      try {
        await assert.rejects(
          () => store.mutate(actor, (d, u) => stageChanges(d, u, [deletion])),
          /Synthetic late cascade failure/,
        );
      } finally {
        delete store.persist;
      }
      assert(reached);
      assert.deepEqual(await state(), before);
      assert.deepEqual(await audit(), beforeAudit);
      assert.deepEqual(
        await store.findUser({ id: "cascade-owner" }),
        beforeOwner,
      );
      assert.equal((await write([deletion])).status, 200);
      const removed = await state(),
        d = removed.data;
      const children = [];
      assert.equal(removed.generation, before.generation + 1);
      assert.equal(d.revisions[kind + ":" + targetId], deletion.revision + 1);
      for (const r of ["r", "s"])
        for (const p of ["p", "q"]) {
          const id = key(r, p),
            matches = kind === "project" ? p === "p" : r === "r";
          if (matches) {
            assert.equal(d.actualAllocations[id], undefined);
            assert.equal(d.actualPercentEntries[id], undefined);
            assert.equal(
              d.revisions["actual:" + id],
              before.data.revisions["actual:" + id] + 1,
            );
            children.push({
              kind: "actual",
              id,
              value: 0.1,
              revision: before.data.revisions["actual:" + id],
            });
          } else {
            assert.equal(
              d.actualAllocations[id],
              before.data.actualAllocations[id],
            );
            assert.equal(
              d.actualPercentEntries[id],
              before.data.actualPercentEntries[id],
            );
            assert.equal(
              d.revisions["actual:" + id],
              before.data.revisions["actual:" + id],
            );
          }
        }
      if (kind === "project") {
        assert.deepEqual(d.projects, [
          before.data.projects.find((p) => p.id === "q"),
        ]);
        assert.deepEqual(d.resources, before.data.resources);
        assert.equal(
          d.risks.find((r) => r.id === "p"),
          undefined,
        );
        assert.deepEqual(
          d.risks.find((r) => r.id === "q"),
          before.data.risks.find((r) => r.id === "q"),
        );
        assert.equal(d.allocations[key(team.id, "p")], undefined);
        assert.equal(
          d.revisions["allocation:" + key(team.id, "p")],
          before.data.revisions["allocation:" + key(team.id, "p")] + 1,
        );
        assert.equal(
          d.legacyArchive.allocations[key("archived", "p")],
          undefined,
        );
        assert.equal(d.legacyArchive.allocations[key("archived", "q")], 0.6);
        assert.deepEqual(d.actualWorkedHours, before.data.actualWorkedHours);
        assert.deepEqual(d.personCalendar, before.data.personCalendar);
        assert.deepEqual(
          await store.findUser({ id: "cascade-owner" }),
          beforeOwner,
        );
        children.push(staleChild, {
          kind: "allocation",
          id: key(team.id, "p"),
          value: 0.2,
          revision: before.data.revisions["allocation:" + key(team.id, "p")],
        });
      } else {
        assert.deepEqual(d.projects, before.data.projects);
        assert.deepEqual(d.risks, before.data.risks);
        assert.deepEqual(d.allocations, before.data.allocations);
        assert.equal(
          d.resources.some((r) => r.id === "r"),
          false,
        );
        assert.deepEqual(
          d.resources.find((r) => r.id === "s"),
          before.data.resources.find((r) => r.id === "s"),
        );
        assert.equal(d.actualWorkedHours["r|2026-09"], undefined);
        assert.equal(d.personCalendar["r|2026-09-01|leave"], undefined);
        assert.equal(
          (await store.findUser({ id: "cascade-owner" })).resourceId,
          "",
        );
        assert.equal(
          (await request("/auth/me", undefined, owner)).json.user.resourceId,
          "",
        );
        children.push(staleChild, {
          kind: "workedHours",
          id: "r|2026-09",
          value: 180,
          revision: before.data.revisions["workedHours:r|2026-09"],
        });
      }
      const collection = kind === "project" ? "projects" : "resources";
      assert.equal(
        (
          await write([
            {
              kind,
              id: targetId,
              value: before.data[collection].find((x) => x.id === targetId),
            },
          ])
        ).status,
        200,
      );
      const recreated = await state(),
        recreatedAudit = await audit();
      for (const child of children)
        assert.equal((await write([child])).status, 409);
      assert.deepEqual(await state(), recreated);
      assert.deepEqual(await audit(), recreatedAudit);
      if (kind === "resource") {
        assert.equal(
          (await store.findUser({ id: "cascade-owner" })).resourceId,
          "",
          "recreation must not silently re-link an account",
        );
        assert.equal(
          (
            await write(
              [{ kind: "actual", id: key("r", "p"), value: 0.1 }],
              owner,
            )
          ).status,
          403,
        );
      }
      const persisted = await store.read();
      await store.close();
      const reopened = new Store({ env: store.env });
      try {
        await reopened.connect();
        assert.deepEqual(await reopened.read(), persisted);
      } finally {
        await reopened.close();
      }
    });
});

test("AD provisioning and manager ownership preserve authorization boundaries", async (t) => {
  const password = "Directory-account-test-only-345!";
  const directory = syntheticDirectory(password);
  const people = [
    ["1", "new.manager"],
    ["2", "new.employee"],
    ["3", "race.one"],
    ["4", "race.two"],
    ["5", "long.employee"],
  ].map(([id, username]) => ({
    id: id.repeat(32),
    username,
    name: "Directory " + username,
    email: username + "@example.test",
  }));
  people.forEach((u) => directory.add(u));
  const { store, admin, request, user, state, write } = await setup(t, {
    directory,
  });
  const teams = (await state()).data.teams,
    teamA = teams.find((x) => x.lead),
    teamB = teams.find((x) => x.lead && x.lead !== teamA.lead);
  const resource = (id, status = "Aktif Çalışan") => ({
    id,
    name: "Synthetic " + id,
    note: "",
    versions: [
      {
        effective: "2026-01",
        start: "2026-01-01",
        end: "",
        team: teamB.id,
        lead: teamB.lead,
        status,
        included: true,
        amount: 1,
      },
    ],
  });
  assert.equal(
    (
      await write([
        {
          kind: "project",
          id: "p",
          value: {
            id: "p",
            name: "Synthetic project",
            start: "2026-01",
            end: "2026-12",
            phases: {},
          },
        },
        ...["employee-a", "employee-b", "employee-c"].map((id) => ({
          kind: "resource",
          id,
          value: resource(id),
        })),
        {
          kind: "resource",
          id: "advert",
          value: resource("advert", "Aktif İlan"),
        },
      ])
    ).status,
    200,
  );
  const create = (patch = {}) => ({
    directoryId: people[0].id,
    role: "manager",
    leaders: [teamA.lead],
    resourceId: "employee-a",
    ...patch,
  });
  let managerId, managerAuth;
  async function login(username) {
    const result = await request("/auth/login", { username, password });
    assert.equal(result.status, 200);
    return {
      cookie: result.response.headers.get("set-cookie").split(";")[0],
      csrf: result.json.csrf,
    };
  }
  await t.test(
    "only admins list/provision AD users; manual identity fields and invalid scope are rejected",
    async () => {
      const ordinary = await user("provision-denied", "normal"),
        manager = await user("provision-manager-denied", "manager", "", [
          teamA.lead,
        ]);
      for (const auth of [{}, ordinary, manager]) {
        assert.equal(
          (await request("/users/create", create(), auth)).status,
          auth.cookie ? 403 : 401,
        );
        assert.equal(
          (await request("/directory/users", undefined, auth)).status,
          auth.cookie ? 403 : 401,
        );
      }
      const listing = await request(
        "/directory/users?q=new.manager",
        undefined,
        admin,
      );
      assert.equal(listing.status, 200);
      assert.deepEqual(listing.json.users, [people[0]]);
      for (const patch of [
        { password },
        { username: "forged" },
        { name: "forged" },
        { email: "forged@example.test" },
        { role: "invalid" },
        { directoryId: "0".repeat(32) },
        { resourceId: "" },
        { resourceId: "missing" },
        { resourceId: "advert" },
        { leaders: ["missing"] },
        { unexpected: true },
      ])
        assert.equal(
          (await request("/users/create", create(patch), admin)).status,
          400,
        );
      assert.equal(await store.findUser({ username: "new.manager" }), null);
    },
  );
  await t.test(
    "AD manager keeps own actual/calendar access outside assigned leadership with directory identity",
    async () => {
      const result = await request("/users/create", create(), admin);
      assert.equal(result.status, 200);
      const account = result.json.data.users.find(
        (u) => u.username === "new.manager",
      );
      managerId = account.id;
      assert.equal(account.resourceId, "employee-a");
      assert.equal(account.name, people[0].name);
      assert.equal(account.email, people[0].email);
      assert.equal(account.authSource, "ldap");
      assert.equal(account.directoryId, people[0].id);
      managerAuth = await login("new.manager");
      assert.equal(
        (
          await write(
            [
              { kind: "actual", id: "employee-a|p|2026-09", value: 0.25 },
              {
                kind: "personDay",
                id: "employee-a|2026-09-02|leave",
                value: { type: "leave", hours: 2, label: "Synthetic leave" },
              },
            ],
            managerAuth,
          )
        ).status,
        200,
      );
      const view = (await request("/data", undefined, managerAuth)).json.data;
      assert.equal(view.actualAllocations["employee-a|p|2026-09"], 0.25);
      assert.equal(view.personCalendar["employee-a|2026-09-02|leave"].hours, 2);
      assert.equal(
        view.resources.find((r) => r.id === "employee-a").name,
        "Synthetic employee-a",
      );
      assert.equal(view.resources.find((r) => r.id === "employee-b").name, "");
      assert.equal(
        (
          await write(
            [{ kind: "actual", id: "employee-b|p|2026-09", value: 0.1 }],
            managerAuth,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await write(
            [
              {
                kind: "personDay",
                id: "employee-b|2026-09-02|leave",
                value: { type: "leave", hours: 2 },
              },
            ],
            managerAuth,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await write(
            [{ kind: "allocation", id: teamB.id + "|p|2026-09", value: 1 }],
            managerAuth,
          )
        ).status,
        403,
      );
    },
  );
  await t.test(
    "duplicate AD identities, local username collisions and concurrent employee linkage are atomic",
    async () => {
      assert.equal(
        (
          await request(
            "/users/create",
            create({ resourceId: "employee-b" }),
            admin,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await request(
            "/users/create",
            create({ directoryId: people[1].id }),
            admin,
          )
        ).status,
        409,
      );
      directory.add({
        id: "6".repeat(32),
        username: "record.admin",
        name: "Directory collision",
        email: "collision@example.test",
      });
      assert.equal(
        (
          await request(
            "/users/create",
            create({ directoryId: "6".repeat(32), resourceId: "employee-b" }),
            admin,
          )
        ).status,
        409,
      );
      assert.equal((await store.findUser({ id: "admin" })).authSource, "local");
      const results = await Promise.all(
        [people[2].id, people[3].id].map((directoryId) =>
          request(
            "/users/create",
            create({ directoryId, resourceId: "employee-c" }),
            admin,
          ),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        (await state()).data.users.filter((u) => u.resourceId === "employee-c")
          .length,
        1,
      );
    },
  );
  await t.test(
    "role changes preserve AD identity and employee link, reject stale edits and revoke sessions",
    async () => {
      const revision = (await state()).data.revisions["user:" + managerId];
      const edit = {
        id: managerId,
        role: "normal",
        leaders: [],
        resourceId: "employee-a",
        revision,
      };
      assert.equal((await request("/users", edit, admin)).status, 200);
      assert.equal(
        (await request("/data", undefined, managerAuth)).status,
        401,
      );
      assert.equal(
        (await request("/users", { ...edit, role: "manager" }, admin)).status,
        409,
      );
      const result = await request(
        "/users",
        { ...edit, role: "manager", revision: revision + 1 },
        admin,
      );
      assert.equal(result.status, 200);
      assert.equal(
        result.json.data.users.find((u) => u.id === managerId).directoryId,
        people[0].id,
      );
      managerAuth = await login("new.manager");
      assert.equal(
        (await request("/data", undefined, managerAuth)).json.data
          .actualAllocations["employee-a|p|2026-09"],
        0.25,
      );
    },
  );
  await t.test(
    "a directory display name does not overwrite the employee's name",
    async () => {
      const person = { ...resource("long-name"), name: "E".repeat(200) };
      assert.equal(
        (await write([{ kind: "resource", id: person.id, value: person }]))
          .status,
        200,
      );
      assert.equal(
        (
          await request(
            "/users/create",
            create({ directoryId: people[4].id, resourceId: person.id }),
            admin,
          )
        ).status,
        200,
      );
      assert.equal(
        (await store.findUser({ username: "long.employee" })).name,
        people[4].name,
      );
      assert.equal(
        (await state()).data.resources.find((r) => r.id === person.id).name,
        person.name,
      );
    },
  );
  await t.test(
    "normal AD accounts authenticate only through AD; passwords never reach snapshots, backups or audit",
    async () => {
      assert.equal(
        (
          await request(
            "/users/create",
            create({
              directoryId: people[1].id,
              role: "normal",
              resourceId: "employee-b",
              leaders: [],
            }),
            admin,
          )
        ).status,
        200,
      );
      const auth = await login("new.employee"),
        view = (await request("/data", undefined, auth)).json.data;
      assert.equal(view.users, undefined);
      assert.equal(view.actualAllocations["employee-a|p|2026-09"], undefined);
      const stored = await store.findUser({ username: "new.employee" });
      assert.equal(await verifyPassword(password, stored.password), false);
      for (const url of ["/data", "/backup", "/audit?limit=100"]) {
        const text = JSON.stringify(
          (await request(url, undefined, admin)).json,
        );
        for (const secret of [
          password,
          stored.password.salt,
          stored.password.hash,
        ])
          assert.equal(text.includes(secret), false);
      }
      assert.equal(
        (
          await request("/auth/login", {
            username: "new.employee",
            password: "wrong",
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await request("/auth/login", {
            username: "new.employee",
            password: "",
          })
        ).status,
        401,
      );
      directory.disable(people[1].id);
      assert.equal((await request("/data", undefined, auth)).status, 401);
      assert.equal(
        (await request("/auth/login", { username: "new.employee", password }))
          .status,
        401,
      );
    },
  );
  await t.test(
    "AD renames synchronize profile by immutable identity and revoke prior sessions",
    async () => {
      directory.update(people[0].id, {
        username: "renamed.manager",
        name: "Updated Directory Name",
        email: "renamed@example.test",
      });
      const auth = await login("renamed.manager");
      const stored = await store.findUser({ id: managerId });
      assert.equal(stored.email, "renamed@example.test");
      assert.equal(stored.resourceId, "employee-a");
      assert.equal(stored.authSource, "ldap");
      assert.equal(
        (await request("/data", undefined, managerAuth)).status,
        401,
      );
      assert.equal(
        (await request("/auth/login", { username: "new.manager", password }))
          .status,
        401,
      );
      assert.equal((await request("/data", undefined, auth)).status, 200);
      managerAuth = auth;
    },
  );
  const awaitHash = await hashPassword(password);
  await t.test(
    "directory failure never enables local password fallback or accepts a fabricated identity",
    async () => {
      const existing = await store.findUser({ id: managerId });
      await store.transaction((c) =>
        store.saveUser({ ...existing, password: awaitHash }, c),
      );
      directory.setUnavailable(true);
      assert.equal(
        (
          await request("/auth/login", {
            username: "renamed.manager",
            password,
          })
        ).status,
        503,
      );
      assert.equal(
        (await request("/data", undefined, managerAuth)).status,
        503,
      );
      assert.equal(
        (
          await request(
            "/users/create",
            create({ directoryId: "7".repeat(32), resourceId: "employee-b" }),
            admin,
          )
        ).status,
        503,
      );
      assert.equal((await request("/data", undefined, admin)).status, 200);
      directory.setUnavailable(false);
    },
  );
});

test("permission revocation closes sessions, preserves business history and explicitly regrants same identity", async (t) => {
  const { store, admin, user, request, state, write } = await setup(t);
  const team = (await state()).data.teams.find((team) => team.lead);
  assert.equal(
    (
      await write([
        {
          kind: "project",
          id: "p-revoke",
          value: {
            id: "p-revoke",
            name: "Synthetic retained project",
            start: "2026-01",
            end: "2026-12",
            phases: {},
          },
        },
        {
          kind: "resource",
          id: "r-revoke",
          value: {
            id: "r-revoke",
            name: "Synthetic retained employee",
            note: "",
            versions: [
              {
                team: team.id,
                lead: team.lead,
                effective: "2026-01",
                start: "2026-01-01",
                end: "",
                status: "Aktif Çalışan",
                included: true,
                amount: 1,
              },
            ],
          },
        },
        { kind: "risk", id: "p-revoke", value: risk("p-revoke") },
      ])
    ).status,
    200,
  );
  const target = await user("revoke-target", "normal", "r-revoke", [team.lead]);
  const before = await state();
  const old = await store.findUser({ id: "revoke-target" });
  assert.equal(
    (
      await request(
        "/users/revoke",
        { id: old._id, revision: old.revision },
        admin,
      )
    ).status,
    200,
  );
  const removed = await store.findUser({ id: old._id });
  assert.equal(removed.active, false);
  assert.equal(removed.resourceId, "");
  assert.deepEqual(removed.leaders, []);
  assert.equal(removed.version, old.version + 1);
  assert.equal((await request("/data", undefined, target)).status, 401);
  assert.equal(
    (
      await request("/auth/login", {
        username: old.username,
        password: "Record-access-test-only-284!",
      })
    ).status,
    401,
  );
  const after = await state();
  for (const key of [
    "resources",
    "projects",
    "risks",
    "actuals",
    "allocations",
  ])
    assert.deepEqual(after.data[key], before.data[key]);
  assert.equal(after.generation, before.generation + 1);
  assert.equal(
    (
      await request(
        "/users",
        {
          id: old._id,
          revision: removed.revision,
          role: old.role,
          leaders: old.leaders,
          resourceId: old.resourceId,
        },
        admin,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        "/users",
        {
          id: old._id,
          revision: removed.revision,
          role: old.role,
          leaders: old.leaders,
          resourceId: old.resourceId,
          reactivate: true,
        },
        admin,
      )
    ).status,
    200,
  );
  const restored = await store.findUser({ id: old._id });
  assert.equal(restored.active, true);
  assert.equal(restored._id, old._id);
  assert.equal(restored.resourceId, old.resourceId);
  assert.equal((await request("/data", undefined, target)).status, 401);
  assert.equal(
    (
      await request("/auth/login", {
        username: old.username,
        password: "Record-access-test-only-284!",
      })
    ).status,
    200,
  );
});

test("permission revocation enforces admin, CSRF, protected root and optimistic revision", async (t) => {
  const { store, admin, user, request, state } = await setup(t);
  const normal = await user("normal-revoke", "normal");
  const manager = await user("manager-revoke", "manager");
  await user("root-admin");
  await user("target-revoke");
  const before = await state();
  const old = await store.findUser({ id: "target-revoke" });
  const input = { id: old._id, revision: old.revision };
  for (const [auth, body, expected] of [
    [{}, input, 401],
    [normal, input, 403],
    [manager, input, 403],
    [{ ...admin, csrf: "wrong" }, input, 403],
    [admin, { ...input, revision: 0 }, 409],
    [admin, { ...input, unexpected: true }, 400],
    [admin, { id: "missing", revision: 1 }, 404],
    [admin, { id: "root-admin", revision: 1 }, 403],
  ])
    assert.equal((await request("/users/revoke", body, auth)).status, expected);
  assert.deepEqual(await store.findUser({ id: old._id }), old);
  assert.deepEqual(await state(), before);
  const results = await Promise.all([
    request("/users/revoke", input, admin),
    request(
      "/users",
      { ...input, role: "manager", leaders: [], resourceId: "" },
      admin,
    ),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});

test("self revocation commits without returning privileged snapshot; failed write rolls back", async (t) => {
  const { store, admin, user, request, state } = await setup(t);
  const self = await user("self-revoke");
  const result = await request(
    "/users/revoke",
    { id: "self-revoke", revision: 1 },
    self,
  );
  assert.equal(result.status, 401);
  assert.equal(result.json.data, undefined);
  assert.equal((await store.findUser({ id: "self-revoke" })).active, false);
  await user("rollback-revoke");
  const before = await state();
  const old = await store.findUser({ id: "rollback-revoke" });
  const original = store.revokeUser;
  store.revokeUser = async () => {
    throw new Error("Synthetic revoke failure");
  };
  t.after(() => {
    store.revokeUser = original;
  });
  assert.equal(
    (await request("/users/revoke", { id: old._id, revision: 1 }, admin))
      .status,
    500,
  );
  store.revokeUser = original;
  assert.deepEqual(await store.findUser({ id: old._id }), old);
  assert.deepEqual(await state(), before);
});

test("revoked AD identity cannot reprovision or login; regrant preserves GUID and audit history", async (t) => {
  const password = "Synthetic-AD-regrant-only-729!";
  const directory = syntheticDirectory(password);
  const person = {
    id: "b".repeat(32),
    username: "synthetic.ad.regrant",
    name: "Synthetic AD Regrant",
    email: "regrant@example.test",
  };
  directory.add(person);
  const { store, admin, request, state, write } = await setup(t, { directory });
  const team = (await state()).data.teams.find((t) => t.lead);
  await write([
    {
      kind: "resource",
      id: "r-ad-regrant",
      value: {
        id: "r-ad-regrant",
        name: "Synthetic employee",
        note: "",
        versions: [
          {
            team: team.id,
            lead: team.lead,
            effective: "2026-01",
            start: "2026-01-01",
            end: "",
            status: "Aktif Çalışan",
            included: true,
            amount: 1,
          },
        ],
      },
    },
  ]);
  const input = {
    directoryId: person.id,
    role: "normal",
    leaders: [team.lead],
    resourceId: "r-ad-regrant",
  };
  assert.equal((await request("/users/create", input, admin)).status, 200);
  const old = await store.findUser({ directoryId: person.id });
  const login = () =>
    request("/auth/login", { username: person.username, password });
  assert.equal((await login()).status, 200);
  assert.equal(
    (
      await request(
        "/users/revoke",
        { id: old._id, revision: old.revision },
        admin,
      )
    ).status,
    200,
  );
  assert.equal((await login()).status, 401);
  assert.equal((await request("/users/create", input, admin)).status, 409);
  const removed = await store.findUser({ id: old._id });
  assert.equal(
    (
      await request(
        "/users",
        {
          id: old._id,
          revision: removed.revision,
          role: "normal",
          leaders: [team.lead],
          resourceId: "r-ad-regrant",
          reactivate: true,
        },
        admin,
      )
    ).status,
    200,
  );
  assert.equal((await login()).status, 200);
  const restored = await store.findUser({ directoryId: person.id });
  assert.equal(restored._id, old._id);
  assert.equal(restored.authSource, "ldap");
  const history = (await request("/audit?limit=100", undefined, admin)).json;
  assert(JSON.stringify(history).includes(old._id));
  assert(!JSON.stringify(history).includes(password));
});

test("leadership hierarchy persists, rejects cycles and protected deletion, renames links and restores backup", async (t) => {
  const { store, request, admin, state } = await setup(t);
  async function change(input) {
    const current = await state();
    return request(
      "/leaders/change",
      { ...input, catalogRevision: directoryRevision(current.data) },
      admin,
    );
  }
  for (const name of ["QA Root", "QA Child", "QA Grandchild"])
    assert.equal((await change({ action: "create", name })).status, 200);
  assert.equal(
    (
      await change({
        action: "update",
        name: "QA Child",
        parentName: "QA Root",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await change({
        action: "update",
        name: "QA Grandchild",
        parentName: "QA Child",
      })
    ).status,
    200,
  );
  const before = await state();
  for (const input of [
    { action: "update", name: "QA Root", parentName: "QA Grandchild" },
    { action: "update", name: "QA Child", parentName: "QA Child" },
    { action: "update", name: "QA Child", parentName: "Missing" },
  ])
    assert.equal((await change(input)).status, 400);
  assert.deepEqual(await state(), before);
  assert.equal(
    (await change({ action: "delete", name: "QA Root" })).status,
    409,
  );
  assert.equal(
    (await change({ action: "update", name: "QA Root", newName: "QA Renamed" }))
      .status,
    200,
  );
  assert.equal((await state()).data.leaderParents["QA Child"], "QA Renamed");
  assert.equal(
    (await change({ action: "update", name: "QA Child", newName: "__proto__" }))
      .status,
    200,
  );
  assert.equal(
    (await state()).data.leaderParents["QA Grandchild"],
    "__proto__",
  );
  assert.equal((await state()).data.leaderParents["__proto__"], "QA Renamed");
  const backup = await request("/backup", undefined, admin);
  assert.equal(backup.status, 200);
  assert.equal(
    (await change({ action: "update", name: "QA Grandchild", parentName: "" }))
      .status,
    200,
  );
  const restore = await request(
    "/restore",
    { data: backup.json.data, generation: (await state()).generation },
    admin,
  );
  assert.equal(restore.status, 200);
  assert.equal(
    (await state()).data.leaderParents["QA Grandchild"],
    "__proto__",
  );
  const dbParents = JSON.parse(
    (await store.db.query("SELECT leader_parents FROM kp_settings WHERE id=1"))
      .rows[0].leader_parents,
  );
  assert.equal(dbParents["__proto__"], "QA Renamed");
});

test("activity API shares only current team's aggregate cells, manager descendants, and preserves private write scopes", async (t) => {
  const { request, admin, user, state, write } = await setup(t);
  const d = (await state()).data;
  const teamA = d.teams.find((team) => team.lead),
    teamB = d.teams.find((team) => team.lead && team.lead !== teamA.lead);
  const sibling = d.teams.find(
    (team) => team.id !== teamA.id && team.lead === teamA.lead,
  );
  const resources = [
    ["activity-own", teamA],
    ["activity-peer", teamA],
    ["activity-manager", teamA],
    ["activity-child", teamB],
    ["activity-sibling", sibling],
  ].map(([id, team]) => ({
    id,
    name: "Synthetic " + id,
    note: "PRIVATE_ACTIVITY_HR",
    versions: [
      {
        effective: "2026-01",
        start: "2026-01-01",
        end: "",
        team: team.id,
        lead: team.lead,
        status: "Aktif Çalışan",
        included: true,
        amount: 1,
      },
    ],
  }));
  assert.equal(
    (
      await write([
        {
          kind: "project",
          id: "activity-project",
          value: {
            id: "activity-project",
            name: "Synthetic",
            start: "2026-01",
            end: "2026-12",
            phases: {},
          },
        },
        ...resources.map((value) => ({
          kind: "resource",
          id: value.id,
          value,
        })),
        {
          kind: "actual",
          id: "activity-peer|activity-project|2026-01",
          value: 0.5,
        },
        {
          kind: "personDay",
          id: "activity-peer|2026-01-05|leave",
          value: { type: "leave", hours: 9, label: "PRIVATE_ACTIVITY_LEAVE" },
        },
      ])
    ).status,
    200,
  );
  const own = await user("activity-normal", "normal", "activity-own", [
    teamB.lead,
  ]);
  const manager = await user("activity-leader", "manager", "activity-manager", [
    teamB.lead,
  ]);
  const unmapped = await user("activity-unmapped", "manager", "", [teamA.lead]);
  const url = "/activity-report?start=2026-01&count=12&projects=[]";
  assert.equal((await request(url)).status, 401);
  const report = await request(url, undefined, own);
  assert.equal(report.status, 200);
  assert.deepEqual(
    new Set(report.json.rows.map((row) => row.resourceId)),
    new Set(["activity-own", "activity-peer", "activity-manager"]),
  );
  assert(!JSON.stringify(report.json).includes("PRIVATE_ACTIVITY"));
  assert.equal(
    report.json.rows.find((row) => row.resourceId === "activity-peer").cells[0]
      .projectFte,
    0.5,
  );
  const privateView = await request("/data", undefined, own);
  assert(
    !Object.keys(privateView.json.data.actualAllocations).some((key) =>
      key.startsWith("activity-peer|"),
    ),
  );
  assert.equal(
    (
      await write(
        [
          {
            kind: "actual",
            id: "activity-peer|activity-project|2026-01",
            value: 1,
          },
        ],
        own,
      )
    ).status,
    403,
  );
  assert.deepEqual((await request(url, undefined, unmapped)).json.rows, []);
  const beforeHierarchy = await request(url, undefined, manager);
  assert(
    beforeHierarchy.json.rows.some(
      (row) => row.resourceId === "activity-sibling",
    ),
  );
  assert(
    !beforeHierarchy.json.rows.some(
      (row) => row.resourceId === "activity-child",
    ),
  );
  const current = await state();
  assert.equal(
    (
      await request(
        "/leaders/change",
        {
          action: "update",
          name: teamB.lead,
          parentName: teamA.lead,
          catalogRevision: directoryRevision(current.data),
        },
        admin,
      )
    ).status,
    200,
  );
  const afterHierarchy = await request(url, undefined, manager);
  assert(
    afterHierarchy.json.rows.some((row) => row.resourceId === "activity-child"),
  );
  const adminReport = await request(url, undefined, admin);
  assert(adminReport.json.rows.length >= afterHierarchy.json.rows.length);
  for (const suffix of [
    "?start=bad&count=12",
    "?start=2026-01&count=100000",
    "?start=2026-01&count=12&projects=bad",
    "?start=2026-01&count=12&leaders=all",
  ])
    assert.equal(
      (await request("/activity-report" + suffix, undefined, own)).status,
      400,
    );
});

test("direct leadership resource planning is independent from team capacity and keeps FK, permission and revision guards", async (t) => {
  const { request, admin, user, state, write, store } = await setup(t);
  const { buildCapacityIndex, sumCapacityMetrics } =
    await import("../shared/metrics.ts");
  const d = (await state()).data,
    team = d.teams.find((team) => team.lead && team.kind !== "leadership");
  const unit = d.leadershipUnits[team.lead];
  assert(unit);
  assert.equal(d.teams.find((team) => team.id === unit).kind, "leadership");
  const resource = (id, owner) => ({
    id,
    name: "Synthetic " + id,
    note: "",
    versions: [
      {
        effective: "2026-01",
        start: "2026-01-01",
        end: "",
        team: owner,
        lead: team.lead,
        status: "Aktif Çalışan",
        included: true,
        amount: 1,
      },
    ],
  });
  assert.equal(
    (
      await write([
        {
          kind: "project",
          id: "direct-project",
          value: {
            id: "direct-project",
            name: "Synthetic direct project",
            start: "2026-01",
            end: "2026-12",
            phases: {},
          },
        },
        {
          kind: "resource",
          id: "direct-leader",
          value: resource("direct-leader", unit),
        },
        {
          kind: "resource",
          id: "direct-member",
          value: resource("direct-member", team.id),
        },
        {
          kind: "allocation",
          id: unit + "|direct-project|2026-01",
          value: 0.4,
        },
        {
          kind: "allocation",
          id: team.id + "|direct-project|2026-01",
          value: 0.6,
        },
      ])
    ).status,
    200,
  );
  const current = (await state()).data;
  const cache = buildCapacityIndex(current, ["2026-01"]);
  assert.deepEqual(cache[unit + "|2026-01"], { current: 1, total: 0.4 });
  assert.deepEqual(cache[team.id + "|2026-01"], { current: 1, total: 0.6 });
  assert.deepEqual(sumCapacityMetrics(cache, [unit, team.id], "2026-01"), {
    current: 2,
    total: 1,
  });
  const normal = await user("direct-normal", "normal", "direct-member", [
    team.lead,
  ]);
  const manager = await user("direct-manager", "manager", "direct-leader", [
    team.lead,
  ]);
  assert.equal(
    (
      await write(
        [
          {
            kind: "allocation",
            id: unit + "|direct-project|2026-01",
            value: 0.5,
          },
        ],
        normal,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await write(
        [
          {
            kind: "allocation",
            id: unit + "|direct-project|2026-01",
            value: 0.5,
          },
        ],
        manager,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await write([
        { kind: "team", id: unit, operation: "delete", value: null },
      ])
    ).status,
    403,
  );
  const catalog = await state();
  assert.equal(
    (
      await request(
        "/leaders/change",
        {
          action: "update",
          name: team.lead,
          newName: "QA Renamed Direct Leader",
          catalogRevision: directoryRevision(catalog.data),
        },
        admin,
      )
    ).status,
    200,
  );
  const renamed = (await state()).data;
  assert.equal(renamed.leadershipUnits["QA Renamed Direct Leader"], unit);
  assert.equal(
    renamed.teams.find((team) => team.id === unit).name,
    "QA Renamed Direct Leader",
  );
  assert.equal(renamed.allocations[unit + "|direct-project|2026-01"], 0.5);
  const version = (await store.findUser({ id: "direct-manager" })).version;
  assert(version >= 1);
});

test("Product Owner roles persist; concurrent claims commit one owner and expose a safe named conflict without extra audit writes", async (t) => {
  const f = await setup(t),
    data = (await f.state()).data,
    team = data.teams.find((t) => t.lead && t.kind !== "leadership");
  const value = (id) => ({
    id,
    name: "Synthetic PO " + id,
    note: "",
    versions: [
      {
        effective: "2026-01",
        start: "2026-01-01",
        end: "",
        team: team.id,
        lead: team.lead,
        status: "Aktif Çalışan",
        included: false,
        amount: 1,
        assignmentRole: "productOwner",
      },
    ],
  });
  const prior = await f.store.auditLog(await f.store.findUser({ id: "admin" }));
  const claims = await Promise.all(
    ["first", "second"].map((id) =>
      f.request(
        "/changes",
        { changes: [{ kind: "resource", id, value: value(id), revision: 0 }] },
        f.admin,
      ),
    ),
  );
  assert.deepEqual(claims.map((r) => r.status).sort(), [200, 400]);
  const winner = claims
    .find((r) => r.status === 200)
    .json.data.resources.find((r) =>
      r.versions.some((v) => v.assignmentRole === "productOwner"),
    );
  const denied = claims.find((r) => r.status === 400);
  assert.equal(denied.json.code, "PRODUCT_OWNER_CONFLICT");
  assert.equal(
    denied.json.error,
    `Bu birimde ${winner.name} kişisi Product Owner olarak atanmış durumdadır. Bu kişi Product Owner olarak atanamaz.`,
  );
  const saved = (await f.state()).data;
  assert.equal(saved.resources.length, 1);
  assert.equal(saved.resources[0].versions[0].assignmentRole, "productOwner");
  const audit = await f.store.auditLog(await f.store.findUser({ id: "admin" }));
  assert.equal(audit.total, prior.total + 1);
  const normal = await f.user("normal", "normal");
  assert.equal(
    (
      await f.write(
        [
          {
            kind: "resource",
            id: "unauthorized",
            value: value("unauthorized"),
          },
        ],
        normal,
      )
    ).status,
    403,
  );
  await f.store.close();
  await f.store.connect();
  assert.deepEqual((await f.state()).data.resources, saved.resources);
  const malformed = await f.write([
    {
      kind: "resource",
      id: "bad",
      value: {
        ...value("bad"),
        versions: [
          {
            ...value("bad").versions[0],
            team: data.leadershipUnits[team.lead],
          },
        ],
      },
    },
  ]);
  assert.equal(malformed.status, 400);
  assert.deepEqual((await f.state()).data.resources, saved.resources);
});

test("employee/account atomic save: authorization, rollback, linkage, revisions and sessions", async (t) => {
  const directory = syntheticDirectory("Synthetic-AD-test-only-735!");
  const person = {
    id: "e".repeat(32),
    username: "atomic.employee",
    name: "Synthetic AD Employee",
    email: "atomic@example.invalid",
  };
  directory.add(person);
  const f = await setup(t, { directory }),
    { store, admin, request, state, user } = f;
  const team = (await state()).data.teams.find(
    (t) => t.lead && t.kind !== "leadership",
  );
  const resource = (id, name = "Synthetic Employee") => ({
    id,
    name,
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
        assignmentRole: "member",
      },
    ],
  });
  const create = (id, patch = {}) => ({
    changes: [{ kind: "resource", id, value: resource(id), revision: 0 }],
    permission: {
      action: "create",
      directoryId: person.id,
      role: "normal",
      leaders: [team.lead],
      resourceId: id,
      ...patch,
    },
  });
  const send = (body, auth = admin) => request("/employees/save", body, auth);
  const before = await state();
  await t.test(
    "only admin and valid CSRF can save; malformed or mismatched records leave no data",
    async () => {
      assert.equal((await send(create("atomic-a"), {})).status, 401);
      for (const role of ["normal", "manager"])
        assert.equal(
          (await send(create("atomic-a"), await user("atomic-" + role, role)))
            .status,
          403,
        );
      assert.equal(
        (await send(create("atomic-a"), { ...admin, csrf: "invalid" })).status,
        403,
      );
      assert.equal(
        (await send(create("atomic-a", { resourceId: "different" }))).status,
        400,
      );
      const bad = create("atomic-a");
      bad.changes.push({ kind: "project", id: "p", value: {}, revision: 0 });
      assert.equal((await send(bad)).status, 400);
      const invalidRole = create("atomic-a", { role: "invalid" });
      assert.equal((await send(invalidRole)).status, 400);
      assert.equal((await state()).generation, before.generation);
    },
  );
  let account;
  await t.test(
    "new employee FK and authoritative AD account commit together and appear in response",
    async () => {
      const saved = await send(create("atomic-a"));
      assert.equal(saved.status, 200, JSON.stringify(saved.json));
      account = saved.json.data.users.find((u) => u.directoryId === person.id);
      assert.equal(account.resourceId, "atomic-a");
      assert.equal(account.name, person.name);
      assert.equal(
        saved.json.data.resources.find((r) => r.id === "atomic-a").name,
        person.name,
        "Authoritative AD display name replaces the client employee name",
      );
      const stored = await store.findUser({ id: account.id });
      assert.equal(stored.authSource, "ldap");
      const audit = await store.auditLog(
        await store.findUser({ id: "admin" }),
        { offset: 0, limit: 10 },
      );
      assert(audit.entries.some((e) => JSON.stringify(e).includes("atomic-a")));
    },
  );
  await t.test(
    "directory duplicate/failure and stale resource revisions roll back employee changes",
    async () => {
      const snapshot = await state();
      assert.equal((await send(create("atomic-duplicate"))).status, 409);
      directory.setUnavailable(true);
      assert.equal((await send(create("atomic-unavailable"))).status, 503);
      directory.setUnavailable(false);
      const stale = {
        changes: [
          {
            kind: "resource",
            id: "atomic-a",
            value: resource("atomic-a", "Uncommitted"),
            revision: 0,
          },
        ],
        permission: {
          action: "update",
          id: account.id,
          role: "manager",
          resourceId: "atomic-a",
          leaders: [team.lead],
          revision: snapshot.data.revisions["user:" + account.id],
        },
      };
      assert.equal((await send(stale)).status, 409);
      assert.equal((await state()).generation, snapshot.generation);
      assert.equal((await store.findUser({ id: account.id })).role, "normal");
    },
  );
  await t.test(
    "stale account revision after resource persistence rolls back the entire SQL transaction",
    async () => {
      const snapshot = await state();
      const edit = {
        changes: [
          {
            kind: "resource",
            id: "atomic-a",
            value: resource("atomic-a", "Must Roll Back"),
            revision: snapshot.data.revisions["resource:atomic-a"],
          },
        ],
        permission: {
          action: "update",
          id: account.id,
          role: "manager",
          resourceId: "atomic-a",
          leaders: [team.lead],
          revision: 0,
        },
      };
      assert.equal((await send(edit)).status, 409);
      const after = await state();
      assert.equal(after.generation, snapshot.generation);
      assert.equal(
        after.data.resources.find((r) => r.id === "atomic-a").name,
        person.name,
      );
    },
  );
  await t.test(
    "failure during session revocation rolls back saved identity, employee and generation",
    async () => {
      const snapshot = await state(),
        old = await store.findUser({ id: account.id });
      const original = store.revokeUser;
      store.revokeUser = async () => {
        throw Error("Synthetic combined session revoke failure");
      };
      try {
        const saved = await send({
          changes: [
            {
              kind: "resource",
              id: "atomic-a",
              value: resource("atomic-a", "Rollback After Account"),
              revision: snapshot.data.revisions["resource:atomic-a"],
            },
          ],
          permission: {
            action: "update",
            id: account.id,
            role: "manager",
            leaders: [team.lead],
            resourceId: "atomic-a",
            revision: snapshot.data.revisions["user:" + account.id],
          },
        });
        assert.equal(saved.status, 500);
      } finally {
        store.revokeUser = original;
      }
      assert.deepEqual(await state(), snapshot);
      assert.deepEqual(await store.findUser({ id: account.id }), old);
    },
  );
  await t.test(
    "successful account change revokes prior sessions; revoke and regrant preserve employee",
    async () => {
      const login = await request("/auth/login", {
        username: person.username,
        password: "Synthetic-AD-test-only-735!",
      });
      assert.equal(login.status, 200);
      const auth = {
        cookie: login.response.headers.get("set-cookie").split(";")[0],
        csrf: login.json.csrf,
      };
      async function update(permission, name = "Updated Employee") {
        const snap = await state();
        return send({
          changes: [
            {
              kind: "resource",
              id: "atomic-a",
              value: resource("atomic-a", name),
              revision: snap.data.revisions["resource:atomic-a"],
            },
          ],
          permission: {
            id: account.id,
            revision: snap.data.revisions["user:" + account.id],
            ...permission,
          },
        });
      }
      assert.equal(
        (
          await update({
            action: "update",
            role: "manager",
            resourceId: "atomic-a",
            leaders: [team.lead],
          })
        ).status,
        200,
      );
      assert.equal((await request("/data", undefined, auth)).status, 401);
      assert.equal((await update({ action: "revoke" })).status, 200);
      assert.equal((await store.findUser({ id: account.id })).active, false);
      assert((await state()).data.resources.some((r) => r.id === "atomic-a"));
      assert.equal(
        (
          await update({
            action: "update",
            role: "normal",
            resourceId: "atomic-a",
            leaders: [team.lead],
            reactivate: true,
          })
        ).status,
        200,
      );
    },
  );
  await t.test(
    "existing accounts cannot be stolen, local admin accounts remain protected here and concurrent linking has one winner",
    async () => {
      const snap = await state();
      const steal = create("atomic-steal");
      steal.permission = {
        action: "update",
        id: account.id,
        revision: snap.data.revisions["user:" + account.id],
        role: "normal",
        leaders: [],
        resourceId: "atomic-steal",
      };
      assert.equal((await send(steal)).status, 403);
      steal.permission.id = "admin";
      steal.permission.revision = 1;
      assert.equal((await send(steal)).status, 403);
      await user("atomic-unlinked", "normal");
      const link = (id) => ({
        changes: [{ kind: "resource", id, value: resource(id), revision: 0 }],
        permission: {
          action: "update",
          id: "atomic-unlinked",
          revision: 1,
          role: "normal",
          resourceId: id,
          leaders: [team.lead],
        },
      });
      const results = await Promise.all([
        send(link("atomic-race-a")),
        send(link("atomic-race-b")),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 403]);
      const final = (await state()).data;
      assert.equal(
        final.resources.filter((r) => r.id.startsWith("atomic-race-")).length,
        1,
      );
    },
  );
});

test("Leader roles persist; concurrent claims commit one owner and expose a safe named conflict without extra audit writes", async (t) => {
  const f = await setup(t),
    data = (await f.state()).data,
    team = data.teams.find((t) => t.lead && t.kind !== "leadership");
  const value = (id) => ({
    id,
    name: "Synthetic Leader " + id,
    note: "",
    versions: [
      {
        effective: "2026-01",
        start: "2026-01-01",
        end: "",
        team: data.leadershipUnits[team.lead],
        lead: team.lead,
        status: "Aktif Çalışan",
        included: false,
        amount: 1,
        assignmentRole: "leader",
      },
    ],
  });
  const prior = await f.store.auditLog(await f.store.findUser({ id: "admin" }));
  const claims = await Promise.all(
    ["first", "second"].map((id) =>
      f.request(
        "/changes",
        { changes: [{ kind: "resource", id, value: value(id), revision: 0 }] },
        f.admin,
      ),
    ),
  );
  assert.deepEqual(claims.map((r) => r.status).sort(), [200, 400]);
  const winner = claims
    .find((r) => r.status === 200)
    .json.data.resources.find((r) =>
      r.versions.some((v) => v.assignmentRole === "leader"),
    );
  const denied = claims.find((r) => r.status === 400);
  assert.equal(denied.json.code, "LEADER_CONFLICT");
  assert.equal(
    denied.json.error,
    `Bu liderlikte ${winner.name} kişisi Lider olarak atanmış durumdadır. Bu kişi Lider olarak atanamaz.`,
  );
  const saved = (await f.state()).data;
  assert.equal(saved.resources.length, 1);
  assert.equal(saved.resources[0].versions[0].assignmentRole, "leader");
  const audit = await f.store.auditLog(await f.store.findUser({ id: "admin" }));
  assert.equal(audit.total, prior.total + 1);
  const normal = await f.user("normal", "normal");
  assert.equal(
    (
      await f.write(
        [
          {
            kind: "resource",
            id: "unauthorized",
            value: value("unauthorized"),
          },
        ],
        normal,
      )
    ).status,
    403,
  );
  await f.store.close();
  await f.store.connect();
  assert.deepEqual((await f.state()).data.resources, saved.resources);
  const malformed = await f.write([
    {
      kind: "resource",
      id: "bad",
      value: {
        ...value("bad"),
        versions: [
          {
            ...value("bad").versions[0],
            team: team.id,
          },
        ],
      },
    },
  ]);
  assert.equal(malformed.status, 400);
  assert.deepEqual((await f.state()).data.resources, saved.resources);
});

test("leader conflict rolls back the combined AD employee/account save without creating an account", async (t) => {
  const directory = syntheticDirectory("Leader-atomic-synthetic-only-492!");
  const directoryId = "a".repeat(32);
  directory.add({
    id: directoryId,
    username: "synthetic.leader",
    name: "Synthetic New Leader",
    email: "leader@example.invalid",
  });
  const f = await setup(t, { directory });
  const data = (await f.state()).data,
    team = data.teams.find((t) => t.lead && t.kind !== "leadership");
  const value = (id) => ({
    id,
    name: "Synthetic " + id,
    note: "",
    versions: [
      {
        effective: "2026-01",
        team: data.leadershipUnits[team.lead],
        lead: team.lead,
        assignmentRole: "leader",
        status: "Aktif Çalışan",
        included: false,
        start: "2026-01-01",
        end: "",
        amount: 1,
      },
    ],
  });
  assert.equal(
    (
      await f.write([
        { kind: "resource", id: "existing", value: value("existing") },
      ])
    ).status,
    200,
  );
  const before = await f.state(),
    audit = await f.store.auditLog(await f.store.findUser({ id: "admin" }));
  const denied = await f.request(
    "/employees/save",
    {
      changes: [
        {
          kind: "resource",
          id: "candidate",
          revision: 0,
          value: value("candidate"),
        },
      ],
      permission: {
        action: "create",
        directoryId,
        role: "manager",
        resourceId: "candidate",
        leaders: [team.lead],
      },
    },
    f.admin,
  );
  assert.equal(denied.status, 400);
  assert.equal(denied.json.code, "LEADER_CONFLICT");
  assert.match(denied.json.error, /Synthetic existing/);
  assert.deepEqual(await f.state(), before);
  assert.equal(await f.store.findUser({ directoryId }), null);
  assert.equal(
    (await f.store.auditLog(await f.store.findUser({ id: "admin" }))).total,
    audit.total,
  );
});

test("actual peer read endpoint is authenticated, sanitized and never widens write authorization", async (t) => {
  const { request, user, state, write } = await setup(t);
  const d = (await state()).data;
  const team = d.teams.find((t) => t.lead);
  const other = d.teams.find((t) => t.lead && t.lead !== team.lead);
  const resources = [
    ["actual-own", team],
    ["actual-peer", team],
    ["actual-other", other],
  ].map(([id, team]) => ({
    id,
    name: id,
    note: "PRIVATE_HR",
    code: "PRIVATE_CODE",
    versions: [
      {
        effective: "2026-01",
        start: "2026-01-01",
        end: "",
        team: team.id,
        lead: team.lead,
        status: "Aktif Çalışan",
        included: true,
        amount: 1,
        assignmentRole: id === "actual-peer" ? "productOwner" : "member",
      },
    ],
  }));
  assert.equal(
    (
      await write([
        {
          kind: "project",
          id: "actual-p",
          value: {
            id: "actual-p",
            name: "Synthetic",
            start: "2026-01",
            end: "2026-12",
            phases: {},
          },
        },
        ...resources.map((value) => ({
          kind: "resource",
          id: value.id,
          value,
        })),
        { kind: "actual", id: "actual-peer|actual-p|2026-09", value: 0.25 },
        {
          kind: "personDay",
          id: "actual-peer|2026-09-01|training",
          value: { type: "training", hours: 9, label: "PRIVATE_TRAINING" },
        },
      ])
    ).status,
    200,
  );
  const auth = await user("actual-member", "normal", "actual-own", [
    other.lead,
  ]);
  const url = "/actual-view?start=2026-09&count=3";
  assert.equal((await request(url)).status, 401);
  for (const suffix of [
    "?start=bad&count=3",
    "?start=2026-01&count=61",
    "?start=2026-09&count=3&leaders=all",
  ])
    assert.equal(
      (await request("/actual-view" + suffix, undefined, auth)).status,
      400,
    );
  const result = await request(url, undefined, auth);
  assert.equal(result.status, 200);
  assert.match(result.response.headers.get("cache-control"), /no-store/);
  assert(result.json.data.resources.some((r) => r.id === "actual-peer"));
  assert(!result.json.data.resources.some((r) => r.id === "actual-other"));
  assert.equal(
    result.json.data.actualAllocations["actual-peer|actual-p|2026-09"],
    0.25,
  );
  assert.equal(
    result.json.monthSummaries["actual-peer|2026-09"].trainingHours,
    9,
  );
  assert(!JSON.stringify(result.json).includes("PRIVATE_"));
  assert.equal(
    (await request("/data", undefined, auth)).json.data.actualAllocations[
      "actual-peer|actual-p|2026-09"
    ],
    undefined,
  );
  assert.equal(
    (
      await write(
        [{ kind: "actual", id: "actual-peer|actual-p|2026-09", value: 0.3 }],
        auth,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await write(
        [{ kind: "workedHours", id: "actual-peer|2026-09", value: 100 }],
        auth,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await write(
        [{ kind: "actual", id: "actual-own|actual-p|2026-09", value: 0.1 }],
        auth,
      )
    ).status,
    200,
  );
});

test("manager planning visibility is global, inherited write grants stay narrow and atomic", async (t) => {
  const { store, state, user, request, write } = await setup(t);
  const admin = await store.findUser({ id: "admin" });
  const initial = (await state()).data;
  const root = initial.teams.find((t) => t.lead).lead;
  const outsider = initial.teams.find((t) => t.lead && t.lead !== root);
  for (const [name, parentName] of [
    ["Planning Child", root],
    ["Planning Grandchild", "Planning Child"],
  ]) {
    await store.mutate(admin, (d, u, c, g) =>
      applyLeaderChange(
        d,
        u,
        {
          action: "create",
          name,
          parentName,
          catalogRevision: directoryRevision(d),
        },
        c,
        g,
      ),
    );
  }
  const team = {
    id: "planning-child-team",
    name: "Synthetic Child Team",
    lead: "Planning Grandchild",
    excelCapacity: 0,
  };
  await store.mutate(admin, (d) => {
    d.teams.push(team);
    return d;
  });
  const manager = await user("planning-manager", "manager", "", [root]);
  const unassigned = await user("planning-no-grant", "manager");
  const normal = await user("planning-normal", "normal", "", [root]);
  assert.equal(
    (
      await write([
        {
          kind: "project",
          id: "planning-p",
          value: {
            id: "planning-p",
            name: "Synthetic Plan",
            start: "2026-01",
            end: "2026-12",
            phases: {},
            milestones: [],
          },
        },
      ])
    ).status,
    200,
  );
  const full = (await state()).data;
  const owners = [
    full.leadershipUnits[root],
    full.leadershipUnits["Planning Child"],
    full.leadershipUnits["Planning Grandchild"],
    team.id,
  ];
  const key = (id) => id + "|planning-p|2026-01";
  assert.equal(
    (await write([{ kind: "allocation", id: key(outsider.id), value: 0.75 }]))
      .status,
    200,
  );
  for (const auth of [manager, unassigned]) {
    const view = (await request("/data", undefined, auth)).json.data;
    assert.deepEqual(
      view.teams.map((t) => t.id).sort(),
      (await state()).data.teams.map((t) => t.id).sort(),
    );
    assert.equal(view.allocations[key(outsider.id)], 0.75);
    assert.equal(view.revisions["allocation:" + key(outsider.id)], 1);
  }
  // Every one-cell call runs narrow SQL preflight followed by full validation.
  for (const owner of owners) {
    const saved = await write(
      [{ kind: "allocation", id: key(owner), value: 0.5 }],
      manager,
    );
    assert.equal(saved.status, 200, owner);
    assert.equal(saved.json.data.allocations[key(owner)], 0.5);
  }
  const before = await state();
  for (const [auth, owner] of [
    [manager, outsider.id],
    [unassigned, team.id],
    [normal, team.id],
  ])
    assert.equal(
      (await write([{ kind: "allocation", id: key(owner), value: 1 }], auth))
        .status,
      403,
    );
  assert.equal(
    (
      await write(
        [
          { kind: "allocation", id: key(team.id), value: 1 },
          { kind: "allocation", id: key(outsider.id), value: 1 },
        ],
        manager,
      )
    ).status,
    403,
  );
  assert.deepEqual(await state(), before);
  const changes = owners.map((id) => ({
    kind: "allocation",
    id: key(id),
    value: 0.6,
    revision: 1,
  }));
  const saved = await request(
    "/changes",
    {
      changes,
      responseMode: "planning-delta-v1",
      baseGeneration: before.generation,
    },
    manager,
  );
  assert.equal(saved.status, 200);
  assert.equal(saved.json.responseMode, "planning-delta-v1");
  assert.equal(saved.json.allocations.length, owners.length);
  assert(
    saved.json.allocations.every((a) => a.value === 0.6 && a.revision === 2),
  );
  assert.equal(
    (await request("/changes", { changes: [changes[0]] }, manager)).status,
    409,
  );
  const deleted = await write(
    [{ kind: "allocation", id: key(team.id), operation: "delete" }],
    manager,
  );
  assert.equal(deleted.status, 200);
  assert.equal(deleted.json.data.allocations[key(team.id)], undefined);
  assert.equal(deleted.json.data.revisions["allocation:" + key(team.id)], 3);
});

test("AD administrators: provisioning, linked role lifecycle, protected root and self-change response", async (t) => {
  const password = "Synthetic-AD-admin-only-735!";
  const directory = syntheticDirectory(password);
  const person = {
    id: "a".repeat(32),
    username: "qa.ad-admin",
    name: "Synthetic AD Admin",
    email: "ad-admin@example.test",
  };
  directory.add(person);
  const f = await setup(t, { directory });
  const { request, state, store, admin, user } = f;
  const team = (await state()).data.teams.find(
    (t) => t.lead && t.kind !== "leadership",
  );
  const resource = {
    id: "ad-admin-employee",
    name: "Synthetic AD Employee",
    note: "",
    versions: [
      {
        effective: "2026-01",
        start: "2026-01-01",
        end: "",
        team: team.id,
        lead: team.lead,
        status: "Aktif Çalışan",
        included: true,
        amount: 1,
        assignmentRole: "member",
      },
    ],
  };
  assert.equal(
    (await f.write([{ kind: "resource", id: resource.id, value: resource }]))
      .status,
    200,
  );
  const create = {
    directoryId: person.id,
    role: "admin",
    leaders: [team.lead],
    resourceId: resource.id,
  };
  for (const role of ["normal", "manager"])
    assert.equal(
      (
        await request(
          "/users/create",
          create,
          await user("deny-ad-admin-" + role, role),
        )
      ).status,
      403,
    );
  assert.equal(
    (await request("/users/create", create, { ...admin, csrf: "bad" })).status,
    403,
  );
  const saved = await request("/users/create", create, admin);
  assert.equal(saved.status, 200);
  let account = await store.findUser({ directoryId: person.id });
  assert.equal(account.role, "admin");
  assert.equal(account.resourceId, resource.id);
  assert.deepEqual(account.leaders, []);
  assert.equal(account.authSource, "ldap");
  async function login() {
    const r = await request("/auth/login", {
      username: person.username,
      password,
    });
    assert.equal(r.status, 200);
    return {
      cookie: r.response.headers.get("set-cookie").split(";")[0],
      csrf: r.json.csrf,
    };
  }
  const firstSession = await login();
  assert.equal(
    (await request("/directory/users", undefined, firstSession)).status,
    200,
  );
  const edit = async (role, auth = admin, patch = {}) => {
    const snap = await state();
    return request(
      "/employees/save",
      {
        changes: [
          {
            kind: "resource",
            id: resource.id,
            value: resource,
            revision: snap.data.revisions["resource:" + resource.id],
          },
        ],
        permission: {
          action: "update",
          id: account._id,
          role,
          resourceId: resource.id,
          leaders: [team.lead],
          revision: snap.data.revisions["user:" + account._id],
          ...patch,
        },
      },
      auth,
    );
  };
  const before = await state();
  assert.equal((await edit("manager", admin, { revision: 0 })).status, 409);
  assert.deepEqual(await state(), before);
  assert.equal((await edit("manager")).status, 200);
  assert.equal(
    (await request("/auth/me", undefined, firstSession)).status,
    401,
  );
  account = await store.findUser({ directoryId: person.id });
  assert.equal(account.role, "manager");
  assert.equal(account.resourceId, resource.id);
  const managerSession = await login();
  assert.equal((await edit("admin", managerSession)).status, 403);
  assert.equal((await edit("admin")).status, 200);
  assert.equal(
    (await request("/auth/me", undefined, managerSession)).status,
    401,
  );
  account = await store.findUser({ directoryId: person.id });
  assert.deepEqual(account.leaders, []);
  assert.equal(account.resourceId, resource.id);
  // Self-demotion commits, revokes the old admin session and returns no privileged snapshot.
  const adminSession = await login();
  const selfChange = await edit("normal", adminSession);
  assert.equal(selfChange.status, 401);
  assert.equal(selfChange.json.data, undefined);
  assert.equal(
    (await request("/auth/me", undefined, adminSession)).status,
    401,
  );
  account = await store.findUser({ directoryId: person.id });
  assert.equal(account.role, "normal");
  assert.equal(account.resourceId, resource.id);
  assert.equal((await edit("admin")).status, 200);
  account = await store.findUser({ directoryId: person.id });
  assert.equal(account.role, "admin");
  // Neither the employee form nor generic role API may change the protected root.
  await user("root-admin");
  const snap = await state();
  for (const action of ["update", "revoke"]) {
    const permission =
      action === "update"
        ? {
            action,
            id: "root-admin",
            role: "normal",
            resourceId: resource.id,
            leaders: [],
            revision: 1,
          }
        : { action, id: "root-admin", revision: 1 };
    assert.equal(
      (
        await request(
          "/employees/save",
          {
            changes: [
              {
                kind: "resource",
                id: resource.id,
                value: resource,
                revision: snap.data.revisions["resource:" + resource.id],
              },
            ],
            permission,
          },
          admin,
        )
      ).status,
      403,
    );
  }
  assert.equal((await store.findUser({ id: "root-admin" })).role, "admin");
  const otherEmployee = { ...resource, id: "different-employee" };
  const steal = await request(
    "/employees/save",
    {
      changes: [
        {
          kind: "resource",
          id: otherEmployee.id,
          value: otherEmployee,
          revision: 0,
        },
      ],
      permission: {
        action: "update",
        id: account._id,
        role: "admin",
        resourceId: otherEmployee.id,
        leaders: [],
        revision: account.revision,
      },
    },
    admin,
  );
  assert.equal(steal.status, 403);
  assert(
    !(await state()).data.resources.some((r) => r.id === otherEmployee.id),
  );
  const revoked = await request(
    "/employees/save",
    {
      changes: [
        {
          kind: "resource",
          id: resource.id,
          value: resource,
          revision: (await state()).data.revisions["resource:" + resource.id],
        },
      ],
      permission: {
        action: "revoke",
        id: account._id,
        revision: account.revision,
      },
    },
    admin,
  );
  assert.equal(revoked.status, 200);
  account = await store.findUser({ directoryId: person.id });
  assert.equal(account.active, false);
  assert((await state()).data.resources.some((r) => r.id === resource.id));
});

test("private calendars remain own/admin-only across reads and mutation snapshots without losing monthly summaries", async (t) => {
  const { admin, request, user, state, write } = await setup(t);
  const initial = (await state()).data;
  const team = initial.teams.find((item) => item.lead);
  const other = initial.teams.find(
    (item) => item.lead && item.lead !== team.lead,
  );
  const people = [
    ["privacy-own", other],
    ["privacy-normal-own", other],
    ["privacy-peer", team],
    ["privacy-outsider", other],
  ].map(([id, unit]) => ({
    id,
    name: id,
    note: "",
    versions: [
      {
        effective: "2026-01",
        start: "2026-01-01",
        end: "",
        team: unit.id,
        lead: unit.lead,
        status: "Aktif Çalışan",
        included: true,
        amount: 1,
      },
    ],
  }));
  const calendar = [
    ["privacy-own|2026-09-01|leave", "leave", 4.5, "OWN_CALENDAR_DESCRIPTION"],
    [
      "privacy-normal-own|2026-09-01|leave",
      "leave",
      4.5,
      "OWN_NORMAL_CALENDAR",
    ],
    ["privacy-peer|2026-09-01|leave", "leave", 9, "PRIVATE_PEER_LEAVE"],
    [
      "privacy-peer|2026-09-02|training",
      "training",
      4.5,
      "PRIVATE_PEER_TRAINING",
    ],
    ["privacy-outsider|2026-09-01|leave", "leave", 9, "PRIVATE_OUTSIDE_LEAVE"],
  ].map(([id, type, hours, label]) => ({
    kind: "personDay",
    id,
    value: {
      type,
      hours,
      label,
      range: {
        from: id.split("|")[1],
        to: id.includes("09-02") ? "2026-09-03" : "2026-09-02",
        hours,
      },
    },
  }));
  assert.equal(
    (
      await write([
        {
          kind: "project",
          id: "privacy-p",
          value: {
            id: "privacy-p",
            name: "Synthetic Privacy Project",
            start: "2026-01",
            end: "2026-12",
            phases: {},
          },
        },
        ...people.map((value) => ({ kind: "resource", id: value.id, value })),
        ...calendar,
        {
          kind: "actual",
          id: "privacy-peer|privacy-p|2026-09",
          value: { unit: "hours", value: 18 },
        },
      ])
    ).status,
    200,
  );
  const before = (await state()).data;
  const accounts = [
    [
      "manager",
      await user("privacy-manager", "manager", "privacy-own", [team.lead]),
      "privacy-own",
    ],
    [
      "unlinked-manager",
      await user("privacy-unlinked-manager", "manager", "", [
        team.lead,
        other.lead,
      ]),
      "",
    ],
    [
      "normal",
      await user("privacy-normal", "normal", "privacy-normal-own", [team.lead]),
      "privacy-normal-own",
    ],
    [
      "unlinked-normal",
      await user("privacy-unlinked-normal", "normal", "", [team.lead]),
      "",
    ],
    ["admin", admin, null],
  ];
  function assertCalendarScope(view, ownId) {
    const expected = Object.fromEntries(
      Object.entries(before.personCalendar).filter(
        ([key]) => ownId === null || key.startsWith(ownId + "|"),
      ),
    );
    assert.deepEqual(view.personCalendar, expected);
    for (const [key, revision] of Object.entries(before.revisions).filter(
      ([key]) => key.startsWith("personDay:"),
    )) {
      const visible =
        ownId === null || key.startsWith("personDay:" + ownId + "|");
      assert.equal(view.revisions[key], visible ? revision : undefined, key);
    }
    if (ownId !== null) assert(!JSON.stringify(view).includes("PRIVATE_"));
  }
  for (const [label, auth, ownId] of accounts) {
    await t.test(label + " reads", async () => {
      for (const url of ["/data", "/actual-view?start=2026-09&count=1"]) {
        const result = await request(url, undefined, auth);
        assert.equal(result.status, 200);
        assertCalendarScope(result.json.data, ownId);
        if (label === "manager" && url.startsWith("/actual-view")) {
          const summary = result.json.monthSummaries["privacy-peer|2026-09"];
          assert.equal(summary.leaveHours, 9);
          assert.equal(summary.trainingHours, 4.5);
          assert.equal(summary.effectiveHours, 189);
          assert.equal(summary.projectFte, 0.1);
          assert.equal(summary.totalFte, 0.125);
          assert.equal(
            result.json.data.actualAllocations[
              "privacy-peer|privacy-p|2026-09"
            ],
            0.1,
          );
        }
      }
    });
  }
  const manager = accounts[0][1];
  const saved = await write(
    [
      {
        kind: "actual",
        id: "privacy-peer|privacy-p|2026-09",
        value: { unit: "hours", value: 27 },
      },
    ],
    manager,
  );
  assert.equal(saved.status, 200);
  assertCalendarScope(saved.json.data, "privacy-own");
  assert.equal(
    saved.json.data.actualAllocations["privacy-peer|privacy-p|2026-09"],
    0.15,
  );
  const refreshed = await request(
    "/actual-view?start=2026-09&count=1",
    undefined,
    manager,
  );
  assert.equal(refreshed.status, 200);
  assertCalendarScope(refreshed.json.data, "privacy-own");
  assert.equal(
    refreshed.json.monthSummaries["privacy-peer|2026-09"].totalFte,
    0.175,
  );
  const prohibited = await write(
    [
      {
        kind: "personDay",
        id: calendar[2].id,
        value: { ...calendar[2].value, label: "ATTEMPTED_CHANGE" },
      },
    ],
    manager,
  );
  assert.equal(prohibited.status, 403);
  const after = (await state()).data;
  assert.deepEqual(after.personCalendar, before.personCalendar);
  assert.equal(
    after.revisions["personDay:" + calendar[2].id],
    before.revisions["personDay:" + calendar[2].id],
  );
});
