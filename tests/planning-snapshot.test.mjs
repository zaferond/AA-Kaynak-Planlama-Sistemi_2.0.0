import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { hashPassword } from "../backend/auth.mjs";
import {
  applyChanges,
  planningCommand,
  isPlanningCommand,
  stageChanges,
} from "../backend/operations.mjs";
import { changeAndView } from "../backend/change-service.mjs";
import { mergePlanningDelta } from "../shared/planning-response.ts";
import { createApp } from "../backend/app.mjs";
import { createServer } from "node:http";
import { once } from "node:events";

// Replacing a file with a directory fails as EPERM on Windows and
// EISDIR/ENOTDIR on POSIX. Require this fixture's exact failing rename;
// do not accept unrelated permission or application errors.
const blockedCommitRename = (error, blocker) =>
  error.syscall === "rename" &&
  error.path === blocker + ".tmp" &&
  error.dest === blocker &&
  (["EISDIR", "ENOTDIR"].includes(error.code) ||
    (process.platform === "win32" && error.code === "EPERM"));

const password = hashPassword("Snapshot-test-only-284!");
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-planning-view-"));
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "test.sqlite"),
  };
  const store = new Store({ env });
  t.after(async () => {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await store.connect();
  const teams = (await store.read()).data.teams;
  const team = teams.find((item) => item.lead);
  const other = teams.find((item) => item.lead && item.lead !== team.lead);
  const roles = [
    ["admin", "admin", []],
    ["manager", "manager", [team.lead]],
    ["unassigned", "manager", []],
    ["normal", "normal", [team.lead]],
  ];
  const users = {};
  for (const [id, role, leaders] of roles) {
    await store.bootstrapUser({
      _id: id,
      username: "snapshot." + id,
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
  const key = team.id + "|p|2026-09";
  const hiddenKey = other.id + "|p|2026-09";
  await store.mutate(users.admin, (data, active) => {
    applyChanges(data, active, [
      {
        kind: "project",
        id: "p",
        revision: 0,
        value: {
          id: "p",
          name: "Project",
          start: "2026-01",
          end: "2030-12",
          phases: { "2026-09": "Analysis" },
          milestones: [
            {
              id: "note",
              name: "Critical topic",
              start: "2026-09-01",
              end: "2026-09-30",
              barNotes: [
                { text: "Detail", includeInReport: true, completed: true },
              ],
            },
          ],
        },
      },
      ...[team, other].map((item, i) => ({
        kind: "resource",
        id: "r" + i,
        revision: 0,
        value: {
          id: "r" + i,
          name: "Private person " + i,
          note: "Private note",
          code: "Private code",
          versions: [
            {
              effective: "2026-01",
              team: item.id,
              lead: item.lead,
              status: "Aktif Çalışan",
              included: true,
              start: "2026-01-01",
              end: "",
              amount: 1,
            },
          ],
        },
      })),
      { kind: "allocation", id: hiddenKey, value: 0.75, revision: 0 },
      { kind: "actual", id: "r0|p|2026-01", value: 0.25, revision: 0 },
      { kind: "actual", id: "r1|p|2026-01", value: 0.5, revision: 0 },
      {
        kind: "personDay",
        id: "r1|2026-09-02|leave",
        value: { type: "leave", hours: 2, label: "Private leave" },
        revision: 0,
      },
    ]);
    data.legacyArchive = { teams: [], allocations: {}, resourceTeams: {} };
  });
  await store.transaction((c) =>
    store.saveUser({ ...users.normal, resourceId: "r0" }, c),
  );
  users.normal = await store.findUser({ id: "normal" });
  return { store, env, users, team, other, key, hiddenKey };
}

test("planning responses match fresh SQL views with one full read for create, zero, same value, batch and delete", async (t) => {
  const { store, users, key, team } = await setup(t);
  const original = store.read;
  let reads = 0;
  t.mock.method(store, "read", async function (...args) {
    reads++;
    return original.apply(this, args);
  });
  const second = team.id + "|p|2026-10";
  const batches = [
    [{ kind: "allocation", id: key, value: 0.5, revision: 0 }],
    [{ kind: "allocation", id: key, value: 0, revision: 1 }],
    [{ kind: "allocation", id: key, value: 0, revision: 2 }],
    [
      { kind: "allocation", id: key, value: 1, revision: 3 },
      { kind: "allocation", id: second, value: 0.25, revision: 0 },
    ],
    [{ kind: "allocation", id: key, operation: "delete", revision: 4 }],
  ];
  for (const changes of batches) {
    reads = 0;
    const result = await changeAndView(store, users.admin, changes);
    assert.equal(reads, 1);
    assert.deepEqual(result, await store.view(users.admin));
    assert.equal(JSON.stringify(result).includes('"password"'), false);
  }
  const after = await store.view(users.admin);
  assert.equal(Object.hasOwn(after.data.allocations, key), false);
  assert.equal(after.data.revisions["allocation:" + key], 5);
});

test("planning responses expose all planning allocations, protect peer identity and reject forbidden, stale and disabled writes", async (t) => {
  const { store, users, key, hiddenKey } = await setup(t);
  const result = await changeAndView(store, users.manager, [
    { kind: "allocation", id: key, value: 0.5, revision: 0 },
  ]);
  assert.deepEqual(result, await store.view(users.manager));
  assert.equal(result.data.allocations[hiddenKey], 0.75);
  assert.equal(result.data.users, undefined);
  assert.equal(result.data.legacyArchive, undefined);
  const peer = result.data.resources.find((item) => item.id === "r1");
  assert(peer, "outside capacity remains available to planning reports");
  assert.equal(peer.name, "");
  assert.equal(peer.note, "");
  assert.equal(peer.code, undefined);
  assert.equal(Object.keys(result.data.personCalendar).length, 0);
  assert.equal(result.data.actualAllocations["r0|p|2026-01"], 0.25);
  assert.equal(result.data.actualTeamTotals !== undefined, true);
  const before = await store.view(users.admin);
  const audit = (await store.auditLog(users.admin)).total;
  for (const [user, id, revision, status] of [
    [users.manager, hiddenKey, 1, 403],
    [users.unassigned, key, 1, 403],
    [users.normal, key, 1, 403],
    [users.manager, key, 0, 409],
    [{ ...users.manager, version: 0 }, key, 1, 401],
  ]) {
    await assert.rejects(
      changeAndView(store, user, [
        { kind: "allocation", id, value: 1, revision },
      ]),
      (error) => error.status === status,
    );
  }
  await store.transaction((c) =>
    store.saveUser({ ...users.manager, active: false }, c),
  );
  await assert.rejects(
    changeAndView(store, users.manager, [
      { kind: "allocation", id: key, value: 1, revision: 1 },
    ]),
    (error) => error.status === 401,
  );
  await store.transaction((c) => store.saveUser(users.manager, c));
  assert.deepEqual(await store.view(users.admin), before);
  assert.equal((await store.auditLog(users.admin)).total, audit);
});

test("mixed entity/planning changes use a fresh SQL representation and invalid batches stay atomic", async (t) => {
  const { store, users, key } = await setup(t);
  const original = store.read;
  let reads = 0;
  t.mock.method(store, "read", async function (...args) {
    reads++;
    return original.apply(this, args);
  });
  const result = await changeAndView(store, users.admin, [
    { kind: "allocation", id: key, value: 0.5, revision: 0 },
    {
      kind: "project",
      id: "new",
      revision: 0,
      value: {
        id: "new",
        name: " New project ",
        start: "2026-01",
        end: "2030-12",
        phases: {},
      },
    },
  ]);
  assert.equal(reads, 2);
  assert.deepEqual(result, await store.view(users.admin));
  assert.equal(
    result.data.projects.find((item) => item.id === "new").name,
    "New project",
  );
  assert.deepEqual(
    result.data.projects.find((item) => item.id === "new").milestones,
    [],
  );
  const before = await store.view(users.admin);
  const audit = (await store.auditLog(users.admin)).total;
  for (const changes of [
    [],
    [null],
    [
      { kind: "allocation", id: key, value: 1, revision: 1 },
      { kind: "allocation", id: key, value: 2, revision: 1 },
    ],
    [
      { kind: "allocation", id: key, value: 1, revision: 1 },
      { kind: "allocation", id: "missing|p|2026-09", value: 1, revision: 0 },
    ],
  ])
    await assert.rejects(changeAndView(store, users.admin, changes));
  assert.deepEqual(await store.view(users.admin), before);
  assert.equal((await store.auditLog(users.admin)).total, audit);
});

test("legacy metadata normalization falls back to a transaction-local SQL read", async (t) => {
  const { store, users, key, team } = await setup(t);
  await store.transaction((c) =>
    c.query("UPDATE kp_teams SET name=@p0 WHERE id=@p1", [
      " Legacy team ",
      team.id,
    ]),
  );
  const original = store.read;
  let reads = 0;
  t.mock.method(store, "read", async function (...args) {
    reads++;
    return original.apply(this, args);
  });
  const result = await changeAndView(store, users.admin, [
    { kind: "allocation", id: key, value: 0.5, revision: 0 },
  ]);
  assert.equal(reads, 2);
  assert.deepEqual(result, await store.view(users.admin));
  assert.equal(
    result.data.teams.find((item) => item.id === team.id).name,
    "Legacy team",
  );
});

test("a prepared planning response is not returned when disk commit fails and data survives restart unchanged", async (t) => {
  const { store, users, key, env } = await setup(t);
  const before = await store.view(users.admin);
  const audit = (await store.auditLog(users.admin)).total;
  const originalFile = store.db.file;
  const blocker = originalFile + "-directory";
  await fs.mkdir(blocker);
  let projected = 0;
  const original = store.projectView;
  t.mock.method(store, "projectView", async function (...args) {
    projected++;
    return original.apply(this, args);
  });
  store.db.file = blocker;
  try {
    await assert.rejects(
      changeAndView(store, users.admin, [
        { kind: "allocation", id: key, value: 0.5, revision: 0 },
      ]),
      (error) => blockedCommitRename(error, blocker),
    );
  } finally {
    store.db.file = originalFile;
  }
  assert.equal(projected, 1);
  assert.deepEqual(await store.view(users.admin), before);
  assert.equal((await store.auditLog(users.admin)).total, audit);
  await store.close();
  const reopened = new Store({ env });
  try {
    await reopened.connect();
    assert.deepEqual(await reopened.view(users.admin), before);
    assert.equal((await reopened.auditLog(users.admin)).total, audit);
  } finally {
    await reopened.close();
  }
});

test("single final validation rejects invalid staged values and references without committing the valid part of a batch", async (t) => {
  const { store, users, key, hiddenKey } = await setup(t);
  const persist = store.persist;
  let persistenceCalls = 0;
  t.mock.method(store, "persist", async function (...args) {
    persistenceCalls++;
    return persist.apply(this, args);
  });
  const before = await store.view(users.admin);
  const audit = (await store.auditLog(users.admin)).total;
  const project = before.data.projects.find((item) => item.id === "p");
  const resource = before.data.resources.find((item) => item.id === "r0");
  const invalid = [
    { kind: "allocation", id: hiddenKey, value: -0.1, revision: 1 },
    { kind: "allocation", id: hiddenKey, value: 10000.1, revision: 1 },
    {
      kind: "allocation",
      id: key.replace("2026-09", "2031-01"),
      value: 1,
      revision: 0,
    },
    {
      kind: "project",
      id: "p",
      value: { ...project, name: "   " },
      revision: 1,
    },
    {
      kind: "resource",
      id: "r0",
      value: {
        ...resource,
        versions: [{ ...resource.versions[0], team: "missing" }],
      },
      revision: 1,
    },
    {
      kind: "project",
      id: "p",
      value: {
        ...project,
        milestones: [
          {
            ...project.milestones[0],
            additionalRanges: [
              {
                start: "2026-09-10",
                end: "2026-09-20",
                description: "Overlap",
              },
            ],
          },
        ],
      },
      revision: 1,
    },
  ];
  for (const change of invalid) {
    await assert.rejects(
      changeAndView(store, users.admin, [
        { kind: "allocation", id: key, value: 0.5, revision: 0 },
        change,
      ]),
      (error) => error.status === 400 || error.name === "ZodError",
    );
    assert.deepEqual(await store.view(users.admin), before);
    assert.equal((await store.auditLog(users.admin)).total, audit);
  }
  assert.equal(persistenceCalls, 0);
});

test("single final validation persists normalized project text and departure history without changing the commands", async (t) => {
  const { store, users } = await setup(t);
  const before = await store.view(users.admin);
  const project = before.data.projects.find((item) => item.id === "p");
  const resource = before.data.resources.find((item) => item.id === "r0");
  const commands = [
    {
      kind: "project",
      id: "p",
      revision: 1,
      value: {
        ...project,
        name: "  Updated project  ",
        responsibleName: "  Responsible  ",
      },
    },
    {
      kind: "resource",
      id: "r0",
      revision: 1,
      value: {
        ...resource,
        versions: [
          { ...resource.versions[0], start: "2026-01" },
          {
            ...resource.versions[0],
            effective: "2026-09",
            status: "İşten Ayrıldı",
            start: "2026-01",
            end: "2026-09",
          },
        ],
      },
    },
  ];
  const untouched = structuredClone(commands);
  const result = await changeAndView(store, users.admin, commands);
  assert.deepEqual(commands, untouched);
  assert.deepEqual(result, await store.view(users.admin));
  const savedProject = result.data.projects.find((item) => item.id === "p");
  assert.equal(savedProject.name, "Updated project");
  assert.equal(savedProject.responsibleName, "Responsible");
  const savedResource = result.data.resources.find((item) => item.id === "r0");
  for (const version of savedResource.versions) {
    assert.equal(version.start, "2026-01-01");
    assert.equal(version.end, "2026-09-30");
  }
});

test("the before snapshot preserves old nested resource values for team-change auditing", async (t) => {
  const { store, users, team, other } = await setup(t);
  const before = await store.view(users.admin);
  const audit = (await store.auditLog(users.admin)).total;
  const result = await changeAndView(store, users.admin, [
    {
      kind: "team",
      id: team.id,
      revision: 0,
      value: { ...team, lead: other.lead },
    },
  ]);
  assert.deepEqual(result, await store.view(users.admin));
  assert.equal(
    result.data.resources.find((item) => item.id === "r0").versions[0].lead,
    other.lead,
  );
  assert.equal(result.data.revisions["resource:r0"], 2);
  assert.equal(
    before.data.resources.find((item) => item.id === "r0").versions[0].lead,
    team.lead,
  );
  const history = await store.auditLog(users.admin);
  assert.equal(history.total, audit + 2);
  const resourceEdit = history.entries.find(
    (entry) =>
      entry.kind === "resource" &&
      entry.record_id === "r0" &&
      entry.action === "update",
  );
  assert.deepEqual(resourceEdit.changes, [
    { path: ["versions", "0", "lead"], before: team.lead, after: other.lead },
  ]);
});

test("opt-in planning deltas reproduce SQL snapshots for create, zero, unchanged values, batches and deletion tombstones", async (t) => {
  const { store, users, key, team } = await setup(t);
  for (const user of [users.admin, users.manager]) {
    let cached = await store.view(user);
    const second = team.id + "|p|2026-10";
    const changes = (id, value) => ({
      kind: "allocation",
      id,
      value,
      revision: cached.data.revisions["allocation:" + id] || 0,
    });
    for (const batch of [
      () => [changes(key, 0.5)],
      () => [changes(key, 0)],
      () => [changes(key, 0)],
      () => [changes(key, 1), changes(second, 0.25)],
      () => [{ ...changes(key, null), operation: "delete" }],
      () => [{ ...changes(key, null), operation: "delete" }],
    ]) {
      const old = structuredClone(cached);
      const delta = await changeAndView(store, user, batch(), {
        responseMode: "planning-delta-v1",
        baseGeneration: cached.generation,
      });
      assert.equal(delta.responseMode, "planning-delta-v1");
      assert.equal(Object.hasOwn(delta, "data"), false);
      const data = mergePlanningDelta(cached, delta);
      assert(data);
      assert.deepEqual(
        cached,
        old,
        "merge must not mutate a displayed snapshot",
      );
      cached = { data, generation: delta.generation, user: delta.user };
      assert.deepEqual(cached, await store.view(user));
      assert(
        delta.allocations.every((entry) => entry.id.startsWith(team.id + "|")),
      );
      assert.equal(JSON.stringify(delta).includes("Private"), false);
    }
  }
});

test("stale bases, non-opt-in clients, mixed writes and normalized metadata get full snapshots", async (t) => {
  const { store, users, key, team } = await setup(t);
  let cached = await store.view(users.admin);
  for (const response of [
    {
      responseMode: "planning-delta-v1",
      baseGeneration: cached.generation - 1,
    },
    { responseMode: "unknown", baseGeneration: cached.generation },
    { responseMode: "planning-delta-v1", baseGeneration: "1" },
    {},
  ]) {
    const result = await changeAndView(
      store,
      users.admin,
      [
        {
          kind: "allocation",
          id: key,
          value: 0.5,
          revision: cached.data.revisions["allocation:" + key] || 0,
        },
      ],
      response,
    );
    assert.deepEqual(result, await store.view(users.admin));
    cached = result;
  }
  const project = cached.data.projects.find((item) => item.id === "p");
  cached = await changeAndView(
    store,
    users.admin,
    [
      {
        kind: "project",
        id: "p",
        value: { ...project, name: "Updated" },
        revision: 1,
      },
    ],
    { responseMode: "planning-delta-v1", baseGeneration: cached.generation },
  );
  assert.deepEqual(cached, await store.view(users.admin));
  await store.transaction((c) =>
    c.query("UPDATE kp_teams SET name=@p0 WHERE id=@p1", [" Legacy ", team.id]),
  );
  const result = await changeAndView(
    store,
    users.admin,
    [
      {
        kind: "allocation",
        id: key,
        value: 1,
        revision: cached.data.revisions["allocation:" + key],
      },
    ],
    { responseMode: "planning-delta-v1", baseGeneration: cached.generation },
  );
  assert.deepEqual(result, await store.view(users.admin));
  assert.equal(
    result.data.teams.find((item) => item.id === team.id).name,
    "Legacy",
  );
});

test("delta negotiation preserves permissions, revisions and disk rollback", async (t) => {
  const { store, users, key, hiddenKey } = await setup(t);
  const before = await store.view(users.admin);
  const response = {
    responseMode: "planning-delta-v1",
    baseGeneration: before.generation,
  };
  for (const [user, id, revision, status] of [
    [users.manager, hiddenKey, 1, 403],
    [users.normal, key, 0, 403],
    [users.admin, key, 99, 409],
  ])
    await assert.rejects(
      changeAndView(
        store,
        user,
        [
          {
            kind: "allocation",
            id,
            value: 0.5,
            revision,
          },
        ],
        response,
      ),
      (error) => error.status === status,
    );
  const file = store.db.file;
  const blocker = file + "-directory";
  await fs.mkdir(blocker);
  store.db.file = blocker;
  try {
    await assert.rejects(
      changeAndView(
        store,
        users.admin,
        [
          {
            kind: "allocation",
            id: key,
            value: 0.5,
            revision: 0,
          },
        ],
        response,
      ),
      (error) => blockedCommitRename(error, blocker),
    );
  } finally {
    store.db.file = file;
  }
  assert.deepEqual(await store.view(users.admin), before);
});

test("authenticated HTTP delta writes fall back after another client's committed edit", async (t) => {
  const { store, users, key, hiddenKey } = await setup(t);
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port;
  const app = createApp(store, { origin });
  server.on("request", app);
  t.after(async () => {
    app.locals.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const login = await fetch(origin + "/api/auth/login", {
    method: "POST",
    headers: {
      Origin: origin,
      "X-Requested-With": "KaynakPortal",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: "snapshot.admin",
      password: "Snapshot-test-only-284!",
    }),
  });
  assert.equal(login.status, 200);
  const auth = await login.json();
  const headers = {
    Origin: origin,
    "X-Requested-With": "KaynakPortal",
    "Content-Type": "application/json",
    Cookie: login.headers.get("set-cookie").split(";")[0],
    "X-CSRF-Token": auth.csrf,
  };
  const cached = await store.view(users.admin);
  async function write(id, revision, baseGeneration) {
    const response = await fetch(origin + "/api/changes", {
      method: "POST",
      headers,
      body: JSON.stringify({
        changes: [{ kind: "allocation", id, value: 0.5, revision }],
        responseMode: "planning-delta-v1",
        baseGeneration,
      }),
    });
    assert.equal(response.status, 200);
    return response.json();
  }
  const delta = await write(hiddenKey, 1, cached.generation);
  assert.equal(delta.responseMode, "planning-delta-v1");
  const result = await write(key, 0, cached.generation);
  assert.deepEqual(result, await store.view(users.admin));
  assert.equal(result.data.allocations[hiddenKey], 0.5);
});

test("actual and hour responses use one transaction/read and match SQL views for each role", async (t) => {
  const { store, users } = await setup(t);
  const originalRead = store.read;
  const originalTransaction = store.transaction;
  let reads = 0,
    transactions = 0;
  t.mock.method(store, "read", async function (...args) {
    reads++;
    return originalRead.apply(this, args);
  });
  t.mock.method(store, "transaction", function (...args) {
    transactions++;
    return originalTransaction.apply(this, args);
  });
  for (const role of ["admin", "manager", "normal"]) {
    const user = users[role];
    let state = await store.view(user);
    const batches = [
      {
        kind: "actual",
        id: "r0|p|2026-01",
        value: { unit: "percent", value: 10 },
      },
      { kind: "workedHours", id: "r0|2026-01", value: 230 },
      { kind: "workedHours", id: "r0|2026-01", value: null },
      {
        kind: "actual",
        id: "r0|p|2026-01",
        value: { unit: "hours", value: 4 },
      },
      { kind: "actual", id: "r0|p|2026-01", value: 0 },
      { kind: "actual", id: "r0|p|2026-01", operation: "delete" },
    ];
    for (const change of batches) {
      reads = transactions = 0;
      const revision = state.data.revisions[change.kind + ":" + change.id] || 0;
      const result = await changeAndView(store, user, [
        { ...change, revision },
      ]);
      assert.equal(reads, 1);
      assert.equal(transactions, 1);
      assert.equal(result.generation, state.generation + 1);
      assert.deepEqual(result, await store.view(user));
      assert.equal(JSON.stringify(result).includes('"password"'), false);
      state = result;
    }
    assert.equal(
      Object.hasOwn(state.data.actualAllocations, "r0|p|2026-01"),
      false,
    );
    assert.equal(
      Object.hasOwn(state.data.actualPercentEntries, "r0|p|2026-01"),
      false,
    );
    if (role !== "admin") {
      assert.equal(state.data.actualAllocations["r1|p|2026-01"], undefined);
      assert.equal(state.data.users, undefined);
      assert.equal(state.data.legacyArchive, undefined);
      assert.equal(state.data.actualTeamTotals !== undefined, true);
    }
  }
});

test("concurrent non-planning responses retain their own commit generation and snapshot", async (t) => {
  const { store, users } = await setup(t);
  const before = await store.view(users.normal);
  const firstKey = "r0|p|2026-07",
    secondKey = "r0|p|2026-08";
  const [first, second] = await Promise.all([
    changeAndView(store, users.normal, [
      { kind: "actual", id: firstKey, revision: 0, value: 0.1 },
    ]),
    changeAndView(store, users.normal, [
      { kind: "actual", id: secondKey, revision: 0, value: 0.2 },
    ]),
  ]);
  assert.equal(first.generation, before.generation + 1);
  assert.equal(second.generation, before.generation + 2);
  assert.equal(first.data.actualAllocations[firstKey], 0.1);
  assert.equal(Object.hasOwn(first.data.actualAllocations, secondKey), false);
  assert.equal(second.data.actualAllocations[firstKey], 0.1);
  assert.equal(second.data.actualAllocations[secondKey], 0.2);
  assert.deepEqual(second, await store.view(users.normal));
});

test("calendar and personal-day changes re-read metadata within the write transaction and project deletion retains cascades", async (t) => {
  const { store, users } = await setup(t);
  await changeAndView(store, users.normal, [
    {
      kind: "actual",
      id: "r0|p|2026-01",
      revision: 1,
      value: { unit: "percent", value: 10 },
    },
  ]);
  const read = store.read;
  const transaction = store.transaction;
  let reads = 0,
    transactions = 0;
  t.mock.method(store, "read", async function (...args) {
    reads++;
    return read.apply(this, args);
  });
  t.mock.method(store, "transaction", function (...args) {
    transactions++;
    return transaction.apply(this, args);
  });
  const batches = [
    [
      users.admin,
      {
        kind: "calendar",
        id: "shared",
        revision: 0,
        value: {
          "2026-01-02": { type: "company", label: "Holiday", fraction: 1 },
        },
      },
    ],
    [
      users.normal,
      {
        kind: "personDay",
        id: "r0|2026-01-05|leave",
        revision: 0,
        value: { type: "leave", label: "Leave", hours: 2 },
      },
    ],
    [
      users.normal,
      {
        kind: "personDay",
        id: "r0|2026-01-06|training",
        revision: 0,
        value: { type: "training", label: "Training", hours: 3 },
      },
    ],
    [
      users.normal,
      {
        kind: "personDay",
        id: "r0|2026-01-05|leave",
        revision: 1,
        operation: "delete",
      },
    ],
    [
      users.admin,
      { kind: "project", id: "p", revision: 1, operation: "delete" },
    ],
  ];
  for (const [user, change] of batches) {
    reads = transactions = 0;
    const result = await changeAndView(store, user, [change]);
    assert.equal(reads, 2);
    assert.equal(transactions, 1);
    assert.deepEqual(result, await store.view(user));
  }
  const after = await store.view(users.admin);
  assert.deepEqual(after.data.projects, []);
  assert.deepEqual(after.data.actualAllocations, {});
  assert.deepEqual(after.data.actualPercentEntries, {});
  assert.deepEqual(after.data.allocations, {});
  assert(after.data.revisions["actual:r0|p|2026-01"] > 2);
});

test("non-planning writes still enforce permission, revision and monthly limits atomically", async (t) => {
  const { store, users } = await setup(t);
  const before = await store.view(users.admin);
  const audit = (await store.auditLog(users.admin)).total;
  for (const [user, change, status] of [
    [
      users.normal,
      { kind: "actual", id: "r1|p|2026-01", revision: 1, value: 0.1 },
      403,
    ],
    [
      users.manager,
      { kind: "workedHours", id: "r1|2026-01", revision: 0, value: 230 },
      403,
    ],
    [
      users.normal,
      { kind: "actual", id: "r0|p|2026-01", revision: 0, value: 0.1 },
      409,
    ],
    [
      users.normal,
      { kind: "workedHours", id: "r0|2026-01", revision: 0, value: 1 },
      400,
    ],
    [
      { ...users.normal, version: 0 },
      { kind: "actual", id: "r0|p|2026-01", revision: 1, value: 0.1 },
      401,
    ],
  ]) {
    await assert.rejects(
      changeAndView(store, user, [change]),
      (error) => error.status === status,
    );
    assert.deepEqual(await store.view(users.admin), before);
    assert.equal((await store.auditLog(users.admin)).total, audit);
  }
});

test("a non-planning response is withheld on disk failure and the committed data survives restart", async (t) => {
  const { store, users, env } = await setup(t);
  const before = await store.view(users.admin);
  const audit = (await store.auditLog(users.admin)).total;
  const originalFile = store.db.file;
  const blocker = originalFile + "-blocked";
  await fs.mkdir(blocker);
  let projected = 0;
  const projectView = store.projectView;
  t.mock.method(store, "projectView", async function (...args) {
    projected++;
    return projectView.apply(this, args);
  });
  store.db.file = blocker;
  try {
    await assert.rejects(
      changeAndView(store, users.normal, [
        { kind: "actual", id: "r0|p|2026-01", revision: 1, value: 0.1 },
      ]),
      (error) => blockedCommitRename(error, blocker),
    );
  } finally {
    store.db.file = originalFile;
  }
  assert.equal(projected, 1);
  assert.deepEqual(await store.view(users.admin), before);
  assert.equal((await store.auditLog(users.admin)).total, audit);
  await store.close();
  const reopened = new Store({ env });
  try {
    await reopened.connect();
    assert.deepEqual(await reopened.view(users.admin), before);
    assert.equal((await reopened.auditLog(users.admin)).total, audit);
  } finally {
    await reopened.close();
  }
});

test("planning deltas fall back for numeric changes and same-value non-planning revisions", async (t) => {
  const { store, users, key } = await setup(t);
  for (const change of [
    { kind: "actual", id: "r0|p|2026-01", value: 0.1 },
    { kind: "actual", id: "r0|p|2026-01", value: 0.1 },
    { kind: "workedHours", id: "r0|2026-01", value: 180 },
    { kind: "workedHours", id: "r0|2026-01", operation: "delete" },
  ]) {
    const before = await store.view(users.admin);
    const result = await store.mutate(
      users.admin,
      (data, active) =>
        applyChanges(data, active, [
          {
            kind: "allocation",
            id: key,
            revision: before.data.revisions["allocation:" + key] || 0,
            value: 0.5,
          },
          {
            ...change,
            revision: before.data.revisions[change.kind + ":" + change.id] || 0,
          },
        ]),
      {
        returnView: true,
        planningDelta: { baseGeneration: before.generation, ids: [key] },
      },
    );
    assert.equal(result.responseMode, undefined);
    assert.deepEqual(result, await store.view(users.admin));
    assert.equal(
      result.data.revisions[change.kind + ":" + change.id],
      (before.data.revisions[change.kind + ":" + change.id] || 0) + 1,
    );
  }
});

test("only owned planning commands receive narrow drafts; matching deltas skip full projection", async (t) => {
  const { store, users, key, hiddenKey } = await setup(t);
  const originalCopy = store.copySnapshot,
    originalView = store.projectView;
  const copies = [];
  let views = 0;
  t.mock.method(store, "copySnapshot", function (data, options) {
    copies.push(options.planningOnly);
    return originalCopy.call(this, data, options);
  });
  t.mock.method(store, "projectView", async function (...args) {
    views++;
    return originalView.apply(this, args);
  });
  const before = await store.view(users.manager);
  views = 0;
  const delta = await changeAndView(
    store,
    users.manager,
    [{ kind: "allocation", id: key, value: 0, revision: 0 }],
    { responseMode: "planning-delta-v1", baseGeneration: before.generation },
  );
  assert.equal(delta.responseMode, "planning-delta-v1");
  assert.equal(views, 0);
  assert.deepEqual(copies, [true]);
  assert.equal(
    delta.allocations.some((a) => a.id === hiddenKey),
    false,
  );
  const merged = {
    ...before,
    generation: delta.generation,
    data: mergePlanningDelta(before, delta),
  };
  assert.deepEqual(merged, await store.view(users.manager));
  views = 0;
  const fallback = await changeAndView(
    store,
    users.admin,
    [{ kind: "allocation", id: key, value: 0.25, revision: 1 }],
    { responseMode: "planning-delta-v1", baseGeneration: before.generation },
  );
  assert.equal(fallback.responseMode, undefined);
  assert.equal(views, 1);
  assert.deepEqual(fallback, await store.view(users.admin));
  const command = planningCommand([
    { kind: "allocation", id: key, value: 0.5, revision: 2 },
  ]);
  assert(isPlanningCommand(command));
  const arbitrary = (...args) => command(...args);
  arbitrary.planningOnly = true;
  assert.equal(isPlanningCommand(arbitrary), false);
  await store.mutate(users.admin, arbitrary);
  await store.mutate(users.admin, (d, u) =>
    stageChanges(d, u, [
      { kind: "allocation", id: key, value: 1, revision: 3 },
    ]),
  );
  assert.deepEqual(copies, [true, true, false, false]);
});

test("planning command input cannot turn into a metadata write after draft selection", async (t) => {
  const { store, users, key } = await setup(t);
  const before = await store.view(users.admin),
    audit = (await store.auditLog(users.admin)).total;
  const input = [{ kind: "allocation", id: key, value: 0.5, revision: 0 }];
  const command = planningCommand(input);
  input.push({
    kind: "project",
    id: "p",
    value: { ...before.data.projects[0], name: "Changed" },
    revision: 1,
  });
  await assert.rejects(
    store.mutate(users.admin, command),
    (e) => e.status === 400,
  );
  assert.deepEqual(await store.view(users.admin), before);
  assert.equal((await store.auditLog(users.admin)).total, audit);
});

test("narrow drafts still reject unrelated invalid data before any persistence", async (t) => {
  const { store, users, key } = await setup(t);
  const before = await store.view(users.admin),
    audit = (await store.auditLog(users.admin)).total;
  const read = store.read;
  let writes = 0;
  t.mock.method(store, "persist", () => {
    writes++;
    throw Error("Must not persist invalid snapshot");
  });
  for (const corrupt of [
    (d) => {
      d.actualAllocations["missing|p|2026-09"] = 0.25;
    },
    (d) => {
      d.actualWorkedHours["r0|2026-13"] = 1;
    },
    (d) => {
      d.personCalendar["r0|2026-02-30|leave"] = {
        type: "leave",
        hours: 1,
        label: "",
      };
    },
  ]) {
    const mock = t.mock.method(store, "read", async function (...args) {
      const snapshot = await read.apply(this, args);
      corrupt(snapshot.data);
      return snapshot;
    });
    await assert.rejects(
      changeAndView(store, users.admin, [
        { kind: "allocation", id: key, value: 1, revision: 0 },
      ]),
      (e) => e.status === 400,
    );
    mock.mock.restore();
    assert.deepEqual(await store.view(users.admin), before);
    assert.equal((await store.auditLog(users.admin)).total, audit);
  }
  assert.equal(writes, 0);
});

test("failure while preparing a direct delta rolls back persisted values, audit and generation across reopen", async (t) => {
  const { store, env, users, key } = await setup(t);
  const before = await store.view(users.admin),
    audit = (await store.auditLog(users.admin)).total;
  const error = Error("Synthetic projection failure");
  const mock = t.mock.method(store, "projectPlanningDelta", () => {
    throw error;
  });
  await assert.rejects(
    changeAndView(
      store,
      users.admin,
      [{ kind: "allocation", id: key, value: 1, revision: 0 }],
      { responseMode: "planning-delta-v1", baseGeneration: before.generation },
    ),
    (e) => e === error,
  );
  mock.mock.restore();
  assert.deepEqual(await store.view(users.admin), before);
  assert.equal((await store.auditLog(users.admin)).total, audit);
  await store.close();
  const reopened = new Store({ env });
  try {
    await reopened.connect();
    assert.deepEqual(await reopened.view(users.admin), before);
    assert.equal((await reopened.auditLog(users.admin)).total, audit);
  } finally {
    await reopened.close();
  }
});

test("validation, settings and response stage failures preserve committed data, audit and generation across restart", async (t) => {
  const { store, env, users, key } = await setup(t);
  const before = await store.view(users.admin),
    audit = (await store.auditLog(users.admin)).total;
  const file = await fs.readFile(env.SQLJS_FILE);
  for (const method of [
    "validateSnapshot",
    "prepareMutationSettings",
    "prepareMutationView",
  ]) {
    const original = store[method],
      failure = Error("Synthetic " + method + " failure");
    const mock = t.mock.method(store, method, function (...args) {
      const result = original.apply(this, args);
      if (method === "prepareMutationView")
        return result.then(() => {
          throw failure;
        });
      throw failure;
    });
    try {
      await assert.rejects(
        changeAndView(
          store,
          users.admin,
          [{ kind: "allocation", id: key, value: 0.5, revision: 0 }],
          {
            responseMode: "planning-delta-v1",
            baseGeneration: before.generation,
          },
        ),
        (error) => error === failure,
      );
    } finally {
      mock.mock.restore();
    }
    assert.deepEqual(await store.view(users.admin), before);
    assert.equal((await store.auditLog(users.admin)).total, audit);
    assert.deepEqual(await fs.readFile(env.SQLJS_FILE), file);
  }
  await store.close();
  const reopened = new Store({ env });
  try {
    await reopened.connect();
    assert.deepEqual(await reopened.view(users.admin), before);
    assert.equal((await reopened.auditLog(users.admin)).total, audit);
  } finally {
    await reopened.close();
  }
});
