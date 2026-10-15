import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { prepareMilestoneReorder } from "../frontend/src/features/project-timeline-commands.ts";
import { SqlJsAdapter } from "../backend/adapters/sqljs.mjs";
import {
  applyChanges,
  stageChanges,
  applyLeaderChange,
  restore,
} from "../backend/operations.mjs";

const password = hashPassword("Persistence-test-only-284!");

test("calendar and manual hour batches preserve project hours and persist all recalculated percentages/revisions", async (t) => {
  const { store, user, env } = await setup(t);
  await store.mutate(user, (data, active) => {
    data.projects.push({
      ...structuredClone(data.projects[0]),
      id: "q",
      name: "Second",
    });
    data.revisions["project:q"] = 1;
    stageChanges(
      data,
      active,
      ["p", "q"].map((project) => ({
        kind: "actual",
        id: "r|" + project + "|2026-09",
        revision: 0,
        value: { unit: "percent", value: 20 },
      })),
    );
  });
  const before = await store.read();
  await store.mutate(user, (data, active) =>
    stageChanges(data, active, [
      {
        kind: "calendar",
        id: "shared",
        revision: 1,
        value: {
          "2026-09-02": { type: "company", label: "Full day", fraction: 1 },
        },
      },
      { kind: "workedHours", id: "r|2026-09", revision: 0, value: 260 },
      {
        kind: "personDay",
        id: "r|2026-09-03|training",
        revision: 0,
        value: { type: "training", hours: 3, label: "" },
      },
    ]),
  );
  const after = await store.read();
  assert.deepEqual(after.data.actualAllocations, before.data.actualAllocations);
  for (const project of ["p", "q"]) {
    const key = "r|" + project + "|2026-09";
    assert.equal(
      after.data.actualPercentEntries[key],
      ((before.data.actualAllocations[key] * 180) / 249) * 100,
    );
    assert.equal(
      after.data.revisions["actual:" + key],
      before.data.revisions["actual:" + key] + 1,
    );
  }
  const audit = (await store.auditLog(user)).total;
  await assert.rejects(
    () =>
      store.mutate(user, (data, active) =>
        stageChanges(data, active, [
          { kind: "workedHours", id: "r|2026-09", revision: 1, value: 12 },
        ]),
      ),
    /%100/,
  );
  assert.deepEqual(await store.read(), after);
  assert.equal((await store.auditLog(user)).total, audit);
  await store.close();
  const restarted = new Store({ env });
  try {
    await restarted.connect();
    assert.deepEqual(await restarted.read(), after);
  } finally {
    await restarted.close();
  }
});

test("custom topic order survives editing, append, deletion, restore and database restart", async (t) => {
  const { store, user, env } = await setup(t);
  await store.mutate(user, (data) => {
    data.projects[0].milestones = ["late", "early", "middle"].map((id, i) => ({
      id,
      name: id,
      start: ["2026-12-01", "2026-01-01", "2026-06-01"][i],
      end: ["2026-12-02", "2026-01-02", "2026-06-02"][i],
      barNotes: [
        { text: "Detail " + id, includeInReport: true, completed: true },
      ],
    }));
  });
  const state = await store.read();
  assert.deepEqual(
    state.data.projects[0].milestones.map((m) => m.id),
    ["late", "early", "middle"],
  );
  await store.mutate(user, (data, active) =>
    applyChanges(data, active, [
      prepareMilestoneReorder(data, "p", "middle", "late", false, [
        "late",
        "early",
        "middle",
      ]),
    ]),
  );
  const ordered = await store.read();
  assert.deepEqual(
    ordered.data.projects[0].milestones.map((m) => m.id),
    ["middle", "late", "early"],
  );
  await store.mutate(user, (data) => {
    data.projects[0].name = "Edited project";
  });
  await store.close();
  const reopened = new Store({ env });
  try {
    await reopened.connect();
    assert.deepEqual(
      (await reopened.read()).data.projects[0].milestones,
      ordered.data.projects[0].milestones,
    );
    await reopened.mutate(user, (data) => {
      data.projects[0].milestones.push({
        id: "new",
        name: "New",
        start: "2026-01-01",
        end: "2026-01-01",
        hasCriticalTopics: false,
      });
    });
    assert.deepEqual(
      (await reopened.read()).data.projects[0].milestones.map((m) => m.id),
      ["middle", "late", "early", "new"],
    );
    await reopened.mutate(user, (data) => {
      data.projects[0].milestones = data.projects[0].milestones.filter(
        (m) => m.id !== "late",
      );
    });
    assert.deepEqual(
      (await reopened.read()).data.projects[0].milestones.map((m) => m.id),
      ["middle", "early", "new"],
    );
    await reopened.mutate(user, (data, active) =>
      restore(data, active, ordered.data),
    );
    assert.deepEqual(
      (await reopened.read()).data.projects[0].milestones,
      ordered.data.projects[0].milestones,
    );
  } finally {
    await reopened.close();
  }
});

test("version 26 migrates existing topics in their previous displayed order without altering their content", async (t) => {
  const { store, user, env } = await setup(t);
  await store.mutate(user, (data) => {
    data.projects[0].milestones = [
      { id: "late", name: "Late", start: "2026-12-01", end: "2026-12-02" },
      { id: "early", name: "Early", start: "2026-01-01", end: "2026-01-02" },
    ];
  });
  const before = await store.read();
  await store.close();
  const adapter = new SqlJsAdapter(env.SQLJS_FILE);
  try {
    await adapter.open();
    await adapter.transaction(async (c) => {
      await c.query("ALTER TABLE kp_project_milestones DROP COLUMN sort_order");
      await c.query("DELETE FROM kp_schema_migrations WHERE version=26");
    });
  } finally {
    await adapter.close();
  }
  const migrated = new Store({ env });
  try {
    await migrated.connect();
    const after = await migrated.read();
    const expected = structuredClone(before.data);
    expected.projects[0].milestones.reverse();
    assert.deepEqual(after.data, expected);
    assert.equal(after.generation, before.generation + 1);
    await migrated.close();
    await migrated.connect();
    assert.deepEqual(await migrated.read(), after);
  } finally {
    await migrated.close();
  }
});
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-persistence-"));
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "test.sqlite"),
  };
  const store = new Store({ env });
  const originalRaw = store.db.raw,
    originalUpsert = store.db.upsert;
  t.after(async () => {
    store.db.raw = originalRaw;
    store.db.upsert = originalUpsert;
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await store.connect();
  await store.bootstrapUser({
    _id: "test-admin",
    username: "test.admin",
    name: "Admin",
    role: "admin",
    leaders: [],
    active: true,
    password: await password,
    revision: 1,
    version: 1,
  });
  const user = await store.findUser({ id: "test-admin" });
  const team = (await store.read()).data.teams.find((team) => team.lead);
  await store.mutate(user, (data, active) => {
    applyChanges(data, active, [
      {
        kind: "project",
        id: "p",
        value: {
          id: "p",
          name: "Project",
          start: "2026-01",
          end: "2030-12",
          phases: {},
        },
        revision: 0,
      },
      {
        kind: "resource",
        id: "r",
        value: {
          id: "r",
          name: "Resource",
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
            },
          ],
        },
        revision: 0,
      },
      {
        kind: "calendar",
        id: "shared",
        value: {
          "2026-09-02": { type: "company", label: "Half day", fraction: 0.5 },
        },
        revision: 0,
      },
      {
        kind: "personDay",
        id: "r|2026-09-03|leave",
        value: { type: "leave", hours: 2, label: "Private label" },
        revision: 0,
      },
    ]);
    data.legacyArchive = {
      teams: [],
      allocations: { archived: 0.25 },
      resourceTeams: {},
    };
  });
  const queries = [],
    upserts = [];
  store.db.raw = function (sql, values, consume) {
    if (/^UPDATE kp_settings SET/i.test(sql))
      queries.push({ sql, values: structuredClone(values || []) });
    return originalRaw.call(this, sql, values, consume);
  };
  store.db.upsert = function (name, rows) {
    if (rows.length) upserts.push({ name, rows: structuredClone(rows) });
    return originalUpsert.call(this, name, rows);
  };
  return {
    store,
    user,
    env,
    team,
    queries,
    upserts,
    clear() {
      queries.length = 0;
      upserts.length = 0;
    },
  };
}

test("a cell edit writes only its value/revision/audit and generation; same-value edits still advance revision", async (t) => {
  const { store, user, team, queries, upserts, clear } = await setup(t);
  const before = await store.read(),
    audit = (await store.auditLog(user)).total;
  const id = team.id + "|p|2026-09";
  await store.mutate(user, (data, active) =>
    applyChanges(data, active, [
      { kind: "allocation", id, value: 0.25, revision: 0 },
    ]),
  );
  assert.deepEqual(upserts.map((entry) => entry.name).sort(), [
    "allocations",
    "audit_events",
    "revisions",
  ]);
  assert.deepEqual(queries, [
    {
      sql: "UPDATE kp_settings SET generation=generation+1 WHERE id=1",
      values: [],
    },
  ]);
  const after = await store.read();
  assert.equal(after.data.allocations[id], 0.25);
  assert.equal(after.data.revisions["allocation:" + id], 1);
  assert.equal(after.generation, before.generation + 1);
  for (const key of [
    "leaders",
    "leaderManagers",
    "workCalendar",
    "personCalendar",
    "legacyArchive",
  ])
    assert.deepEqual(after.data[key], before.data[key]);
  assert.equal((await store.auditLog(user)).total, audit + 1);
  clear();
  await store.mutate(user, (data, active) =>
    applyChanges(data, active, [
      { kind: "allocation", id, value: 0.25, revision: 1 },
    ]),
  );
  assert.deepEqual(
    upserts.map((entry) => entry.name),
    ["revisions"],
  );
  assert.equal((await store.read()).data.revisions["allocation:" + id], 2);
  assert.equal((await store.read()).generation, before.generation + 2);
  assert.equal((await store.auditLog(user)).total, audit + 1);
  assert.deepEqual(queries[0].values, []);
});

test("settings updates include only changed JSON columns and restore can clear calendars and the legacy archive", async (t) => {
  const { store, user, queries, clear } = await setup(t);
  const before = (await store.read()).data;
  await store.mutate(user, (data, active) =>
    applyChanges(data, active, [
      {
        kind: "calendar",
        id: "shared",
        value: {
          ...data.workCalendar,
          "2026-09-01": { type: "official", label: "Holiday", fraction: 1 },
        },
        revision: 1,
      },
    ]),
  );
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /\[calendar_days\]=@p0/);
  assert.doesNotMatch(queries[0].sql, /person_calendar|legacy_archive/);
  assert.equal(queries[0].values.length, 1);
  assert.deepEqual(
    (await store.read()).data.personCalendar,
    before.personCalendar,
  );
  clear();
  await store.mutate(user, (data, active) =>
    applyChanges(data, active, [
      {
        kind: "personDay",
        id: "r|2026-09-03|leave",
        value: { type: "leave", hours: 2.5, label: "  Edited label  " },
        revision: 1,
      },
    ]),
  );
  assert.match(queries[0].sql, /\[person_calendar\]=@p0/);
  assert.doesNotMatch(queries[0].sql, /calendar_days|legacy_archive/);
  assert.equal(queries[0].values.length, 1);
  assert.equal(
    JSON.parse(queries[0].values[0])["r|2026-09-03|leave"].label,
    "Edited label",
  );
  const backup = (await store.read()).data;
  backup.personCalendar = {};
  backup.workCalendar = {};
  delete backup.legacyArchive;
  clear();
  await store.mutate(user, (data, active) => restore(data, active, backup));
  assert.deepEqual(queries[0].values, [null, "{}", "{}"]);
  const after = (await store.read()).data;
  assert.deepEqual(after.workCalendar, {});
  assert.deepEqual(after.personCalendar, {});
  assert.equal(after.legacyArchive, undefined);
});

test("leader manager edits and new team relationships write their changed leaders before dependent rows", async (t) => {
  const { store, user, team, upserts, queries, clear } = await setup(t);
  await store.mutate(user, (data, active, c, generation) =>
    applyLeaderChange(
      data,
      active,
      { action: "update", name: team.lead, managerName: "Manager", generation },
      c,
      generation,
    ),
  );
  assert.deepEqual(
    upserts
      .filter((entry) => entry.name === "leaders")
      .flatMap((entry) => entry.rows),
    [{ name: team.lead, manager_name: "Manager" }],
  );
  assert.equal((await store.read()).data.leaderManagers[team.lead], "Manager");
  assert.deepEqual(queries[0].values, []);
  clear();
  await store.mutate(user, (data) => {
    data.leaders.push("New leader");
    data.teams.push({
      id: "extra",
      name: "New team",
      lead: "New leader",
      excelCapacity: 0,
      catalog: true,
    });
    data.revisions["team:extra"] = 1;
  });
  assert.deepEqual(
    upserts
      .filter((entry) => entry.name === "leaders")
      .flatMap((entry) => entry.rows),
    [{ name: "New leader", manager_name: "" }],
  );
  assert(
    upserts.findIndex((entry) => entry.name === "leaders") <
      upserts.findIndex((entry) => entry.name === "teams"),
  );
  assert.equal(
    (await store.read()).data.teams.find((team) => team.id === "extra").lead,
    "New leader",
  );
});

test("failure after the settings write rolls back changed rows, leaders, metadata, audit and generation across restart", async (t) => {
  const { store, user, env, team } = await setup(t);
  const before = await store.read(),
    audit = (await store.auditLog(user)).total;
  const raw = store.db.raw;
  store.db.raw = function (sql, values, consume) {
    const result = raw.call(this, sql, values, consume);
    if (/^UPDATE kp_settings SET/i.test(sql))
      throw Error("Injected settings failure");
    return result;
  };
  await assert.rejects(
    () =>
      store.mutate(user, (data, active) => {
        applyChanges(data, active, [
          {
            kind: "allocation",
            id: team.id + "|p|2026-09",
            value: 0.5,
            revision: 0,
          },
          { kind: "calendar", id: "shared", value: {}, revision: 1 },
        ]);
        data.leaders.push("Rolled back leader");
      }),
    /Injected settings failure/,
  );
  store.db.raw = raw;
  assert.deepEqual(await store.read(), before);
  assert.equal((await store.auditLog(user)).total, audit);
  await store.close();
  const reopened = new Store({ env });
  try {
    await reopened.connect();
    assert.deepEqual(await reopened.read(), before);
    assert.equal((await reopened.auditLog(user)).total, audit);
  } finally {
    await reopened.close();
  }
});

test("a planned edit cannot commit while an unrelated draft record fails full validation", async (t) => {
  const { store, user, team, upserts, queries, clear } = await setup(t);
  const before = await store.read(),
    audit = (await store.auditLog(user)).total;
  for (const corrupt of [
    (data) => {
      data.actualAllocations["missing|p|2026-09"] = 0.25;
    },
    (data) => {
      data.actualWorkedHours["r|2026-13"] = 1;
    },
    (data) => {
      data.personCalendar["r|2026-02-30|leave"] = {
        type: "leave",
        hours: 1,
        label: "",
      };
    },
  ]) {
    clear();
    await assert.rejects(
      () =>
        store.mutate(user, (data) => {
          data.allocations[team.id + "|p|2026-09"] = 0.25;
          data.revisions["allocation:" + team.id + "|p|2026-09"] = 1;
          corrupt(data);
        }),
      (e) => e.status === 400,
    );
    assert.deepEqual(upserts, []);
    assert.deepEqual(queries, []);
    assert.deepEqual(await store.read(), before);
    assert.equal((await store.auditLog(user)).total, audit);
  }
});

test("schema 33 preserves schema 32 employee links, credentials and allocations, creates independent leadership owners once", async (t) => {
  const { store, user, env, team } = await setup(t);
  await store.mutate(user, (data, active) =>
    applyChanges(data, active, [
      {
        kind: "allocation",
        id: team.id + "|p|2026-09",
        value: 0.5,
        revision: 0,
      },
      {
        kind: "actual",
        id: "r|p|2026-09",
        value: { unit: "hours", value: 8 },
        revision: 0,
      },
    ]),
  );
  const before = await store.read();
  const accountBefore = await store.findUser({ id: user._id });
  const auditBefore = await store.auditLog(user);
  const oldUnits = new Set(Object.values(before.data.leadershipUnits));
  await store.close();
  const adapter = new SqlJsAdapter(env.SQLJS_FILE);
  try {
    await adapter.open();
    await adapter.transaction(async (c) => {
      for (const id of oldUnits) {
        await c.query(
          "DELETE FROM kp_revisions WHERE kind='team' AND record_id=@p0",
          [id],
        );
        await c.query("DELETE FROM kp_teams WHERE id=@p0", [id]);
      }
      await c.query("ALTER TABLE kp_settings DROP COLUMN leader_parents");
      await c.query("ALTER TABLE kp_settings DROP COLUMN leadership_units");
      await c.query("DELETE FROM kp_schema_migrations WHERE version=33");
    });
  } finally {
    await adapter.close();
  }
  const upgraded = new Store({ env });
  try {
    await upgraded.connect();
    const after = await upgraded.read();
    const units = new Set(Object.values(after.data.leadershipUnits));
    assert.equal(units.size, after.data.leaders.length);
    assert.equal(after.generation, before.generation + 1);
    const original = structuredClone(before.data);
    original.teams = original.teams.filter((t) => !oldUnits.has(t.id));
    for (const id of oldUnits) delete original.revisions["team:" + id];
    delete original.leadershipUnits;
    delete original.leaderParents;
    const retained = structuredClone(after.data);
    retained.teams = retained.teams.filter((t) => !units.has(t.id));
    for (const id of units) delete retained.revisions["team:" + id];
    delete retained.leadershipUnits;
    delete retained.leaderParents;
    assert.deepEqual(retained, original);
    assert.deepEqual(await upgraded.findUser({ id: user._id }), accountBefore);
    assert.deepEqual(await upgraded.auditLog(user), auditBefore);
    assert(
      after.data.teams
        .filter((t) => units.has(t.id))
        .every((t) => t.kind === "leadership" && t.excelCapacity === 0),
    );
    await upgraded.close();
    await upgraded.connect();
    assert.deepEqual(await upgraded.read(), after); // Repeated startup does not duplicate units or change generation.
  } finally {
    await upgraded.close();
  }
});

test("schema 34 preserves schema 33 resource histories, user credentials and data and leaves legacy role fields absent", async (t) => {
  const { store, user, env } = await setup(t),
    before = await store.read(),
    account = await store.findUser({ id: user._id });
  await store.close();
  const adapter = new SqlJsAdapter(env.SQLJS_FILE);
  try {
    await adapter.open();
    await adapter.transaction(async (c) => {
      await c.query(
        "ALTER TABLE kp_resource_versions DROP COLUMN assignment_role",
      );
      await c.query("DELETE FROM kp_schema_migrations WHERE version=34");
    });
  } finally {
    await adapter.close();
  }
  const upgraded = new Store({ env });
  try {
    await upgraded.connect();
    assert.deepEqual(await upgraded.read(), before);
    assert.deepEqual(await upgraded.findUser({ id: user._id }), account);
    assert(
      !Object.hasOwn(
        (await upgraded.read()).data.resources[0].versions[0],
        "assignmentRole",
      ),
    );
    await assert.rejects(
      () =>
        upgraded.transaction((c) =>
          c.query("UPDATE kp_resource_versions SET assignment_role='admin'"),
        ),
      /CHECK/,
    );
    assert.deepEqual(await upgraded.read(), before);
  } finally {
    await upgraded.close();
  }
});
