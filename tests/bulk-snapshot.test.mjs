import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { Store } from "../backend/store.mjs";
import { createApp } from "../backend/app.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { hashPassword } from "../backend/auth.mjs";

const password = "Bulk-snapshot-test-only-284!";
const hashed = hashPassword(password);
async function setup(t, { withTopic = true } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-bulk-http-"));
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "test.sqlite"),
  };
  const store = new Store({ env });
  await store.connect();
  await store.bootstrapUser({
    _id: "root-admin",
    username: "bulk.admin",
    name: "Synthetic Admin",
    role: "admin",
    leaders: [],
    active: true,
    password: await hashed,
    revision: 1,
    version: 1,
  });
  const actor = await store.findUser({ id: "root-admin" });
  const team = (await store.read()).data.teams.find((t) => t.lead);
  await store.bootstrapUser({
    _id: "target-user",
    username: "bulk.target",
    name: "Synthetic Target",
    role: "normal",
    leaders: [team.lead],
    active: true,
    password: await hashed,
    revision: 1,
    version: 1,
  });
  await store.mutate(actor, (d, u) =>
    applyChanges(d, u, [
      {
        kind: "project",
        id: "p",
        revision: 0,
        value: {
          id: "p",
          name: "Project",
          start: "2026-01",
          end: "2026-12",
          phases: { "2026-01": "Design" },
          milestones: withTopic
            ? [
                {
                  id: "m",
                  name: "Checkpoint",
                  start: "2026-02-01",
                  end: "2026-02-01",
                  displayKind: "milestone",
                  diamondStyle: "outline",
                  barColor: "green",
                  barNotes: [
                    {
                      text: "Approval",
                      includeInReport: true,
                      start: "2026-02-01",
                      end: "2026-02-01",
                    },
                  ],
                },
              ]
            : [],
        },
      },
      {
        kind: "allocation",
        id: team.id + "|p|2026-01",
        revision: 0,
        value: 0.5,
      },
    ]),
  );
  const server = http.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port,
    app = createApp(store, { origin });
  server.on("request", app);
  t.after(async () => {
    app.locals.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
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
  const login = await request("/auth/login", {
    username: actor.username,
    password,
  });
  assert.equal(login.status, 200);
  const auth = {
    cookie: login.response.headers.get("set-cookie").split(";")[0],
    csrf: login.json.csrf,
  };
  async function state() {
    return (await request("/data", undefined, auth)).json;
  }
  function row(name = "Imported Employee") {
    return {
      row: 2,
      date1904: false,
      problems: [],
      values: {
        name,
        lead: team.lead,
        team: team.name,
        status: "Aktif Çalışan",
        included: "Evet",
        amount: 1,
        start: "2026-01-01",
        end: "",
        note: "",
      },
    };
  }
  return { store, env, dir, actor, team, request, auth, state, row };
}
const operations = ["reset", "import", "leader", "restore", "user"];
async function input(kind, ctx) {
  const current = await ctx.state();
  if (kind === "reset")
    return {
      url: "/allocations/reset",
      body: {
        revisions: Object.fromEntries(
          Object.entries(current.data.revisions).filter(([k]) =>
            k.startsWith("allocation:"),
          ),
        ),
      },
    };
  if (kind === "import")
    return { url: "/resources/import", body: { rows: [ctx.row(), ctx.row()] } };
  if (kind === "leader")
    return {
      url: "/leaders/change",
      body: {
        action: "rename",
        name: ctx.team.lead,
        newName: "Renamed leadership",
        generation: current.generation,
      },
    };
  if (kind === "user")
    return {
      url: "/users",
      body: {
        id: "target-user",
        role: "manager",
        leaders: [ctx.team.lead],
        resourceId: "",
        revision: (await ctx.store.findUser({ id: "target-user" })).revision,
      },
    };
  const backup = (await ctx.request("/backup", undefined, ctx.auth)).json;
  backup.data.projects[0].name = "Restored Project";
  return {
    url: "/restore",
    body: { data: backup.data, generation: current.generation },
  };
}

test("bulk HTTP responses belong to their own commit even if another writer commits before the route responds", async (t) => {
  for (const kind of operations)
    await t.test(kind, async (t) => {
      const ctx = await setup(t),
        operation = await input(kind, ctx),
        before = await ctx.state();
      const mutate = ctx.store.mutate;
      let captured,
        interleaved = false;
      t.mock.method(ctx.store, "mutate", async function (...args) {
        const result = await mutate.apply(this, args);
        if (!interleaved) {
          interleaved = true;
          captured = await this.view(ctx.actor);
          await mutate.call(this, ctx.actor, (d, u) =>
            applyChanges(d, u, [
              {
                kind: "project",
                id: "p",
                revision: d.revisions["project:p"],
                value: {
                  ...d.projects.find((p) => p.id === "p"),
                  name: "Later writer",
                },
              },
            ]),
          );
        }
        return result;
      });
      const result = await ctx.request(operation.url, operation.body, ctx.auth);
      assert.equal(result.status, 200);
      assert.equal(captured.generation, before.generation + 1);
      assert.equal((await ctx.state()).generation, before.generation + 2);
      const { imported, skipped, ...view } = result.json;
      assert.deepEqual(view, captured);
      assert.notEqual(view.data.projects[0].name, "Later writer");
      if (kind === "import") {
        assert.equal(imported, 1);
        assert.equal(skipped, 1);
      }
    });
});

test("a bulk projection failure rolls back domain rows, revisions, generation and audit", async (t) => {
  for (const kind of operations)
    await t.test(kind, async (t) => {
      const ctx = await setup(t),
        operation = await input(kind, ctx),
        before = await ctx.store.read(),
        audit = (await ctx.store.auditLog(ctx.actor)).total,
        users = await ctx.store.users();
      const projection = t.mock.method(ctx.store, "projectView", async () => {
        throw Error("Synthetic projection failure");
      });
      const result = await ctx.request(operation.url, operation.body, ctx.auth);
      assert.equal(result.status, 500);
      projection.mock.restore();
      assert.deepEqual(await ctx.store.read(), before);
      assert.equal((await ctx.store.auditLog(ctx.actor)).total, audit);
      assert.deepEqual(await ctx.store.users(), users);
    });
});

test("reset accepts authenticated revision payloads above the normal 2 MB limit", async (t) => {
  const ctx = await setup(t),
    operation = await input("reset", ctx);
  for (let i = 0; i < 20000; i++)
    operation.body.revisions[
      "allocation:" +
        ctx.team.id +
        "|" +
        ("bulk_" + i).padEnd(110, "x") +
        "|2026-01"
    ] = 0;
  const bytes = Buffer.byteLength(JSON.stringify(operation.body));
  assert(bytes > 2 * 1024 * 1024 && bytes < 20 * 1024 * 1024);
  const result = await ctx.request(operation.url, operation.body, ctx.auth);
  assert.equal(result.status, 200, JSON.stringify(result.json));
  assert.deepEqual(result.json.data.allocations, {});
});

test("bulk responses reuse the mutation read for numeric reset/user edits and keep SQL-backed metadata reads", async (t) => {
  for (const kind of operations)
    await t.test(kind, async (t) => {
      const ctx = await setup(t, { withTopic: false }),
        operation = await input(kind, ctx),
        read = ctx.store.read;
      let calls = 0;
      t.mock.method(ctx.store, "read", async function (...args) {
        calls++;
        return read.apply(this, args);
      });
      const result = await ctx.request(operation.url, operation.body, ctx.auth);
      assert.equal(result.status, 200);
      assert.equal(calls, ["reset", "user"].includes(kind) ? 1 : 2);
      const { imported, skipped, ...view } = result.json;
      assert.deepEqual(view, await ctx.store.view(ctx.actor));
      if (kind === "import") {
        assert.equal(imported, 1);
        assert.equal(skipped, 1);
      }
      assert.deepEqual(view.data.projects[0].milestones, []);
    });
});

test("bulk validation/conflict failures do not partially apply earlier input or touch audit", async (t) => {
  const ctx = await setup(t),
    before = await ctx.store.read(),
    audit = (await ctx.store.auditLog(ctx.actor)).total;
  const badImport = await input("import", ctx);
  badImport.body.rows[1].values.name = "";
  const reset = await input("reset", ctx);
  reset.body.revisions[Object.keys(reset.body.revisions)[0]]--;
  const leader = await input("leader", ctx);
  leader.body.generation--;
  const restore = await input("restore", ctx);
  restore.body.generation--;
  const user = await input("user", ctx);
  user.body.revision--;
  for (const [operation, status] of [
    [badImport, 400],
    [reset, 409],
    [leader, 409],
    [restore, 409],
    [user, 409],
  ]) {
    const result = await ctx.request(operation.url, operation.body, ctx.auth);
    assert.equal(result.status, status);
    assert.deepEqual(await ctx.store.read(), before);
    assert.equal((await ctx.store.auditLog(ctx.actor)).total, audit);
  }
  for (const revisions of [
    null,
    [],
    { "project:p": 1 },
    { "allocation:t|p|2026-01": -1 },
    { "allocation:t|p|2026-01": 0.5 },
    { "allocation:t|p|2026-01": "1" },
  ]) {
    assert.equal(
      (await ctx.request("/allocations/reset", { revisions }, ctx.auth)).status,
      400,
    );
    assert.deepEqual(await ctx.store.read(), before);
  }
});

test("failed disk commit withholds every bulk success response and survives restart with accounts/audit unchanged", async (t) => {
  for (const kind of operations)
    await t.test(kind, async (t) => {
      const ctx = await setup(t),
        operation = await input(kind, ctx),
        before = await ctx.store.read(),
        users = await ctx.store.users(),
        audit = (await ctx.store.auditLog(ctx.actor)).total;
      const original = ctx.store.db.file,
        blocker = path.join(ctx.dir, "blocker");
      await fs.mkdir(blocker);
      ctx.store.db.file = blocker;
      try {
        assert.equal(
          (await ctx.request(operation.url, operation.body, ctx.auth)).status,
          500,
        );
      } finally {
        ctx.store.db.file = original;
      }
      assert.deepEqual(await ctx.store.read(), before);
      assert.deepEqual(await ctx.store.users(), users);
      assert.equal((await ctx.store.auditLog(ctx.actor)).total, audit);
      await ctx.store.close();
      const reopened = new Store({ env: ctx.env });
      try {
        await reopened.connect();
        assert.deepEqual(await reopened.read(), before);
        assert.deepEqual(await reopened.users(), users);
        assert.equal((await reopened.auditLog(ctx.actor)).total, audit);
      } finally {
        await reopened.close();
      }
    });
});

test("normal/manager bulk requests are rejected before full model reads; authentication and CSRF precede large parsing", async (t) => {
  const ctx = await setup(t),
    before = await ctx.store.read(),
    inputs = await Promise.all(operations.map((kind) => input(kind, ctx)));
  for (const role of ["normal", "manager"]) {
    await ctx.store.bootstrapUser({
      _id: "denied-" + role,
      username: "bulk." + role,
      name: "Synthetic " + role,
      role,
      leaders: [ctx.team.lead],
      active: true,
      password: await hashed,
      revision: 1,
      version: 1,
    });
    const login = await ctx.request("/auth/login", {
      username: "bulk." + role,
      password,
    });
    assert.equal(login.status, 200);
    const auth = {
      cookie: login.response.headers.get("set-cookie").split(";")[0],
      csrf: login.json.csrf,
    };
    const read = t.mock.method(ctx.store, "read", async () => {
      throw Error("Must reject before a full model read");
    });
    for (const operation of inputs)
      assert.equal(
        (await ctx.request(operation.url, operation.body, auth)).status,
        403,
      );
    read.mock.restore();
  }
  const large = { padding: "x".repeat(2 * 1024 * 1024 + 1), revisions: {} };
  assert.equal((await ctx.request("/allocations/reset", large)).status, 401);
  assert.equal(
    (
      await ctx.request("/allocations/reset", large, {
        ...ctx.auth,
        csrf: "wrong",
      })
    ).status,
    403,
  );
  assert.deepEqual(await ctx.store.read(), before);
});

test("reset keeps the 20 MB bulk bound while user edits retain the normal 2 MB bound", async (t) => {
  const ctx = await setup(t),
    before = await ctx.store.read();
  assert.equal(
    (
      await ctx.request(
        "/allocations/reset",
        { revisions: {}, padding: "x".repeat(20 * 1024 * 1024 + 1) },
        ctx.auth,
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await ctx.request(
        "/users",
        { padding: "x".repeat(2 * 1024 * 1024 + 1) },
        ctx.auth,
      )
    ).status,
    413,
  );
  assert.deepEqual(await ctx.store.read(), before);
});

test("editing your own permissions commits, revokes the old session and returns no privileged snapshot", async (t) => {
  const ctx = await setup(t);
  const old = await ctx.store.findUser({ id: "target-user" });
  await ctx.store.transaction((c) =>
    ctx.store.saveUser({ ...old, role: "admin", leaders: [] }, c),
  );
  const login = await ctx.request("/auth/login", {
    username: old.username,
    password,
  });
  assert.equal(login.status, 200);
  const auth = {
      cookie: login.response.headers.get("set-cookie").split(";")[0],
      csrf: login.json.csrf,
    },
    before = await ctx.store.read();
  const result = await ctx.request(
    "/users",
    {
      id: old._id,
      role: "manager",
      leaders: [ctx.team.lead],
      resourceId: "",
      revision: old.revision,
    },
    auth,
  );
  assert.equal(result.status, 401);
  assert.equal(result.json.data, undefined);
  const after = await ctx.store.findUser({ id: old._id });
  assert.equal(after.role, "manager");
  assert.equal(after.version, old.version + 1);
  assert.equal(after.revision, old.revision + 1);
  assert.equal((await ctx.store.read()).generation, before.generation + 1);
  assert.equal((await ctx.request("/auth/me", undefined, auth)).status, 401);
  const relogin = await ctx.request("/auth/login", {
    username: old.username,
    password,
  });
  assert.equal(relogin.status, 200);
  assert.equal(relogin.json.user.role, "manager");
});

test("Milestone metadata keeps the conservative reread and its appearance survives reset", async (t) => {
  const ctx = await setup(t),
    operation = await input("reset", ctx),
    read = ctx.store.read;
  let calls = 0;
  t.mock.method(ctx.store, "read", async function (...args) {
    calls++;
    return read.apply(this, args);
  });
  const result = await ctx.request(operation.url, operation.body, ctx.auth);
  assert.equal(result.status, 200);
  assert.equal(calls, 2);
  assert.equal(
    result.json.data.projects[0].milestones[0].diamondStyle,
    "outline",
  );
  assert.deepEqual(result.json, await ctx.store.view(ctx.actor));
});

test("large authenticated import keeps duplicate counters and large restore preserves unbounded detail text", async (t) => {
  const ctx = await setup(t);
  const rows = Array.from({ length: 250 }, (_, i) => ({
    ...ctx.row("Large Import Employee"),
    row: i + 2,
    values: {
      ...ctx.row().values,
      name: "Large Import Employee",
      note: "N".repeat(10000),
    },
  }));
  const importBody = { rows };
  assert(Buffer.byteLength(JSON.stringify(importBody)) > 2 * 1024 * 1024);
  const imported = await ctx.request("/resources/import", importBody, ctx.auth);
  assert.equal(imported.status, 200);
  assert.equal(imported.json.imported, 1);
  assert.equal(imported.json.skipped, 249);
  const backup = (await ctx.request("/backup", undefined, ctx.auth)).json;
  assert.equal(backup.data.users, undefined);
  assert(
    !Object.keys(backup.data.revisions).some((k) => k.startsWith("user:")),
  );
  const text = "Synthetic detail ".repeat(140000);
  backup.data.projects[0].milestones[0].barNotes[0].text = text;
  const body = { data: backup.data, generation: imported.json.generation };
  assert(Buffer.byteLength(JSON.stringify(body)) > 2 * 1024 * 1024);
  const restored = await ctx.request("/restore", body, ctx.auth);
  assert.equal(restored.status, 200);
  assert.equal(
    restored.json.data.projects[0].milestones[0].barNotes[0].text,
    text.trim(),
  );
  assert.equal(
    restored.json.data.projects[0].milestones[0].diamondStyle,
    "outline",
  );
  assert.equal(
    (await ctx.store.findUser({ id: "target-user" })).role,
    "normal",
  );
});
