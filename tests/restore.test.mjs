import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {
  restore,
  applyChanges,
  reset,
  importRows,
} from "../backend/operations.mjs";
import { Store } from "../backend/store.mjs";
import { createApp } from "../backend/app.mjs";
import { hashPassword } from "../backend/auth.mjs";

const admin = { _id: "root-admin", role: "admin", leaders: [] };
const hoursKey = "r|2026-01",
  dayKey = "r|2026-01-05|leave";
const fixture = () => ({
  teams: [
    { id: "t", name: "Takım", lead: "A", excelCapacity: 0, catalog: true },
  ],
  projects: [
    { id: "p", name: "Proje", start: "2026-01", end: "2026-12", phases: {} },
  ],
  resources: [
    {
      id: "r",
      name: "Çalışan",
      note: "",
      versions: [
        {
          effective: "2026-01",
          team: "t",
          lead: "A",
          status: "Aktif Çalışan",
          included: true,
          start: "2026-01-01",
          end: "",
          amount: 1,
        },
      ],
    },
  ],
  allocations: {},
  actualAllocations: {},
  actualWorkedHours: {},
  personCalendar: {},
  revisions: {},
  leaders: ["A"],
  catalogVersion: 2,
});
test("restore advances revisions for deleted hours and personal days and rejects stale writes", () => {
  const current = fixture(),
    backup = fixture();
  for (const key of ["workedHours:" + hoursKey, "personDay:" + dayKey]) {
    current.revisions[key] = 4;
    backup.revisions[key] = 2;
  }
  const untouched = structuredClone(backup);
  restore(current, admin, backup);
  assert.deepEqual(backup, untouched);
  assert.equal(current.revisions["workedHours:" + hoursKey], 5);
  assert.equal(current.revisions["personDay:" + dayKey], 5);
  for (const change of [
    { kind: "workedHours", id: hoursKey, value: 180, revision: 2 },
    {
      kind: "personDay",
      id: dayKey,
      value: { type: "leave", hours: 2, label: "" },
      revision: 2,
    },
  ])
    assert.throws(
      () => applyChanges(current, admin, [change]),
      (e) => e.status === 409,
    );
});
test("restore derives revisions from current state, including deleted records, instead of trusting backup counters", () => {
  const current = fixture(),
    backup = fixture();
  current.revisions = {
    "project:p": 7,
    "resource:r": 3,
    "project:deleted": 8,
    ["workedHours:" + hoursKey]: 4,
  };
  backup.revisions = {
    "project:p": 99999,
    "workedHours:unknown|2026-01": 99999,
    "user:root-admin": 99999,
    "unknown:record": 99999,
  };
  backup.projects.push({ ...backup.projects[0], id: "new", name: "Yeni" });
  restore(current, admin, backup);
  assert.equal(current.revisions["project:p"], 8);
  assert.equal(current.revisions["project:deleted"], 9);
  assert.equal(current.revisions["project:new"], 1);
  assert.equal(current.revisions["workedHours:" + hoursKey], 5);
  for (const key of [
    "workedHours:unknown|2026-01",
    "user:root-admin",
    "unknown:record",
  ])
    assert.equal(current.revisions[key], undefined);
});
test("an invalid restore leaves the source unchanged and normal users cannot restore", () => {
  const current = fixture(),
    original = structuredClone(current),
    backup = fixture();
  backup.projects.push({ ...backup.projects[0] });
  assert.throws(() => restore(current, admin, backup), /Tekrarlanan/);
  assert.deepEqual(current, original);
  assert.throws(
    () => restore(current, { ...admin, role: "normal" }, fixture()),
    (e) => e.status === 403,
  );
});

test("restore replaces an optional legacy archive, including its absence, only after validation", () => {
  const current = fixture();
  const archive = {
    teams: [],
    allocations: { archived: 0.25 },
    resourceTeams: {},
  };
  current.legacyArchive = structuredClone(archive);
  const invalid = fixture();
  invalid.projects.push({ ...invalid.projects[0] });
  const original = structuredClone(current);
  assert.throws(() => restore(current, admin, invalid), /Tekrarlanan/);
  assert.deepEqual(current, original);

  const backup = fixture();
  const untouched = structuredClone(backup);
  restore(current, admin, backup);
  assert.equal(Object.hasOwn(current, "legacyArchive"), false);
  assert.deepEqual(backup, untouched);

  backup.legacyArchive = structuredClone(archive);
  const withArchive = structuredClone(backup);
  restore(current, admin, backup);
  assert.deepEqual(current.legacyArchive, archive);
  assert.deepEqual(backup, withArchive);
});

test("HTTP restore keeps revision conflict protection across deleted entries and restart", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-restore-"));
  const env = {
    DB_PROVIDER: "sqljs",
    NODE_ENV: "test",
    SQLJS_FILE: path.join(dir, "test.sqlite"),
  };
  let store = new Store({ env }),
    app,
    server;
  try {
    await store.connect();
    const password = "Restore-test-only-284!";
    await store.bootstrapUser({
      ...admin,
      username: "test.admin",
      name: "Admin",
      active: true,
      password: await hashPassword(password),
      revision: 1,
      version: 1,
    });
    server = http.createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = "http://127.0.0.1:" + server.address().port;
    app = createApp(store, { origin });
    server.on("request", app);
    let cookie = "",
      csrf = "";
    async function request(url, body, expected = 200) {
      const response = await fetch(origin + "/api" + url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: cookie,
          ...(body === undefined
            ? {}
            : {
                Origin: origin,
                "Content-Type": "application/json",
                "X-Requested-With": "KaynakPortal",
                "X-CSRF-Token": csrf,
              }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await response.json();
      assert.equal(response.status, expected, JSON.stringify(json));
      return { json, response };
    }
    const login = await request("/auth/login", {
      username: "test.admin",
      password,
    });
    cookie = login.response.headers.get("set-cookie").split(";")[0];
    csrf = login.json.csrf;
    const user = await store.findUser({ id: "root-admin" });
    const team = (await store.read()).data.teams.find((x) => x.lead);
    const resource = fixture().resources[0];
    resource.versions[0].team = team.id;
    resource.versions[0].lead = team.lead;
    await store.mutate(user, (d) =>
      applyChanges(d, user, [
        { kind: "resource", id: "r", value: resource, revision: 0 },
      ]),
    );
    const edits = (revision, remove = false) => [
      {
        kind: "workedHours",
        id: hoursKey,
        value: remove ? null : 180,
        revision,
      },
      {
        kind: "personDay",
        id: dayKey,
        ...(remove
          ? { operation: "delete" }
          : { value: { type: "leave", hours: 2, label: "" } }),
        revision,
      },
    ];
    await request("/changes", { changes: edits(0) });
    await request("/changes", { changes: edits(1, true) });
    const backup = (await request("/backup")).json;
    assert.equal(backup.data.users, undefined);
    await request("/changes", { changes: edits(2) });
    await request("/changes", { changes: edits(3, true) });
    const before = (await request("/data")).json;
    const auditBeforeInvalid = (await request("/audit")).json.total;
    const invalid = structuredClone(backup.data);
    invalid.projects = [
      fixture().projects[0],
      { ...fixture().projects[0], id: "q" },
    ];
    invalid.actualAllocations = { "r|p|2026-01": 0.6, "r|q|2026-01": 0.6 };
    invalid.actualPercentEntries = { "r|p|2026-01": 60, "r|q|2026-01": 60 };
    invalid.actualWorkedHours = { [hoursKey]: 180 };
    const rejected = await request(
      "/restore",
      { data: invalid, generation: before.generation },
      400,
    );
    assert.match(rejected.json.error, /%100/);
    assert.deepEqual((await request("/data")).json, before);
    assert.equal((await request("/audit")).json.total, auditBeforeInvalid);
    await request(
      "/restore",
      { data: backup.data, generation: before.generation - 1 },
      409,
    );
    const restored = (
      await request("/restore", {
        data: backup.data,
        generation: before.generation,
      })
    ).json;
    assert.equal(restored.data.revisions["workedHours:" + hoursKey], 5);
    assert.equal(restored.data.revisions["personDay:" + dayKey], 5);
    assert.equal(restored.generation, before.generation + 1);
    assert.equal(restored.data.actualWorkedHours[hoursKey], undefined);
    assert.equal(restored.data.personCalendar[dayKey], undefined);
    for (const change of edits(2))
      await request("/changes", { changes: [change] }, 409);
    for (const change of edits(4))
      await request("/changes", { changes: [change] }, 409);
    assert.equal((await request("/data")).json.generation, restored.generation);
    app.locals.close();
    await new Promise((resolve) => server.close(resolve));
    server = null;
    await store.close();
    store = new Store({ env });
    await store.connect();
    const after = await store.read();
    assert.equal(after.generation, restored.generation);
    assert.equal(after.data.revisions["workedHours:" + hoursKey], 5);
    assert.equal(after.data.revisions["personDay:" + dayKey], 5);
  } finally {
    app?.locals.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("restore preserves account permissions and reports linked-leadership conflicts without changing data", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-restore-accounts-"));
  const store = new Store({
    env: {
      DB_PROVIDER: "sqljs",
      NODE_ENV: "test",
      SQLJS_FILE: path.join(dir, "test.sqlite"),
    },
  });
  try {
    await store.connect();
    const password = await hashPassword("Restore-accounts-test-284!");
    await store.bootstrapUser({
      ...admin,
      username: "test.admin",
      name: "Admin",
      active: true,
      password,
      revision: 1,
      version: 1,
    });
    const actor = await store.findUser({ id: "root-admin" });
    await store.mutate(actor, (d, u) => restore(d, u, fixture()));
    await store.bootstrapUser({
      _id: "normal",
      username: "test.normal",
      name: "Normal",
      role: "normal",
      leaders: ["A"],
      resourceId: "r",
      active: true,
      password,
      revision: 1,
      version: 1,
    });
    const beforeUser = await store.findUser({ id: "normal" });
    const backup = structuredClone((await store.read()).data);
    backup.resources = [];
    backup.users = [
      {
        id: "normal",
        username: "test.normal",
        name: "Forged Admin",
        role: "admin",
        leaders: [],
        active: true,
      },
    ];
    await store.mutate(actor, (d, u) => restore(d, u, backup));
    const afterUser = await store.findUser({ id: "normal" });
    assert.deepEqual(afterUser, { ...beforeUser, resourceId: "" });
    assert.equal((await store.view(afterUser)).user.resourceId, "");
    assert.deepEqual((await store.view(afterUser)).data.actualAllocations, {});
    const state = await store.read(),
      audit = await store.auditLog(actor);
    const conflicting = structuredClone(state.data);
    conflicting.leaders = [];
    conflicting.leaderManagers = {};
    conflicting.leadershipUnits = {};
    for (const team of conflicting.teams) team.lead = "";
    await assert.rejects(
      () => store.mutate(actor, (d, u) => restore(d, u, conflicting)),
      (error) =>
        error.status === 409 && /kullanıcı yetkilerinde/.test(error.message),
    );
    assert.deepEqual(await store.read(), state);
    assert.equal((await store.auditLog(actor)).total, audit.total);
    assert.deepEqual(await store.findUser({ id: "normal" }), afterUser);
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("bulk commands preserve permissions and roll back after audit/generation SQL writes", async (t) => {
  for (const name of ["reset", "import", "restore"])
    await t.test(name, async (t) => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-bulk-commands-"));
      const env = {
        NODE_ENV: "test",
        DB_PROVIDER: "sqljs",
        SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
      };
      const store = new Store({ env });
      t.after(async () => {
        await store.close();
        await fs.rm(dir, { recursive: true, force: true });
      });
      await store.connect();
      const password = await hashPassword("Bulk-command-synthetic-only-284!");
      await store.bootstrapUser({
        ...admin,
        username: "bulk.admin",
        name: "Synthetic Admin",
        active: true,
        password,
        revision: 1,
        version: 1,
      });
      const actor = await store.findUser({ id: admin._id });
      const seed = fixture();
      seed.teams.push({
        id: "unassigned",
        name: "Synthetic Unassigned",
        lead: "",
        excelCapacity: 0,
        catalog: true,
      });
      seed.allocations = { "t|p|2026-09": 0.5 };
      seed.actualAllocations = { "r|p|2026-09": 0.25 };
      seed.actualPercentEntries = { "r|p|2026-09": 25 };
      seed.actualWorkedHours = { "r|2026-09": 180 };
      seed.personCalendar = {
        "r|2026-09-02|training": {
          type: "training",
          hours: 1,
          label: "Synthetic training",
        },
      };
      seed.legacyArchive = {
        teams: [],
        allocations: { archived: 0.25 },
        resourceTeams: {},
      };
      await store.mutate(actor, (d, u) => restore(d, u, seed));
      for (const role of ["normal", "manager"])
        await store.bootstrapUser({
          _id: role,
          username: "bulk." + role,
          name: "Synthetic " + role,
          role,
          leaders: ["A"],
          resourceId: role === "normal" ? "r" : "",
          active: true,
          password,
          revision: 1,
          version: 1,
        });
      const before = await store.read(),
        beforeUsers = await store.users();
      const audit = async () =>
        (await store.db.query("SELECT * FROM kp_audit_events ORDER BY id"))
          .rows;
      const beforeAudit = await audit();
      const expected = Object.fromEntries(
        Object.entries(before.data.revisions).filter(([key]) =>
          key.startsWith("allocation:"),
        ),
      );
      const rows = [
        {
          row: 2,
          date1904: false,
          problems: [],
          values: {
            name: "Synthetic Imported",
            lead: "A",
            team: "Synthetic Unassigned",
            status: "Aktif Çalışan",
            included: "Evet",
            amount: "1",
            start: "2026-01-01",
            end: "",
            note: "",
          },
        },
      ];
      const backup = structuredClone(before.data);
      backup.resources = [];
      backup.actualAllocations = {};
      backup.actualPercentEntries = {};
      backup.actualWorkedHours = {};
      backup.personCalendar = {};
      backup.allocations = { "t|p|2026-09": 0.2 };
      backup.workCalendar = {
        "2026-09-01": {
          type: "official",
          label: "Synthetic half day",
          fraction: 0.5,
        },
      };
      backup.revisions = { "project:p": 99999, "resource:r": 99999 };
      delete backup.legacyArchive;
      const command = (d, u) =>
        name === "reset"
          ? reset(d, u, expected)
          : name === "import"
            ? importRows(d, u, rows)
            : restore(d, u, backup);
      for (const role of ["normal", "manager"])
        await assert.rejects(
          () =>
            store.mutate(
              beforeUsers.find((u) => u._id === role),
              command,
            ),
          { status: 403 },
        );
      if (name === "reset")
        await assert.rejects(
          () => store.mutate(actor, (d, u) => reset(d, u, {})),
          { status: 409 },
        );
      if (name === "import")
        await assert.rejects(
          () =>
            store.mutate(actor, (d, u) =>
              importRows(d, u, [
                ...rows,
                {
                  ...rows[0],
                  row: 3,
                  values: {
                    ...rows[0].values,
                    name: "Synthetic Invalid",
                    amount: "-1",
                  },
                },
              ]),
            ),
          { status: 400 },
        );
      if (name === "restore") {
        const invalid = structuredClone(backup);
        invalid.projects.push({ ...invalid.projects[0] });
        await assert.rejects(
          () => store.mutate(actor, (d, u) => restore(d, u, invalid)),
          /Tekrarlanan/,
        );
      }
      assert.deepEqual(await store.read(), before);
      assert.deepEqual(await store.users(), beforeUsers);
      assert.deepEqual(await audit(), beforeAudit);
      // This fixture's transaction delegates to the existing adapter and wraps
      // only its owned connection; the actual UPDATE, audit and FK writes happen
      // before the synthetic fault. Never override a global adapter or real DB.
      const transaction = store.transaction;
      let reached = false;
      store.transaction = function (fn, readOnly = false) {
        return transaction.call(
          this,
          (connection) =>
            fn(
              new Proxy(connection, {
                get(target, property) {
                  const value = Reflect.get(target, property, target);
                  if (property === "query")
                    return async (text, params) => {
                      const result = await value.call(target, text, params);
                      if (text.startsWith("UPDATE kp_settings SET ")) {
                        reached = true;
                        const row = (
                          await value.call(
                            target,
                            "SELECT generation FROM kp_settings WHERE id=1",
                          )
                        ).rows[0];
                        assert.equal(row.generation, before.generation + 1);
                        throw Error("Synthetic post-generation bulk failure");
                      }
                      return result;
                    };
                  return typeof value === "function"
                    ? value.bind(target)
                    : value;
                },
              }),
            ),
          readOnly,
        );
      };
      try {
        await assert.rejects(
          () => store.mutate(actor, command),
          /Synthetic post-generation bulk failure/,
        );
      } finally {
        delete store.transaction;
      }
      assert(reached);
      assert.deepEqual(await store.read(), before);
      assert.deepEqual(await store.users(), beforeUsers);
      assert.deepEqual(await audit(), beforeAudit);
      const result = await store.mutate(actor, command),
        after = await store.read();
      assert.equal(after.generation, before.generation + 1);
      if (name === "reset") {
        assert.deepEqual(after.data.allocations, {});
        for (const key of Object.keys(before.data.allocations))
          assert.equal(
            after.data.revisions["allocation:" + key],
            before.data.revisions["allocation:" + key] + 1,
          );
        assert.deepEqual(
          after.data.actualAllocations,
          before.data.actualAllocations,
        );
        assert.deepEqual(after.data.personCalendar, before.data.personCalendar);
        assert.deepEqual(after.data.resources, before.data.resources);
        await assert.rejects(() => store.mutate(actor, command), {
          status: 409,
        });
      } else if (name === "import") {
        assert.deepEqual(result, { imported: 1, skipped: 0 });
        const imported = after.data.resources.find(
          (r) => r.name === "Synthetic Imported",
        );
        assert(imported);
        assert.equal(imported.versions[0].team, "unassigned");
        assert.equal(imported.versions[0].lead, "A");
        assert.equal(after.data.revisions["resource:" + imported.id], 1);
        assert.equal(
          after.data.teams.find((t) => t.id === "unassigned").lead,
          "A",
        );
        assert.equal(
          after.data.revisions["team:unassigned"],
          before.data.revisions["team:unassigned"] + 1,
        );
        assert.deepEqual(
          after.data.actualAllocations,
          before.data.actualAllocations,
        );
        assert.deepEqual(await store.mutate(actor, command), {
          imported: 0,
          skipped: 1,
        });
      } else {
        assert.deepEqual(after.data.resources, []);
        assert.deepEqual(after.data.workCalendar, backup.workCalendar);
        assert.equal(Object.hasOwn(after.data, "legacyArchive"), false);
        assert.equal(
          after.data.revisions["project:p"],
          before.data.revisions["project:p"] + 1,
        );
        assert.equal(
          after.data.revisions["resource:r"],
          before.data.revisions["resource:r"] + 1,
        );
        await assert.rejects(
          () =>
            store.mutate(actor, (d, u) =>
              applyChanges(d, u, [
                {
                  kind: "actual",
                  id: "r|p|2026-09",
                  value: 0.1,
                  revision: before.data.revisions["actual:r|p|2026-09"],
                },
              ]),
            ),
          { status: 409 },
        );
      }
      const expectedUsers = beforeUsers.map((u) =>
        name === "restore" && u.resourceId === "r"
          ? { ...u, resourceId: "" }
          : u,
      );
      assert.deepEqual(await store.users(), expectedUsers);
      const persisted = await store.read();
      await store.close();
      const reopened = new Store({ env });
      try {
        await reopened.connect();
        assert.deepEqual(await reopened.read(), persisted);
        assert.deepEqual(await reopened.users(), expectedUsers);
      } finally {
        await reopened.close();
      }
    });
});
