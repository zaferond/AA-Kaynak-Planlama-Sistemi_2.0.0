import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { auditEntries } from "../backend/audit.mjs";
import { changeAndView } from "../backend/change-service.mjs";
import { dataChanges } from "../backend/change-set.mjs";

test("audit events identify changed fields without storing credentials or private absence labels", () => {
  const base = {
    teams: [],
    projects: [],
    resources: [],
    risks: [],
    allocations: {},
    actualAllocations: {},
    leaders: [],
    personCalendar: {},
  };
  const user = {
    _id: "u",
    username: "user",
    name: "User",
    role: "normal",
    resourceId: "",
    leaders: [],
    active: true,
    password: { salt: "SECRET_SALT", hash: "SECRET_HASH" },
  };
  const events = auditEntries(
    base,
    {
      ...base,
      personCalendar: {
        "r|2026-09-01|leave": {
          type: "leave",
          hours: 2,
          label: "PRIVATE_LABEL",
        },
      },
    },
    { _id: "admin", name: "Admin" },
    { beforeUsers: [user], afterUsers: [{ ...user, role: "manager" }] },
  );
  assert.equal(events.length, 2);
  const serialized = JSON.stringify(events);
  for (const secret of ["SECRET_SALT", "SECRET_HASH", "PRIVATE_LABEL"])
    assert(!serialized.includes(secret));
  assert.deepEqual(
    JSON.parse(events.find((event) => event.kind === "user").changes),
    [{ path: ["role"], before: "normal", after: "manager" }],
  );
});

test("audit history commits atomically, survives restart and is available only to admins", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-audit-"));
  const store = new Store({
    env: { DB_PROVIDER: "sqljs", SQLJS_FILE: path.join(dir, "plan.sqlite") },
  });
  try {
    await store.connect();
    const password = await hashPassword("Audit-test-password-284!");
    for (const [id, role] of [
      ["root-admin", "admin"],
      ["reader", "normal"],
    ])
      await store.bootstrapUser({
        _id: id,
        username: id,
        name: id,
        role,
        leaders: [],
        active: true,
        password,
        revision: 1,
        version: 1,
      });
    const admin = await store.findUser({ id: "root-admin" }),
      reader = await store.findUser({ id: "reader" });
    const project = {
      id: "audit-project",
      name: "Önceki ad",
      start: "2026-01",
      end: "2026-12",
      phases: {},
    };
    await store.mutate(admin, (d) =>
      applyChanges(d, admin, [
        { kind: "project", id: project.id, value: project, revision: 0 },
      ]),
    );
    await store.mutate(admin, (d) =>
      applyChanges(d, admin, [
        {
          kind: "project",
          id: project.id,
          value: { ...project, name: "Yeni ad" },
          revision: 1,
        },
      ]),
    );
    const history = await store.auditLog(admin, { limit: 1 });
    assert.equal(history.total, 2);
    assert.equal(history.entries.length, 1);
    assert.equal(
      (await store.auditLog(admin, { offset: 1, limit: 1 })).entries.length,
      1,
    );
    const edit = (await store.auditLog(admin)).entries.find(
      (entry) => entry.action === "update",
    );
    assert.deepEqual(edit.changes, [
      { path: ["name"], before: "Önceki ad", after: "Yeni ad" },
    ]);
    assert.equal(edit.actor_id, "root-admin");
    await assert.rejects(
      () => store.auditLog(reader),
      (error) => error.status === 403,
    );
    const before = await store.read();
    await assert.rejects(
      () =>
        store.mutate(admin, (d, u, c) => {
          applyChanges(d, u, [
            {
              kind: "project",
              id: project.id,
              value: { ...project, name: "Must roll back" },
              revision: 2,
            },
          ]);
          const upsert = c.upsert;
          c.upsert = async (name, rows) => {
            if (name === "audit_events") throw Error("Audit unavailable");
            return upsert(name, rows);
          };
        }),
      /Audit unavailable/,
    );
    assert.deepEqual(await store.read(), before);
    assert.equal((await store.auditLog(admin)).total, 2);
    await store.close();
    await store.connect();
    assert.equal((await store.auditLog(admin)).total, 2);
    await store.mutate(admin, (d) =>
      applyChanges(d, admin, [
        { kind: "project", id: project.id, operation: "delete", revision: 2 },
      ]),
    );
    assert.equal(
      (await store.auditLog(admin)).entries.filter(
        (entry) => entry.action === "delete",
      ).length,
      1,
    );
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("prototype-safe project IDs support create/delete with allocation cleanup and correct audit actions", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-audit-ids-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "test.sqlite"),
    },
  });
  try {
    await store.connect();
    await store.bootstrapUser({
      _id: "root-admin",
      username: "test.admin",
      name: "Admin",
      role: "admin",
      leaders: [],
      active: true,
      password: await hashPassword("Audit-ID-test-only-284!"),
      revision: 1,
      version: 1,
    });
    const admin = await store.findUser({ id: "root-admin" });
    const team = (await store.read()).data.teams.find((item) => item.lead);
    const id = "constructor";
    const key = team.id + "|" + id + "|2026-09";
    await changeAndView(store, admin, [
      {
        kind: "project",
        id,
        revision: 0,
        value: {
          id,
          name: "Prototype-name project",
          start: "2026-01",
          end: "2026-12",
          phases: {},
        },
      },
      { kind: "allocation", id: key, revision: 0, value: 0.5 },
    ]);
    const result = await changeAndView(store, admin, [
      { kind: "project", id, revision: 1, operation: "delete" },
    ]);
    assert.equal(
      result.data.projects.some((item) => item.id === id),
      false,
    );
    assert.equal(Object.hasOwn(result.data.allocations, key), false);
    const events = (await store.auditLog(admin)).entries;
    assert.deepEqual(
      events
        .filter((event) => event.kind === "project")
        .map((event) => event.action)
        .sort(),
      ["create", "delete"],
    );
    assert.deepEqual(
      events
        .filter((event) => event.kind === "allocation")
        .map((event) => event.action)
        .sort(),
      ["create", "delete"],
    );
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("shared raw changes preserve private-only writes and empty defaults without producing audit events", () => {
  const base = {
    teams: [],
    projects: [{ id: "p", name: "Project" }],
    resources: [{ id: "r", name: "Person", note: "PRIVATE_OLD" }],
    risks: [],
    leaders: [],
    allocations: {},
    actualAllocations: {},
    personCalendar: {
      "r|2026-09-01|leave": {
        type: "leave",
        hours: 2,
        label: "PRIVATE_LABEL_OLD",
      },
    },
    revisions: { "resource:r": 1 },
  };
  const after = structuredClone(base);
  after.projects[0].responsibleName = "";
  after.resources[0].note = "PRIVATE_NEW";
  after.personCalendar["r|2026-09-01|leave"].label = "PRIVATE_LABEL_NEW";
  after.actualPercentEntries = { "r|p|2026-09": 25 };
  after.revisions["resource:r"]++;
  const changeSet = dataChanges(base, after);
  assert.equal(changeSet.project.length, 1);
  assert.equal(changeSet.resource.length, 1);
  assert.equal(changeSet.personDay.length, 1);
  assert.equal(changeSet.percent.length, 1);
  const actor = { _id: "admin", name: "Admin" };
  assert.deepEqual(auditEntries(base, after, actor, { changeSet }), []);
  const visible = structuredClone(after);
  visible.resources[0].name = "Updated person";
  visible.personCalendar["r|2026-09-01|leave"].hours = 3;
  const summarize = (events) =>
    events.map(({ id, occurred_at, ...entry }) => entry);
  const shared = auditEntries(base, visible, actor, {
    changeSet: dataChanges(base, visible),
  });
  assert.deepEqual(
    summarize(shared),
    summarize(auditEntries(base, visible, actor)),
  );
  assert.equal(shared.length, 2);
  assert.deepEqual(
    JSON.parse(shared.find((event) => event.kind === "resource").changes),
    [{ path: ["name"], before: "Person", after: "Updated person" }],
  );
  assert.deepEqual(
    JSON.parse(shared.find((event) => event.kind === "personDay").changes),
    [{ path: ["hours"], before: 2, after: 3 }],
  );
  assert.equal(JSON.stringify(shared).includes("PRIVATE_"), false);
  assert.equal(after.resources[0].note, "PRIVATE_NEW");
  assert.equal(
    after.personCalendar["r|2026-09-01|leave"].label,
    "PRIVATE_LABEL_NEW",
  );
});
