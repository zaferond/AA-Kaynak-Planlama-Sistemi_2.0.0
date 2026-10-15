import assert from "node:assert/strict";
import http from "node:http";
import initialCatalog from "../shared/catalog.json" with { type: "json" };

import { syntheticDirectory } from "./directory-fixture.mjs";
import { createApp } from "../backend/app.mjs";
import { hashPassword } from "../backend/auth.mjs";
import {
  currentPlanningMonth,
  personHoursInMonth,
} from "../backend/domain/index.mjs";
export async function integrationSuite(store) {
  let server, app;
  try {
    await store.connect();
    const pass = "Only-for-integration-284!";
    await store.bootstrapUser({
      _id: "root-admin",
      username: "test.admin",
      name: "Test",
      role: "admin",
      leaders: [],
      active: true,
      password: await hashPassword(pass),
      revision: 1,
      version: 1,
    });
    server = http.createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = "http://127.0.0.1:" + server.address().port;
    const directory = syntheticDirectory(pass);
    directory.add({
      id: "e".repeat(32),
      username: "test.new-manager",
      name: "Directory manager",
      email: "manager@example.test",
    });
    app = createApp(store, { origin, directory });
    server.on("request", app);
    let cookie = "",
      csrf = "";
    async function request(url, body, expected = 200, auth = { cookie, csrf }) {
      const response = await fetch(origin + "/api" + url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(auth.cookie ? { Cookie: auth.cookie } : {}),
          ...(body === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                Origin: origin,
                "X-Requested-With": "KaynakPortal",
                "X-CSRF-Token": auth.csrf,
              }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await response.json();
      assert.equal(response.status, expected, JSON.stringify(json));
      return { json, response };
    }
    await request("/data", undefined, 401);
    await request(
      "/auth/login",
      { username: "test.admin", password: "wrong" },
      401,
    );
    const login = await request("/auth/login", {
      username: "test.admin",
      password: pass,
      remember: true,
    });
    cookie = login.response.headers.get("set-cookie").split(";")[0];
    csrf = login.json.csrf;
    assert.match(login.response.headers.get("set-cookie"), /HttpOnly/i);
    const root = { cookie, csrf };
    const get = async (auth) =>
      (await request("/data", undefined, 200, auth)).json;
    let state = await get();
    assert.equal(
      state.data.teams.filter((team) => team.kind !== "leadership").length,
      initialCatalog.teams.length,
    );
    const units = Object.entries(state.data.leadershipUnits);
    assert.equal(units.length, initialCatalog.leaders.length);
    assert.equal(new Set(units.map(([, id]) => id)).size, units.length);
    for (const [leader, id] of units) {
      const unit = state.data.teams.find((team) => team.id === id);
      assert.equal(unit?.kind, "leadership");
      assert.equal(unit.lead, leader);
    }
    assert.equal(
      state.data.teams.length,
      initialCatalog.teams.length + units.length,
    );
    assert.equal(state.data.riskSystems.length, 75);
    const testSystem = {
      id: "native-system-test",
      name: "Test 'Sistem' & Alt Sistem",
    };
    await request("/changes", {
      changes: [
        {
          kind: "riskSystem",
          id: testSystem.id,
          value: testSystem,
          revision: 0,
        },
      ],
    });
    await request("/changes", {
      changes: [
        {
          kind: "riskSystem",
          id: testSystem.id,
          value: { ...testSystem, name: "Güncel Alt Sistem" },
          revision: 1,
        },
      ],
    });
    const catalog = (await get()).data;
    assert.equal(
      catalog.riskSystems.find((item) => item.id === testSystem.id).name,
      "Güncel Alt Sistem",
    );
    assert.equal(catalog.revisions["riskSystem:" + testSystem.id], 2);
    await request(
      "/changes",
      {
        changes: [
          {
            kind: "riskSystem",
            id: testSystem.id,
            value: testSystem,
            revision: 1,
          },
        ],
      },
      409,
    );
    await request("/changes", {
      changes: [
        {
          kind: "riskSystem",
          id: testSystem.id,
          value: null,
          operation: "delete",
          revision: 2,
        },
      ],
    });
    assert.equal(
      (await get()).data.riskSystems.some((item) => item.id === testSystem.id),
      false,
    );
    assert.equal(JSON.stringify(state).includes('"hash"'), false);
    const team = state.data.teams.find((t) => t.lead),
      other = state.data.teams.find((t) => t.lead && t.lead !== team.lead);
    const project = {
      id: "p",
      name: "Proje",
      start: "2026-01",
      end: "2030-12",
      phases: { "2026-09": "Tasarım" },
      phaseColors: { "2026-09": "blue" },
    };
    const resource = {
      id: "r",
      name: "Deneme",
      note: "Gizli not",
      versions: [
        {
          team: team.id,
          lead: team.lead,
          effective: "2026-01",
          status: "Aktif Çalışan",
          included: true,
          amount: 1,
          start: "2026-01-01",
          end: "",
        },
      ],
    };
    await request("/changes", {
      changes: [
        { kind: "project", id: "p", value: project, revision: 0 },
        { kind: "resource", id: "r", value: resource, revision: 0 },
      ],
    });
    // Direct API callers cannot bypass the shared mandatory-date rule.
    for (const status of [
      "Aktif Çalışan",
      "SAAT Ücretli Ofis Ç.",
      "Gear Up",
      "Aktif İlan",
    ]) {
      const before = await get();
      const invalid = {
        ...resource,
        id: "undated",
        versions: [{ ...resource.versions[0], status, start: "" }],
      };
      const response = await request(
        "/changes",
        {
          changes: [
            { kind: "resource", id: invalid.id, revision: 0, value: invalid },
          ],
        },
        400,
      );
      assert.match(response.json.error, /İşbaşı Tarihi/);
      assert.deepEqual(
        await get(),
        before,
        "invalid API input must roll back model, revisions and generation",
      );
    }
    const milestone = {
      id: "info_1",
      name: "Proje Bilgisi",
      start: "2026-03-10",
      end: "2026-03-12",
      barColor: "purple",
      barStyle: "solid",
      barText: "İlk açıklama",
      additionalRanges: [
        {
          start: "2026-04-10",
          end: "2026-04-12",
          description: "İkinci açıklama",
          color: "green",
        },
      ],
    };
    const savedMilestone = await request("/changes", {
      changes: [
        {
          kind: "project",
          id: "p",
          value: { ...project, milestones: [milestone] },
          revision: 1,
        },
      ],
    });
    assert.deepEqual(
      savedMilestone.json.data.projects.find((p) => p.id === "p").milestones,
      [milestone],
    );
    assert.deepEqual(
      (await get()).data.projects.find((p) => p.id === "p").milestones,
      [milestone],
    );
    const revisedMilestone = {
      ...milestone,
      barNotes: [
        { text: "İlk açıklama", includeInReport: true },
        { text: "İkinci madde", includeInReport: false },
      ],
      additionalRanges: [
        {
          ...milestone.additionalRanges[0],
          notes: [{ text: "İkinci açıklama", includeInReport: true }],
        },
        {
          start: "2026-05-20",
          end: "2026-05-22",
          description: "Üçüncü açıklama",
          notes: [{ text: "Üçüncü açıklama", includeInReport: false }],
          color: "amber",
        },
      ],
    };
    await request("/changes", {
      changes: [
        {
          kind: "project",
          id: "p",
          value: { ...project, milestones: [revisedMilestone] },
          revision: 2,
        },
      ],
    });
    assert.deepEqual(
      (await get()).data.projects.find((p) => p.id === "p").milestones,
      [revisedMilestone],
    );
    const k = team.id + "|p|2026-09";
    await request("/changes", {
      changes: [{ kind: "allocation", id: k, value: 0.5, revision: 0 }],
    });
    const actualKey = "r|p|2026-09";
    await request("/changes", {
      changes: [
        {
          kind: "team",
          id: team.id,
          value: { ...team, managerName: "Örnek Yönetici" },
          revision: 0,
        },
        { kind: "actual", id: actualKey, value: 0.75, revision: 0 },
      ],
    });
    assert.equal(
      (await get()).data.teams.find((t) => t.id === team.id).managerName,
      "Örnek Yönetici",
    );
    assert.equal((await get()).data.actualAllocations[actualKey], 0.75);
    assert.equal((await get()).data.allocations[k], 0.5);
    const overtimeMonth = "2026-08",
      overtimeKey = "r|p|" + overtimeMonth,
      hoursKey = "r|" + overtimeMonth;
    const automaticAmount = personHoursInMonth(overtimeMonth, "r") / 360;
    const automaticHours = automaticAmount * 180;
    await request("/changes", {
      changes: [
        {
          kind: "actual",
          id: overtimeKey,
          value: { unit: "percent", value: 50 },
          revision: 0,
        },
      ],
    });
    let overtime = (await store.read()).data;
    assert.equal(overtime.actualPercentEntries[overtimeKey], 50);
    assert.equal(overtime.actualAllocations[overtimeKey], automaticAmount);
    const increased = await request("/changes", {
      changes: [{ kind: "workedHours", id: hoursKey, value: 220, revision: 0 }],
    });
    assert.equal(
      increased.json.data.actualAllocations[overtimeKey],
      automaticAmount,
    );
    assert(
      Math.abs(
        increased.json.data.actualPercentEntries[overtimeKey] -
          (automaticHours / 220) * 100,
      ) < 1e-10,
    );
    overtime = (await store.read()).data;
    assert.equal(overtime.actualWorkedHours[hoursKey], 220);
    assert.equal(overtime.actualAllocations[overtimeKey], automaticAmount);
    assert(
      Math.abs(
        overtime.actualPercentEntries[overtimeKey] -
          (automaticHours / 220) * 100,
      ) < 1e-10,
    );
    await request(
      "/changes",
      {
        changes: [
          { kind: "workedHours", id: hoursKey, value: 80, revision: 1 },
        ],
      },
      400,
    );
    overtime = (await store.read()).data;
    assert.equal(overtime.actualWorkedHours[hoursKey], 220);
    assert.equal(overtime.actualAllocations[overtimeKey], automaticAmount);
    await request("/changes", {
      changes: [
        { kind: "workedHours", id: hoursKey, value: null, revision: 1 },
      ],
    });
    overtime = (await store.read()).data;
    assert.equal(overtime.actualWorkedHours[hoursKey], undefined);
    assert.equal(overtime.actualAllocations[overtimeKey], automaticAmount);
    await request("/changes", {
      changes: [{ kind: "workedHours", id: hoursKey, value: 250, revision: 2 }],
    });
    overtime = (await store.read()).data;
    assert.equal(overtime.actualAllocations[overtimeKey], automaticAmount);
    assert.equal(
      overtime.actualPercentEntries[overtimeKey],
      (automaticHours / 250) * 100,
    );
    assert.equal(overtime.revisions["actual:" + overtimeKey], 4);
    await request("/changes", {
      changes: [
        {
          kind: "actual",
          id: overtimeKey,
          value: { unit: "hours", value: 90 },
          revision: 4,
        },
      ],
    });
    overtime = (await store.read()).data;
    assert.equal(overtime.actualAllocations[overtimeKey], 0.5);
    assert.equal(overtime.actualPercentEntries[overtimeKey], undefined);
    await request("/changes", {
      changes: [
        { kind: "workedHours", id: hoursKey, value: null, revision: 3 },
      ],
    });
    overtime = (await store.read()).data;
    assert.equal(overtime.actualAllocations[overtimeKey], 0.5);
    assert.equal(overtime.actualWorkedHours[hoursKey], undefined);
    const stale = await get();
    const competing = await Promise.all(
      [1, 2].map((value) =>
        fetch(origin + "/api/changes", {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: origin,
            "Content-Type": "application/json",
            "X-Requested-With": "KaynakPortal",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({
            changes: [{ kind: "allocation", id: k, value, revision: 1 }],
          }),
        }),
      ),
    );
    assert.deepEqual(competing.map((x) => x.status).sort(), [200, 409]);
    await request(
      "/changes",
      {
        changes: [
          { kind: "resource", id: "r", operation: "delete", revision: 1 },
          { kind: "allocation", id: k, value: 3, revision: 1 },
        ],
      },
      409,
    );
    assert.equal(
      (await get()).data.resources.length,
      1,
      "Failed batch must roll back resource deletion",
    );
    await request(
      "/changes",
      {
        changes: [
          {
            kind: "allocation",
            id: team.id + "|p|2031-01",
            value: 1,
            revision: 0,
          },
        ],
      },
      400,
    );
    await store.bootstrapUser({
      _id: "test-manager",
      username: "test.normal",
      name: "Yönetici",
      role: "manager",
      leaders: [team.lead],
      resourceId: "",
      active: true,
      password: await hashPassword(pass),
      revision: 1,
      version: 1,
    });
    let normal = (await get()).data.users.find(
      (u) => u.username === "test.normal",
    );
    await request(
      "/users",
      {
        username: "cannot-create",
        name: "No",
        role: "admin",
        leaders: [],
        revision: 0,
      },
      400,
    );
    const nLogin = await request("/auth/login", {
      username: "test.normal",
      password: pass,
    });
    const normalAuth = {
      cookie: nLogin.response.headers.get("set-cookie").split(";")[0],
      csrf: nLogin.json.csrf,
    };
    state = await get(normalAuth);
    assert.equal(state.data.users, undefined);
    assert.deepEqual(state.data.teams, (await get(root)).data.teams);
    assert.equal(state.data.resources[0].name, "Deneme");
    assert.equal(state.data.actualAllocations[actualKey], 0.75);
    assert.equal(state.data.actualTeamTotals[k], 0.75);
    assert.equal(
      state.data.teams.find((t) => t.id === team.id).managerName,
      "Örnek Yönetici",
    );
    await request(
      "/changes",
      { changes: [{ kind: "actual", id: actualKey, value: 1, revision: 0 }] },
      409,
      normalAuth,
    );
    const managerHoursKey = "r|" + currentPlanningMonth();
    await request(
      "/changes",
      {
        changes: [
          { kind: "workedHours", id: managerHoursKey, value: 180, revision: 0 },
        ],
      },
      200,
      normalAuth,
    );
    await request(
      "/changes",
      {
        changes: [
          {
            kind: "allocation",
            id: other.id + "|p|2026-09",
            value: 1,
            revision: 0,
          },
        ],
      },
      403,
      normalAuth,
    );
    await request("/backup", undefined, 403, normalAuth);
    await request("/audit", undefined, 403, normalAuth);
    await store.bootstrapUser({
      _id: "test-viewer",
      username: "test.all-leaders",
      name: "Tüm Liderlikler İzleyicisi",
      role: "normal",
      leaders: [],
      resourceId: "",
      active: true,
      password: await hashPassword(pass),
      revision: 1,
      version: 1,
    });
    const allViewer = (await get()).data.users.find(
      (u) => u.username === "test.all-leaders",
    );
    const allLogin = await request("/auth/login", {
      username: "test.all-leaders",
      password: pass,
    });
    const allAuth = {
      cookie: allLogin.response.headers.get("set-cookie").split(";")[0],
      csrf: allLogin.json.csrf,
    };
    const allView = await get(allAuth);
    assert.deepEqual(
      allView.data.teams.map((item) => item.id),
      (await get()).data.teams
        .filter((item) => item.lead)
        .map((item) => item.id),
    );
    assert.deepEqual(allView.data.leaders, (await get()).data.leaders);
    await request(
      "/changes",
      {
        changes: [
          {
            kind: "allocation",
            id: other.id + "|p|2026-09",
            value: 1,
            revision: 0,
          },
        ],
      },
      403,
      allAuth,
    );
    await request("/users/delete", { id: allViewer.id, revision: 1 }, 404);
    const allocationBeforeRejectedReset = (await get()).data.allocations[k];
    await request(
      "/allocations/reset",
      {
        revisions: Object.fromEntries(
          Object.entries(state.data.revisions).filter(([key]) =>
            key.startsWith("allocation:"),
          ),
        ),
      },
      403,
      normalAuth,
    );
    assert.equal(
      (await get()).data.allocations[k],
      allocationBeforeRejectedReset,
    );
    await request(
      "/changes",
      { changes: [{ kind: "allocation", id: k, value: 0.75, revision: 2 }] },
      200,
      normalAuth,
    );
    await request(
      "/allocations/reset",
      {
        revisions: Object.fromEntries(
          Object.entries(stale.data.revisions).filter(([k]) =>
            k.startsWith("allocation:"),
          ),
        ),
      },
      409,
    );
    await request("/changes", {
      changes: [
        { kind: "resource", id: "r", operation: "delete", revision: 1 },
      ],
    });
    assert.equal((await get()).data.resources.length, 0);
    assert.equal((await get()).data.actualAllocations[actualKey], undefined);
    assert.equal((await get(normalAuth)).data.actualTeamTotals[k], undefined);
    const row = {
      row: 2,
      values: {
        name: "Yeni",
        lead: team.lead,
        team: team.name,
        status: "Aktif Çalışan",
        included: "Evet",
        start: "2026-09-16",
        amount: 1,
      },
      problems: [],
      date1904: false,
    };
    const imported = await request("/resources/import", { rows: [row] });
    assert.equal(imported.json.imported, 1);
    assert.equal(
      imported.json.data.resources[0].versions[0].effective,
      "2026-09",
    );
    assert.equal(
      imported.json.data.resources[0].versions[0].start,
      "2026-09-16",
    );
    assert.equal(
      (await request("/resources/import", { rows: [row] })).json.skipped,
      1,
    );
    await request(
      "/resources/import",
      {
        rows: [
          { ...row, values: { ...row.values, name: "Diğer", amount: -1 } },
        ],
      },
      400,
    );
    assert.equal((await get()).data.resources.length, 1);
    // Same account creation path runs on SQL.js and native MSSQL fixtures.
    const employeeId = (await get()).data.resources[0].id;
    const created = await request("/users/create", {
      directoryId: "e".repeat(32),
      role: "manager",
      leaders: [other.lead],
      resourceId: employeeId,
    });
    const createdAccount = created.json.data.users.find(
      (u) => u.username === "test.new-manager",
    );
    assert.equal(createdAccount.resourceId, employeeId);
    assert.equal(createdAccount.authSource, "ldap");
    assert.equal(createdAccount.directoryId, "e".repeat(32));
    assert.equal(createdAccount.email, "manager@example.test");
    const createdLogin = await request("/auth/login", {
      username: "test.new-manager",
      password: pass,
    });
    const createdAuth = {
      cookie: createdLogin.response.headers.get("set-cookie").split(";")[0],
      csrf: createdLogin.json.csrf,
    };
    assert.equal(
      (await get(createdAuth)).data.resources.find((r) => r.id === employeeId)
        .name,
      "Yeni",
    );
    await request("/users", {
      id: createdAccount.id,
      role: "manager",
      leaders: [],
      resourceId: employeeId,
      revision: created.json.data.revisions["user:" + createdAccount.id],
    });
    await request("/data", undefined, 401, createdAuth);
    await request(
      "/users/create",
      {
        directoryId: "e".repeat(32),
        role: "normal",
        leaders: [],
        resourceId: employeeId,
      },
      409,
    );
    const audit = (await request("/audit?limit=2")).json;
    assert.equal(audit.entries.length, 2);
    assert(audit.total >= 2);
    const backup = (await request("/backup")).json;
    assert.equal(backup.data.users, undefined);
    state = await get();
    await request(
      "/restore",
      { data: backup.data, generation: state.generation - 1 },
      409,
    );
    await request("/restore", {
      data: backup.data,
      generation: state.generation,
    });
    state = await get();
    await request("/users", {
      id: normal.id,
      role: "manager",
      leaders: [team.lead],
      resourceId: "",
      revision: state.data.revisions["user:" + normal.id],
    });
    await request("/data", undefined, 401, normalAuth);
    state = await get();
    await request("/allocations/reset", {
      revisions: Object.fromEntries(
        Object.entries(state.data.revisions).filter(([k]) =>
          k.startsWith("allocation:"),
        ),
      ),
    });
    assert.deepEqual((await get()).data.allocations, {});
    assert.equal((await store.read()).data.resources.length, 1);
    // Constraints are tested without going through the API validator.
    await assert.rejects(
      () =>
        store.db.query(
          "INSERT INTO kp_allocations(team_id,project_id,month,amount) VALUES('missing','p','2026-09',1)",
        ),
      (e) => e.number === 547 || /FOREIGN KEY/.test(e.message),
    );
    await assert.rejects(
      () =>
        store.db.query(
          "INSERT INTO kp_allocations(team_id,project_id,month,amount) VALUES(@p0,'p','2026-09',-1)",
          [team.id],
        ),
      (e) => e.number === 547 || /CHECK constraint/.test(e.message),
    );
    const beforeFailure = await get();
    const rootUser = await store.findUser({ id: "root-admin" });
    await assert.rejects(
      () =>
        store.mutate(rootUser, async (_d, _u, c) => {
          await c.query(
            "UPDATE kp_projects SET name='Must roll back' WHERE id='p'",
          );
          await c.query(
            "INSERT INTO kp_allocations(team_id,project_id,month,amount) VALUES('missing','p','2026-09',1)",
          );
        }),
      (e) => e.number === 547 || /FOREIGN KEY/.test(e.message),
    );
    assert.equal(
      (await get()).data.projects[0].name,
      beforeFailure.data.projects[0].name,
    );
    assert.equal((await get()).generation, beforeFailure.generation);
    await request("/changes", { changes: [] }, 403, { cookie, csrf: "bad" });
    await request("/users/delete", { id: normal.id, revision: 2 }, 404);
    assert.ok(await store.findUser({ id: normal.id }));
    await request("/changes", {
      changes: [
        {
          kind: "project",
          id: "p",
          operation: "delete",
          revision: (await get()).data.revisions["project:p"],
        },
      ],
    });
    assert.equal(
      (
        await store.db.query(
          "SELECT * FROM kp_project_phases WHERE project_id='p'",
        )
      ).rowCount,
      0,
    );
    state = await get();
    await request("/leaders/change", {
      action: "rename",
      name: team.lead,
      newName: "Yeniden Adlandırılan Liderlik",
      generation: state.generation,
    });
    state = await get();
    assert(state.data.leaders.includes("Yeniden Adlandırılan Liderlik"));
    assert.equal(
      state.data.teams.find((t) => t.id === team.id).lead,
      "Yeniden Adlandırılan Liderlik",
    );
    assert.equal(
      state.data.resources[0].versions[0].lead,
      "Yeniden Adlandırılan Liderlik",
    );
    await request("/leaders/change", {
      action: "update",
      name: "Yeniden Adlandırılan Liderlik",
      managerName: "Lider Yönetici",
      generation: state.generation,
    });
    state = await get();
    assert.equal(
      state.data.leaderManagers["Yeniden Adlandırılan Liderlik"],
      "Lider Yönetici",
    );
    assert.equal(
      (await store.read()).data.leaderManagers["Yeniden Adlandırılan Liderlik"],
      "Lider Yönetici",
    );
    await request(
      "/leaders/change",
      {
        action: "delete",
        name: "Yeniden Adlandırılan Liderlik",
        generation: state.generation,
      },
      409,
    );
    const unused = state.data.teams.find((t) => t.lead === other.lead);
    await request("/changes", {
      changes: [
        {
          kind: "team",
          id: unused.id,
          operation: "delete",
          revision: state.data.revisions["team:" + unused.id] || 0,
        },
      ],
    });
    assert(!(await get()).data.teams.some((t) => t.id === unused.id));
    await request("/auth/logout", {});
    await request("/data", undefined, 401);
  } finally {
    app?.locals.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}
