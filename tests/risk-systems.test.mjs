import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { Store } from "../backend/store.mjs";
import { createApp } from "../backend/app.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { initialRiskSystems } from "../shared/risk-system-seed.ts";
import {
  schemaVersion,
  requiredVersions,
} from "../backend/migration-catalog.mjs";
import { prepareSchema } from "../backend/schema-migrations.mjs";

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-risk-systems-"));
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
  };
  const store = new Store({ env });
  await store.connect();
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const app = createApp(store, { origin });
  server.on("request", app);
  t.after(async () => {
    app.locals.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const password = "Synthetic-catalog-only-392!";
  const hash = await hashPassword(password);
  async function request(route, auth, body) {
    const response = await fetch(origin + "/api" + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: auth?.cookie || "",
        ...(body === undefined
          ? {}
          : {
              Origin: origin,
              "Content-Type": "application/json",
              "X-Requested-With": "KaynakPortal",
              "X-CSRF-Token": auth?.csrf || "",
            }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), response };
  }
  async function user(id, role) {
    await store.bootstrapUser({
      _id: id,
      username: "synthetic." + id,
      name: id,
      role,
      leaders: [],
      active: true,
      password: hash,
      version: 1,
      revision: 1,
    });
    const result = await request("/auth/login", undefined, {
      username: "synthetic." + id,
      password,
    });
    assert.equal(result.status, 200);
    return {
      cookie: result.response.headers.get("set-cookie").split(";")[0],
      csrf: result.body.csrf,
    };
  }
  const admin = await user("root-admin", "admin"),
    manager = await user("manager", "manager"),
    normal = await user("employee", "normal");
  const state = async () => (await request("/data", admin)).body;
  async function write(kind, id, value, auth = admin, options = {}) {
    const current = await state();
    const revision = current.data.revisions[kind + ":" + id] || 0;
    return request("/changes", auth, {
      changes: [{ kind, id, value, revision, ...options }],
    });
  }
  const project = {
    id: "synthetic-project",
    name: "Synthetic Project",
    start: "2026-01",
    end: "2027-12",
    phases: {},
  };
  assert.equal((await write("project", project.id, project)).status, 200);
  const risk = (id, systemId) => ({
    id,
    projectId: project.id,
    reportedBy: "Synthetic team",
    category: "Teknik",
    reportedAt: "2026-10-05",
    system: systemId ? "Untrusted cached label" : "Legacy custom label",
    ...(systemId ? { systemId } : {}),
    description: "Synthetic test risk",
    cause: "",
    actionPlan: "",
    targetAt: "",
    status: "Açık",
    owner: "",
    likelihood: 2,
    impact: 3,
    strategy: "",
    implementedAt: "",
    actionResult: "",
    residualLikelihood: null,
    residualImpact: null,
    createdBy: "forged",
    createdByName: "forged",
    createdAt: "forged",
    updatedAt: "forged",
  });
  return { env, store, request, admin, manager, normal, state, write, risk };
}

test("75 initial Epic names are seeded once and visible to every role", async (t) => {
  const f = await fixture(t);
  assert.equal(initialRiskSystems.length, 75);
  for (const user of [f.admin, f.manager, f.normal]) {
    const result = await f.request("/data", user);
    assert.equal(result.status, 200);
    assert.deepEqual(
      result.body.data.riskSystems
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id)),
      initialRiskSystems.slice().sort((a, b) => a.id.localeCompare(b.id)),
    );
  }
  await f.store.close();
  await f.store.connect();
  assert.equal((await f.state()).data.riskSystems.length, 75);
});

test("only admin manages the catalog; CSRF, duplicate names and invalid fields leave state unchanged", async (t) => {
  const f = await fixture(t);
  const before = await f.state();
  const value = { id: "manual-system", name: "Manual system" };
  for (const user of [f.manager, f.normal])
    assert.equal(
      (await f.write("riskSystem", value.id, value, user)).status,
      403,
    );
  assert.equal(
    (await f.write("riskSystem", value.id, value, { ...f.admin, csrf: "" }))
      .status,
    403,
  );
  for (const name of [
    "",
    " ",
    "x".repeat(201),
    initialRiskSystems[0].name.toLocaleLowerCase("tr"),
  ])
    assert.equal(
      (await f.write("riskSystem", value.id, { ...value, name })).status,
      400,
    );
  assert.equal(
    (await f.write("riskSystem", value.id, { ...value, id: "another-id" }))
      .status,
    400,
  );
  assert.deepEqual(await f.state(), before);
});

test("manual catalog records persist, retain revisions and reject stale edits or resurrection", async (t) => {
  const f = await fixture(t);
  const value = { id: "manual-system", name: "Manual system" };
  assert.equal((await f.write("riskSystem", value.id, value)).status, 200);
  const opened = (await f.state()).data.revisions["riskSystem:" + value.id];
  assert.equal(opened, 1);
  assert.equal(
    (
      await f.write("riskSystem", value.id, {
        ...value,
        name: "Updated manual system",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.write("riskSystem", value.id, value, f.admin, {
        revision: opened,
      })
    ).status,
    409,
  );
  await f.store.close();
  await f.store.connect();
  assert.equal(
    (await f.state()).data.riskSystems.find((x) => x.id === value.id).name,
    "Updated manual system",
  );
  assert.equal(
    (
      await f.write("riskSystem", value.id, null, f.admin, {
        operation: "delete",
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.write("riskSystem", value.id, value, f.admin, { revision: 0 }))
      .status,
    409,
  );
  await f.store.close();
  await f.store.connect();
  assert.equal(
    (await f.state()).data.riskSystems.some((x) => x.id === value.id),
    false,
  );
});

test("selecting stable system IDs normalizes names; rename cascades, audits and protects risk drafts", async (t) => {
  const f = await fixture(t);
  const system = initialRiskSystems[0];
  assert.equal(
    (
      await f.write(
        "risk",
        "linked-risk",
        f.risk("linked-risk", system.id),
        f.normal,
      )
    ).status,
    200,
  );
  const opened = (await f.state()).data;
  assert.equal(opened.risks[0].system, system.name);
  assert.equal(
    (
      await f.write("riskSystem", system.id, {
        ...system,
        name: "Renamed system",
      })
    ).status,
    200,
  );
  const current = (await f.state()).data;
  assert.equal(current.risks[0].system, "Renamed system");
  assert.equal(current.risks[0].systemId, system.id);
  assert.equal(
    current.revisions["risk:linked-risk"],
    opened.revisions["risk:linked-risk"] + 1,
  );
  assert.equal(
    (
      await f.write("risk", "linked-risk", opened.risks[0], f.normal, {
        revision: opened.revisions["risk:linked-risk"],
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.write("riskSystem", system.id, null, f.admin, {
        operation: "delete",
      })
    ).status,
    409,
  );
  const audit = await f.request("/audit", f.admin);
  assert(
    audit.body.entries.some(
      (entry) => entry.kind === "riskSystem" && entry.action === "update",
    ),
  );
  assert(
    audit.body.entries.some(
      (entry) => entry.kind === "risk" && entry.action === "update",
    ),
  );
  assert.deepEqual((await f.state()).data, current);
});

test("legacy free text is preserved; new drafts follow renames and reject deleted selections", async (t) => {
  const f = await fixture(t);
  const system = initialRiskSystems[0];
  assert.equal(
    (await f.write("risk", "legacy-risk", f.risk("legacy-risk"), f.normal))
      .status,
    200,
  );
  assert.equal(
    (await f.state()).data.risks.find((x) => x.id === "legacy-risk").system,
    "Legacy custom label",
  );
  const draft = f.risk("new-draft", system.id);
  assert.equal(
    (
      await f.write("riskSystem", system.id, {
        ...system,
        name: "Current system name",
      })
    ).status,
    200,
  );
  assert.equal((await f.write("risk", draft.id, draft, f.normal)).status, 200);
  assert.equal(
    (await f.state()).data.risks.find((x) => x.id === draft.id).system,
    "Current system name",
  );
  const unused = initialRiskSystems[1];
  assert.equal(
    (
      await f.write("riskSystem", unused.id, null, f.admin, {
        operation: "delete",
      })
    ).status,
    200,
  );
  const before = await f.state();
  assert.equal(
    (
      await f.write(
        "risk",
        "deleted-selection",
        f.risk("deleted-selection", unused.id),
        f.normal,
      )
    ).status,
    400,
  );
  assert.deepEqual(await f.state(), before);
});

test("mixed risk/catalog batches retain authorization, command ordering, metadata and atomic rollback", async (t) => {
  const f = await fixture(t);
  const system = initialRiskSystems[0];
  const draft = f.risk("mixed-batch-risk", system.id);
  assert.equal((await f.write("risk", draft.id, draft, f.normal)).status, 200);
  const opened = await f.state();
  const existing = opened.data.risks.find((item) => item.id === draft.id);
  const riskRevision = opened.data.revisions["risk:" + draft.id];
  const systemRevision = opened.data.revisions["riskSystem:" + system.id] || 0;
  const riskEdit = {
    kind: "risk",
    id: draft.id,
    revision: riskRevision,
    value: {
      ...existing,
      description: "Mixed batch update",
      createdBy: "forged",
      createdByName: "forged",
      createdAt: "forged",
    },
  };
  const rename = {
    kind: "riskSystem",
    id: system.id,
    revision: systemRevision,
    value: { ...system, name: "Mixed batch renamed system" },
  };
  const beforeAudit = (await f.request("/audit", f.admin)).body;

  // Catalog rename increments the linked risk revision before the next command.
  assert.equal(
    (await f.request("/changes", f.admin, { changes: [rename, riskEdit] }))
      .status,
    409,
  );
  assert.deepEqual(await f.state(), opened);
  assert.deepEqual((await f.request("/audit", f.admin)).body, beforeAudit);

  // Even an allowed first command must roll back when a later one is forbidden.
  assert.equal(
    (await f.request("/changes", f.normal, { changes: [riskEdit, rename] }))
      .status,
    403,
  );
  assert.deepEqual(await f.state(), opened);
  assert.deepEqual((await f.request("/audit", f.admin)).body, beforeAudit);

  // Editing the current risk before the catalog rename is a valid ordered batch.
  assert.equal(
    (await f.request("/changes", f.admin, { changes: [riskEdit, rename] }))
      .status,
    200,
  );
  const saved = await f.state();
  const updated = saved.data.risks.find((item) => item.id === draft.id);
  assert.equal(updated.description, riskEdit.value.description);
  assert.equal(updated.system, rename.value.name);
  assert.equal(updated.systemId, system.id);
  for (const field of ["createdBy", "createdByName", "createdAt"])
    assert.equal(updated[field], existing[field]);
  assert.equal(saved.data.revisions["risk:" + draft.id], riskRevision + 2);
  assert.equal(
    saved.data.revisions["riskSystem:" + system.id],
    systemRevision + 1,
  );
  assert.equal(saved.generation, opened.generation + 1);
  await f.store.close();
  await f.store.connect();
  assert.deepEqual(await f.state(), saved);
});

test("legacy names matching a catalog entry are protected and adopted on rename", async (t) => {
  const f = await fixture(t);
  const system = initialRiskSystems[0];
  const legacy = {
    ...f.risk("legacy-catalog-risk"),
    system: system.name.toLocaleLowerCase("tr"),
  };
  assert.equal(
    (await f.write("risk", legacy.id, legacy, f.normal)).status,
    200,
  );
  assert.equal(
    (
      await f.write("riskSystem", system.id, null, f.admin, {
        operation: "delete",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.write("riskSystem", system.id, {
        ...system,
        name: "Adopted legacy system",
      })
    ).status,
    200,
  );
  const saved = (await f.state()).data.risks.find(
    (item) => item.id === legacy.id,
  );
  assert.equal(saved.systemId, system.id);
  assert.equal(saved.system, "Adopted legacy system");
});

test("JSON backup and restore retain the catalog including an intentional empty list", async (t) => {
  const f = await fixture(t);
  const backup = await f.request("/backup", f.admin);
  assert.equal(backup.body.data.riskSystems.length, 75);
  const current = await f.state();
  const result = await f.request("/restore", f.admin, {
    generation: current.generation,
    data: { ...backup.body.data, riskSystems: [] },
  });
  assert.equal(result.status, 200);
  await f.store.close();
  await f.store.connect();
  assert.deepEqual((await f.state()).data.riskSystems, []);
});

test("schema 30 upgrade adds only the catalog, runs once and rejects production auto migration", async (t) => {
  const f = await fixture(t);
  await f.store.transaction(async (c) => {
    await c.query("DROP TABLE kp_risk_systems");
    await c.query("DELETE FROM kp_schema_migrations WHERE version=31");
  });
  const before = (await f.store.db.query("SELECT id,name FROM kp_projects"))
    .rows;
  await f.store.close();
  await f.store.connect();
  assert.deepEqual(
    (await f.store.db.query("SELECT id,name FROM kp_projects")).rows,
    before,
  );
  assert.equal((await f.state()).data.riskSystems.length, 75);
  assert.equal(
    (
      await f.store.db.query(
        "SELECT version FROM kp_schema_migrations WHERE version=@p0",
        [schemaVersion],
      )
    ).rows.length,
    1,
  );
  const commands = [];
  const connection = {
    async query(sql) {
      commands.push(sql);
      if (sql.includes("OBJECT_ID")) return { rows: [{ id: 1 }] };
      if (sql === "SELECT version FROM kp_schema_migrations")
        return {
          rows: requiredVersions
            .filter((version) => version < 31)
            .map((version) => ({ version })),
        };
      throw Error("Unexpected query");
    },
    async batch() {
      throw Error("Unexpected migration write");
    },
  };
  await assert.rejects(
    prepareSchema(connection, { provider: "mssql", auto: false }),
    /Sistem \/ alt sistem kataloğu/,
  );
  assert(commands.every((sql) => sql.startsWith("SELECT ")));
});

test("failed catalog seeding rolls back schema and bytes in a synthetic database", async (t) => {
  const f = await fixture(t);
  await f.store.transaction(async (c) => {
    await c.query("DROP TABLE kp_risk_systems");
    await c.query("DELETE FROM kp_schema_migrations WHERE version=31");
  });
  await f.store.close();
  const before = await fs.readFile(f.env.SQLJS_FILE);
  const broken = new Store({ env: f.env });
  const transact = broken.db.transaction.bind(broken.db);
  broken.db.transaction = (fn, readOnly) =>
    transact(
      (c) =>
        fn(
          new Proxy(c, {
            get(target, property) {
              if (property === "upsert")
                return async (name, rows) => {
                  if (name === "risk_systems")
                    throw Error("Synthetic seed failure");
                  return target.upsert(name, rows);
                };
              const value = Reflect.get(target, property);
              return typeof value === "function" ? value.bind(target) : value;
            },
          }),
        ),
      readOnly,
    );
  await assert.rejects(broken.connect(), /Synthetic seed failure/);
  await broken.close();
  assert.deepEqual(await fs.readFile(f.env.SQLJS_FILE), before);
});
