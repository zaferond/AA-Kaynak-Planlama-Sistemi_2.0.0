import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Store } from "../backend/store.mjs";
import { SqlJsAdapter } from "../backend/adapters/sqljs.mjs";
import { createApp } from "../backend/app.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { migrationSql, schemaVersion } from "../backend/migration-catalog.mjs";
import { verifyBundle } from "../scripts/maintenance-files.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const runFile = promisify(execFile);
// No inherited database settings, NODE_OPTIONS, credentials or .env loading.
const childEnv = Object.fromEntries(
  ["PATH", "Path", "SystemRoot", "WINDIR", "TMPDIR", "TMP", "TEMP", "LANG"]
    .filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]]),
);

async function fixture(t) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "aa-recovery-acceptance-"),
  );
  const stores = [],
    apis = [];
  t.after(async () => {
    try {
      for (const api of apis) await api.stop();
      for (const store of stores) await store.close();
    } finally {
      await fs.rm(dir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  });
  return {
    dir,
    store(file, adapter) {
      const store = new Store({
        env: { NODE_ENV: "test", DB_PROVIDER: "sqljs", SQLJS_FILE: file },
        ...(adapter ? { adapter } : {}),
      });
      stores.push(store);
      return store;
    },
    async serve(store) {
      const server = http.createServer();
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const origin = "http://127.0.0.1:" + server.address().port;
      const app = createApp(store, { origin });
      server.on("request", app);
      const api = {
        async stop() {
          app.locals.close();
          server.closeAllConnections();
          if (server.listening)
            await new Promise((resolve) => server.close(resolve));
        },
        async request(url, auth = {}, body, expected = 200) {
          const response = await fetch(origin + "/api" + url, {
            method: body === undefined ? "GET" : "POST",
            headers: {
              ...(auth.cookie ? { Cookie: auth.cookie } : {}),
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
            signal: AbortSignal.timeout(10000),
          });
          const json = await response.json();
          assert.equal(response.status, expected, json.error || url);
          return { json, response };
        },
        async login(username, password) {
          const { json, response } = await api.request(
            "/auth/login",
            {},
            {
              username,
              password,
              remember: true,
            },
          );
          return {
            cookie: response.headers.get("set-cookie").split(";")[0],
            csrf: json.csrf,
            user: json.user,
          };
        },
        async view(auth) {
          return (await api.request("/data", auth)).json;
        },
        async change(auth, changes, expected = 200) {
          return (await api.request("/changes", auth, { changes }, expected))
            .json;
        },
      };
      apis.push(api);
      return api;
    },
    async cli(...args) {
      const { stdout, stderr } = await runFile(
        process.execPath,
        [path.join(root, "scripts/data-maintenance.mjs"), ...args],
        { cwd: dir, env: childEnv, timeout: 30000 },
      );
      assert.equal(stderr, "");
      return JSON.parse(stdout);
    },
  };
}

test("full backup CLI recovery preserves HTTP data and permissions, revokes old sessions and survives restart", async (t) => {
  const f = await fixture(t);
  const source = path.join(f.dir, "source.sqlite");
  const store = f.store(source);
  await store.connect();
  const password = "Synthetic-recovery-only-481!";
  const credential = await hashPassword(password);
  const accounts = [
    {
      _id: "root-admin",
      username: "recovery.admin",
      name: "Sentetik Yönetici",
      role: "admin",
      leaders: [],
    },
  ];
  await store.bootstrapUser({
    ...accounts[0],
    active: true,
    password: credential,
    revision: 1,
    version: 1,
  });
  const original = await f.serve(store);
  const oldAuth = [await original.login(accounts[0].username, password)];
  const initial = await original.view(oldAuth[0]);
  const team = initial.data.teams.find((item) => item.lead);
  const otherTeam = initial.data.teams.find(
    (item) => item.lead && item.lead !== team.lead,
  );
  const project = {
    id: "recovery-project",
    name: "Sentetik Kurtarma Projesi",
    responsibleName: "Sentetik Sorumlu",
    sortOrder: 2,
    start: "2026-01",
    end: "2026-12",
    phases: { "2026-09": "Tasarım\nTürkçe 📅" },
    phaseColors: { "2026-09": "blue" },
    milestones: [
      {
        id: "recovery-note",
        name: "Kritik Başlık",
        start: "2026-09-07",
        end: "2026-09-11",
        barStyle: "outline",
        barColor: "green",
        barText: "Not",
        barNotes: [
          {
            text: "Çok satırlı detay\nİkinci satır 📅",
            includeInReport: true,
            completed: true,
            start: "2026-09-07",
            end: "2026-09-11",
          },
        ],
        additionalRanges: [
          {
            start: "2026-09-14",
            end: "2026-09-14",
            displayKind: "milestone",
            diamondStyle: "outline",
            description: "Sentetik kilometre taşı",
            color: "purple",
          },
        ],
      },
    ],
  };
  const resource = (id, assignment) => ({
    id,
    name: "Sentetik " + id,
    note: "Sentetik özel not",
    versions: [
      {
        effective: "2026-01",
        team: assignment.id,
        lead: assignment.lead,
        status: "Aktif Çalışan",
        included: true,
        amount: 1,
        start: "2026-01-01",
        end: "",
      },
    ],
  });
  await original.change(oldAuth[0], [
    { kind: "project", id: project.id, value: project, revision: 0 },
    {
      kind: "resource",
      id: "own",
      value: resource("own", team),
      revision: 0,
    },
    {
      kind: "resource",
      id: "other",
      value: resource("other", otherTeam),
      revision: 0,
    },
    {
      kind: "calendar",
      id: "shared",
      value: {
        "2026-09-01": {
          type: "company",
          label: "Sentetik çalışma dışı gün",
          fraction: 0.5,
        },
      },
      revision: 0,
    },
    ...[team, otherTeam].map((item) => ({
      kind: "allocation",
      id: item.id + "|" + project.id + "|2026-09",
      value: 0.5,
      revision: 0,
    })),
    ...["own", "other"].map((id) => ({
      kind: "actual",
      id: id + "|" + project.id + "|2026-09",
      value: { unit: "hours", value: 36 },
      revision: 0,
    })),
  ]);
  accounts.push(
    {
      _id: "recovery-manager",
      username: "recovery.manager",
      name: "Sentetik Lider",
      role: "manager",
      leaders: [team.lead],
    },
    {
      _id: "recovery-person",
      username: "recovery.person",
      name: "Sentetik Çalışan",
      role: "normal",
      leaders: [team.lead],
      resourceId: "own",
    },
  );
  for (const account of accounts.slice(1)) {
    await store.bootstrapUser({
      ...account,
      active: true,
      password: credential,
      revision: 2,
      version: 3,
    });
    oldAuth.push(await original.login(account.username, password));
  }
  const personalKey = "own|2026-09-07|training";
  await original.change(oldAuth[2], [
    {
      kind: "personDay",
      id: personalKey,
      value: { type: "training", hours: 2, label: "Sentetik eğitim" },
      revision: 0,
    },
    {
      kind: "risk",
      id: "recovery-risk",
      revision: 0,
      value: {
        id: "recovery-risk",
        projectId: project.id,
        reportedBy: "Sentetik ekip",
        category: "Teknik",
        reportedAt: "2026-09-07",
        system: "Sentetik alt sistem",
        description: "Tedarik gecikmesi\nİkinci satır",
        cause: "Sentetik sebep",
        actionPlan: "Sentetik aksiyon",
        targetAt: "2026-10-01",
        status: "Açık",
        owner: "Sentetik Çalışan",
        likelihood: 3,
        impact: 4,
        strategy: "Kontrol",
        implementedAt: "",
        actionResult: "",
        residualLikelihood: null,
        residualImpact: null,
      },
    },
  ]);
  const views = [];
  for (const auth of oldAuth) views.push(await original.view(auth));
  const history = (await original.request("/audit", oldAuth[0])).json;
  const sourceAtBackup = await fs.readFile(source);
  const backup = await f.cli(
    "backup",
    "--source",
    source,
    "--output",
    path.join(f.dir, "backups"),
  );
  assert.equal(backup.sourceChanged, false);
  assert.deepEqual(await fs.readFile(source), sourceAtBackup);
  assert.equal(
    (await f.cli("verify", "--backup", backup.directory)).verified,
    true,
  );
  const projectRevision = views[0].data.revisions["project:" + project.id];
  await original.change(oldAuth[0], [
    {
      kind: "project",
      id: project.id,
      revision: projectRevision,
      value: { ...project, name: "Yedekten sonra değiştirildi" },
    },
  ]);
  const sourceAfterBackup = await fs.readFile(source);
  assert.notDeepEqual(sourceAfterBackup, sourceAtBackup);
  const recovery = await f.cli(
    "prepare-recovery",
    "--backup",
    backup.directory,
    "--output",
    path.join(f.dir, "prepared"),
  );
  assert.equal(recovery.liveDatabaseReplaced, false);
  assert.equal(recovery.sessionsRemoved, 3);
  const verified = await verifyBundle(recovery.directory);
  assert.equal(verified.manifest.tableCounts.kp_sessions, 0);
  assert.equal(
    recovery.baseSourceSha256,
    (await verifyBundle(backup.directory)).manifest.sourceSha256,
  );
  // Run the recovered app on a separate deployment copy, never inside the package.
  const recoveredFile = path.join(f.dir, "recovered-app", "database.sqlite");
  await fs.mkdir(path.dirname(recoveredFile));
  await fs.writeFile(recoveredFile, verified.contents["database.sqlite"], {
    mode: 0o600,
  });
  const recovered = f.store(recoveredFile);
  await recovered.connect();
  const restored = await f.serve(recovered);
  for (const auth of oldAuth)
    await restored.request("/auth/me", auth, undefined, 401);
  const fresh = [];
  for (const [index, account] of accounts.entries()) {
    const auth = await restored.login(account.username, password);
    fresh.push(auth);
    assert.deepEqual(auth.user, oldAuth[index].user);
    assert.deepEqual(await restored.view(auth), views[index]);
  }
  assert.deepEqual((await restored.request("/audit", fresh[0])).json, history);
  const ownView = await restored.view(fresh[2]);
  assert.equal(
    ownView.data.resources.find((item) => item.id === "own").note,
    "",
  );
  assert.equal(
    ownView.data.actualAllocations["other|" + project.id + "|2026-09"],
    undefined,
  );
  assert.equal(ownView.data.users, undefined);
  for (const auth of fresh.slice(1)) {
    await restored.request("/backup", auth, undefined, 403);
    await restored.request("/audit", auth, undefined, 403);
    await restored.request("/users", auth, {}, 403);
  }
  const allocationChange = (assignment) => {
    const id = assignment.id + "|" + project.id + "|2026-09";
    return {
      kind: "allocation",
      id,
      revision: views[0].data.revisions["allocation:" + id],
      value: 0.75,
    };
  };
  await restored.change(fresh[1], [allocationChange(otherTeam)], 403);
  await restored.change(fresh[1], [allocationChange(team)]);
  await restored.change(
    fresh[2],
    [
      {
        kind: "personDay",
        id: "other|2026-09-07|training",
        revision: 0,
        value: { type: "training", hours: 2, label: "Sentetik eğitim" },
      },
    ],
    403,
  );
  const ownRisk = ownView.data.risks.find(
    (item) => item.id === "recovery-risk",
  );
  await restored.change(fresh[2], [
    {
      kind: "risk",
      id: ownRisk.id,
      revision: ownView.data.revisions["risk:" + ownRisk.id],
      value: { ...ownRisk, actionPlan: "Kurtarma sonrası aksiyon" },
    },
  ]);
  const updatedProject = {
    ...views[0].data.projects[0],
    name: "Kurtarma sonrası güncelleme",
  };
  const updateProject = {
    kind: "project",
    id: project.id,
    value: updatedProject,
    revision: projectRevision,
  };
  await restored.change(fresh[2], [updateProject], 403);
  await restored.change(fresh[0], [updateProject], 200);
  await restored.change(fresh[0], [updateProject], 409);
  await restored.change(fresh[2], [
    {
      kind: "personDay",
      id: personalKey,
      revision: ownView.data.revisions["personDay:" + personalKey],
      value: { type: "training", hours: 3, label: "Kurtarma sonrası eğitim" },
    },
  ]);
  const committed = await restored.view(fresh[0]);
  const committedHistory = (await restored.request("/audit", fresh[0])).json;
  await restored.stop();
  await recovered.close();
  await recovered.connect();
  const restarted = await f.serve(recovered);
  assert.deepEqual(await restarted.view(fresh[0]), committed);
  assert.deepEqual(
    (await restarted.request("/audit", fresh[0])).json,
    committedHistory,
  );
  assert.deepEqual(await fs.readFile(source), sourceAfterBackup);
  assert.deepEqual(
    await fs.readFile(path.join(backup.directory, "database.sqlite")),
    sourceAtBackup,
  );
  assert.deepEqual(
    (await verifyBundle(recovery.directory)).contents["database.sqlite"],
    verified.contents["database.sqlite"],
  );
});

test("a failure after migration DDL and data conversion preserves legacy bytes, releases the lock and allows one safe retry", async (t) => {
  const f = await fixture(t);
  const file = path.join(f.dir, "legacy.sqlite");
  const adapter = new SqlJsAdapter(file);
  const store = f.store(file, adapter);
  await adapter.open();
  await adapter.transaction(async (c) => {
    await c.batch(await migrationSql("sqljs", 1));
    await c.batch(await migrationSql("sqljs", 2));
    await c.batch(`
      INSERT INTO kp_settings VALUES(1,4,NULL);
      INSERT INTO kp_teams VALUES('t','Sentetik Takım',NULL,0,1);
      INSERT INTO kp_projects VALUES('p','Sentetik Proje','2026-01','2026-12');
      INSERT INTO kp_resources VALUES('a','Sentetik A','',NULL);
      INSERT INTO kp_resources VALUES('b','Sentetik B','',NULL);
      INSERT INTO kp_resource_versions VALUES('a','2026-01','t',NULL,'Aktif Çalışan',1,NULL,NULL,1);
      INSERT INTO kp_resource_versions VALUES('b','2026-01','t',NULL,'Gear Up',1,NULL,NULL,1);
      INSERT INTO kp_person_allocations VALUES('a','p','2026-09',0.5);
      INSERT INTO kp_person_allocations VALUES('b','p','2026-09',0.25);
    `);
  });
  await adapter.close();
  const legacy = await fs.readFile(file);
  const finalMigration = await migrationSql("sqljs", schemaVersion);
  const transaction = adapter.transaction.bind(adapter);
  let interrupted = false;
  // Inject only in this adapter instance, after the real final DDL has executed.
  adapter.transaction = (fn, readOnly) =>
    transaction(async (c) => {
      const batch = c.batch;
      c.batch = async (sql) => {
        const result = await batch(sql);
        if (sql.trim() === finalMigration.trim()) {
          interrupted = true;
          assert.equal(
            (await c.query("SELECT amount FROM kp_allocations")).rows[0].amount,
            0.75,
          );
          assert.equal(
            (await c.query("SELECT COUNT(*) AS n FROM kp_person_allocations"))
              .rows[0].n,
            0,
          );
          assert.equal(
            (
              await c.query(
                "SELECT MAX(version) AS v FROM kp_schema_migrations",
              )
            ).rows[0].v,
            schemaVersion,
          );
          throw Error(`Synthetic failure after migration ${schemaVersion}`);
        }
        return result;
      };
      return fn(c);
    }, readOnly);
  await assert.rejects(
    store.connect(),
    new RegExp(`Synthetic failure after migration ${schemaVersion}`),
  );
  assert.equal(interrupted, true);
  assert.deepEqual(await fs.readFile(file), legacy);
  await assert.rejects(fs.stat(file + ".lock"), { code: "ENOENT" });
  adapter.transaction = transaction;
  await store.connect();
  const committed = await store.read();
  assert.equal(committed.data.allocations["t|p|2026-09"], 0.75);
  assert.equal(
    (await store.db.query("SELECT COUNT(*) AS n FROM kp_person_allocations"))
      .rows[0].n,
    0,
  );
  assert.equal(
    (await store.db.query("SELECT MAX(version) AS v FROM kp_schema_migrations"))
      .rows[0].v,
    schemaVersion,
  );
  await store.close();
  await store.connect();
  assert.deepEqual(await store.read(), committed);
});
