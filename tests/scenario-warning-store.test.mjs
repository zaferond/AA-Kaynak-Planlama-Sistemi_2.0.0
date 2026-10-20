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
  restore,
} from "../backend/operations.mjs";
import { DEFAULT_WARNING_SETTINGS } from "../shared/scenario-warning-policy.ts";
import { synchronizeScenarioWarnings } from "../backend/scenario-warning-engine.mjs";

test("senaryo uyarıları: kilit, plan değişikliği, yetkiler, yaşam döngüsü ve yeniden açılış", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-20T10:00:00Z"),
  });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-warning-store-"));
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
  const data = (await store.read()).data,
    team = data.teams.find((t) => t.lead);
  const password = await hashPassword("Scenario-test-only-284!");
  const users = {};
  for (const [id, role] of [
    ["admin", "admin"],
    ["manager", "manager"],
    ["outsider", "manager"],
    ["normal", "normal"],
  ]) {
    await store.bootstrapUser({
      _id: id,
      username: "warning." + id,
      name: "Senaryo " + id,
      role,
      leaders: id === "manager" ? [team.lead] : [],
      active: true,
      password,
      version: 1,
      revision: 1,
    });
    users[id] = await store.findUser({ id });
  }
  const state = async () => (await store.read()).data;
  async function save(user, kind, id, value, operation) {
    const d = await state();
    return store.mutate(
      user,
      (draft, u) =>
        applyChanges(draft, u, [
          {
            kind,
            id,
            value,
            revision: d.revisions[kind + ":" + id] || 0,
            ...(operation ? { operation } : {}),
          },
        ]),
      { returnView: true },
    );
  }
  const project = {
    id: "p-warning",
    name: "Senaryo Projesi",
    start: "2026-01",
    end: "2026-12",
    phases: {},
  };
  await save(users.admin, "project", project.id, project);
  await save(
    users.admin,
    "allocation",
    `${team.id}|${project.id}|2026-01`,
    0.4,
  );
  await save(
    users.admin,
    "allocation",
    `${team.id}|${project.id}|2026-10`,
    0.6,
  );
  await save(users.admin, "progress", "pr-warning", {
    id: "pr-warning",
    projectId: project.id,
    leader: team.lead,
    baselines: [],
    actuals: {},
    createdBy: "client",
    createdByName: "client",
    createdAt: "client",
    proposal: {
      openingMonth: "2025-12",
      openingPct: 0,
      targets: { "2026-09": 40, "2026-12": 100 },
      status: "approved",
    },
  });
  let record = (await state()).projectProgress[0];
  assert.equal(record.baselines[0].resourceReference.resourceTotal, 1);
  assert.equal(record.baselines[0].resourceReference.source, "approval");
  await save(users.manager, "progress", record.id, {
    ...record,
    actuals: { "2026-09": { pct: 32, note: "Test gerçekleşeni" } },
  });
  assert.equal((await state()).scenarioWarnings, undefined);
  await save(users.admin, "progressLock", "2026-09", { id: "2026-09" });
  let warnings = (await state()).scenarioWarnings;
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].code, "S-02");
  const firstId = warnings[0].id;
  await t.test(
    "aksiyon açıklaması zorunlu, sıra ve sunucu kimlik damgaları korunur",
    async () => {
      await assert.rejects(
        save(users.manager, "scenarioWarning", firstId, {
          status: "acted",
          explanation: "Atlanan aşama",
        }),
        { status: 409 },
      );
      await assert.rejects(
        save(users.normal, "scenarioWarning", firstId, {
          status: "seen",
          explanation: "",
        }),
        { status: 403 },
      );
      await save(users.manager, "scenarioWarning", firstId, {
        status: "seen",
        explanation: "",
      });
      await assert.rejects(
        save(users.manager, "scenarioWarning", firstId, {
          status: "acted",
          explanation: "  ",
        }),
        { status: 400 },
      );
      await save(users.manager, "scenarioWarning", firstId, {
        status: "acted",
        explanation: "Kaynak ihtiyacı gözden geçirildi.",
      });
      const w = (await state()).scenarioWarnings[0];
      assert.equal(w.status, "acted");
      assert.equal(w.history.at(-1).byId, "manager");
      assert.equal(
        w.history.at(-1).explanation,
        "Kaynak ihtiyacı gözden geçirildi.",
      );
      assert.equal(w.history.at(-1).at, "2026-10-20T10:00:00.000Z");
    },
  );
  await t.test(
    "kaynak komutu motoru tetikler, sabit referans korunur, eski uyarı kapanır",
    async () => {
      const d = await state(),
        key = `${team.id}|${project.id}|2026-10`;
      await store.mutate(
        users.admin,
        planningCommand([
          {
            kind: "allocation",
            id: key,
            value: 1.02,
            revision: d.revisions["allocation:" + key],
          },
        ]),
        { returnView: true, planningDelta: { supported: true } },
      );
      const next = await state();
      assert.equal(next.scenarioWarnings.length, 2);
      assert.equal(
        next.scenarioWarnings.find((w) => w.id === firstId).status,
        "closed",
      );
      assert.equal(
        next.scenarioWarnings.find((w) => w.status !== "closed").code,
        "S-04",
      );
      assert.equal(
        next.projectProgress[0].baselines[0].resourceReference.resourceTotal,
        1,
      );
      assert.equal(next.warningAssessments[0].coverage, 1.5);
    },
  );
  await t.test(
    "ayarlar yalnız admin için görünür ve düzenlenebilir",
    async () => {
      const config = {
        id: "global",
        settings: { ...DEFAULT_WARNING_SETTINGS, coverageMaximum: 160 },
        updatedAt: "spoof",
        updatedById: "spoof",
        updatedByName: "spoof",
      };
      await assert.rejects(
        save(users.manager, "warningConfig", "global", config),
        { status: 403 },
      );
      await save(users.admin, "warningConfig", "global", config);
      const adminView = await store.view(users.admin),
        managerView = await store.view(users.manager),
        normalView = await store.view(users.normal);
      assert.equal(adminView.data.warningConfigs[0].updatedById, "admin");
      assert.equal(managerView.data.warningConfigs, undefined);
      assert.equal(managerView.data.warningAssessments[0].code, "S-03");
      assert.ok(managerView.data.revisions["scenarioWarning:" + firstId] > 0);
      assert.equal(normalView.data.scenarioWarnings, undefined);
      assert.equal(normalView.data.warningAssessments, undefined);
      assert.equal(normalView.data.warningConfigs, undefined);
    },
  );
  await t.test(
    "yeniden açılış ve aynı senaryoya dönüş kayıt çoğaltmaz; geçmiş kalıcıdır",
    async () => {
      const before = await state();
      await store.close();
      store = new Store({ env });
      await store.connect();
      assert.deepEqual(
        (await state()).scenarioWarnings,
        before.scenarioWarnings,
      );
      const preview = structuredClone(await state());
      assert.equal(synchronizeScenarioWarnings(preview), 0);
      assert.deepEqual(preview, await state());
      const last = await store.auditLog(users.admin, {
        kind: "scenarioWarning",
      });
      assert.ok(last.total >= 4);
      await save(users.admin, "warningConfig", "global", {
        id: "global",
        settings: { ...DEFAULT_WARNING_SETTINGS },
        updatedAt: "",
        updatedById: "",
        updatedByName: "",
      });
      const now = await state();
      assert.equal(
        now.scenarioWarnings.filter((w) => w.code === "S-04").length,
        1,
      );
      assert.equal(
        now.scenarioWarnings.find((w) => w.code === "S-04").status,
        "open",
      );
    },
  );
  await t.test(
    "gizli projelerin uyarıları görünmez ve durumları değiştirilemez",
    async () => {
      await save(users.admin, "project", project.id, {
        ...project,
        access: {
          roles: [],
          leaders: ["Gizli Liderlik"],
          teams: [],
          people: [],
        },
      });
      const managerView = await store.view(users.outsider);
      assert.equal(managerView.data.scenarioWarnings.length, 0);
      assert.equal(managerView.data.warningAssessments.length, 0);
      await assert.rejects(
        save(users.outsider, "scenarioWarning", firstId, {
          status: "seen",
          explanation: "",
        }),
        { status: 403 },
      );
    },
  );
  await t.test(
    "eski yedek yeni alanlar olmadan geri yüklenebilir",
    async () => {
      const old = structuredClone(await state());
      delete old.warningConfigs;
      delete old.warningAssessments;
      delete old.scenarioWarnings;
      delete old.progressLocks;
      await store.mutate(users.admin, (d, u) => restore(d, u, old));
      const next = await state();
      assert.equal(next.warningConfigs, undefined);
      assert.equal(next.scenarioWarnings, undefined);
      assert.equal(next.warningAssessments, undefined);
      assert.ok(next.projectProgress[0].actuals["2026-09"]);
    },
  );
});
