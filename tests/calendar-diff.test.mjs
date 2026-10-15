import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dataChanges } from "../backend/change-set.mjs";
import { prepareMutationSettings } from "../backend/mutation-settings.mjs";
import { Store } from "../backend/store.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { changeAndView } from "../backend/change-service.mjs";
import { auditEntries } from "../backend/audit.mjs";

const model = () => ({
  teams: [],
  projects: [],
  resources: [],
  risks: [],
  allocations: {},
  actualAllocations: {},
  workCalendar: {
    "2026-01-01": { type: "official", label: "Sentetik tatil", fraction: 1 },
  },
  personCalendar: {
    "r|2026-01-02|leave": {
      type: "leave",
      hours: 2,
      label: "Sentetik izin",
      range: { from: "2026-01-02", to: "2026-01-05", hours: 2 },
    },
  },
});
const settingsFor = (before, valid) =>
  prepareMutationSettings(before, valid, { validatedCalendars: true });

test("calendar diff reuse agrees with uncached records for edits, deletes, defaults, ordering and ranges", () => {
  const originals = [
    model(),
    { ...model(), workCalendar: undefined },
    { ...model(), personCalendar: undefined },
  ];
  const edits = [
    (after) => {},
    (after) => {
      after.personCalendar = {
        ...after.personCalendar,
        "r|2026-01-05|training": {
          type: "training",
          hours: 3,
          label: "Eğitim",
        },
      };
    },
    (after) => {
      after.personCalendar = {};
    },
    (after) => {
      after.personCalendar = {
        "r|2026-01-02|leave": {
          type: "leave",
          hours: 4,
          label: "İzin",
          range: { from: "2026-01-02", to: "2026-01-06", hours: 4 },
        },
      };
    },
    (after) => {
      after.workCalendar = {
        "2026-01-01": { label: "Yarım tatil", fraction: 0.5, type: "company" },
      };
    },
    (after) => {
      after.workCalendar = {};
    },
    (after) => {
      after.workCalendar = {
        "2026-01-01": {
          label: "Sentetik tatil",
          fraction: 1,
          type: "official",
        },
      };
    },
    (after) => {
      after.allocations = { "t|p|2026-01": 0.5 };
      after.actualAllocations = { "r|p|2026-01": 0.25 };
      after.projects = [{ id: "p", name: "Proje" }];
    },
  ];
  for (const before of originals)
    for (const edit of edits) {
      const after = structuredClone(before);
      edit(after);
      const expected = dataChanges(before, after);
      const settings = settingsFor(before, after);
      assert.deepEqual(dataChanges(before, after, { settings }), expected);
    }
});

test("unchanged validated calendars avoid entry serialization while other changes are still diffed", (t) => {
  const before = model(),
    after = structuredClone(before);
  after.actualAllocations = { "r|p|2026-01": 0.5 };
  const expected = dataChanges(before, after),
    original = JSON.stringify,
    calls = new Map();
  t.mock.method(JSON, "stringify", function (value, ...args) {
    calls.set(value, (calls.get(value) || 0) + 1);
    return original.call(this, value, ...args);
  });
  const settings = settingsFor(before, after);
  assert.deepEqual(dataChanges(before, after, { settings }), expected);
  for (const snapshot of [before, after])
    for (const key of ["workCalendar", "personCalendar"]) {
      assert.equal(calls.get(snapshot[key]), 1);
      for (const entry of Object.values(snapshot[key]))
        assert.equal(calls.get(entry) || 0, 0);
    }
  assert.equal(expected.actual.length, 1);
});

test("equality is opt-in, pair-bound, calendar-only and independent of changes to the public equality map", () => {
  const before = model(),
    after = structuredClone(before),
    settings = settingsFor(before, after);
  assert.equal(settings.calendarUnchanged(before, after, "workCalendar"), true);
  assert.equal(
    prepareMutationSettings(before, after).calendarUnchanged(
      before,
      after,
      "workCalendar",
    ),
    false,
  );
  for (const key of [
    "allocations",
    "actualAllocations",
    "resources",
    "legacyArchive",
    "unknown",
  ])
    assert.equal(settings.calendarUnchanged(before, after, key), false);
  const next = structuredClone(after);
  next.personCalendar["r|2026-01-02|leave"].hours = 4;
  assert.equal(
    settings.calendarUnchanged(before, next, "personCalendar"),
    false,
  );
  assert.deepEqual(
    dataChanges(before, next, { settings }),
    dataChanges(before, next),
  );
  const changedSettings = settingsFor(before, next);
  changedSettings.metadataEquality.set("personCalendar", true);
  assert.equal(
    changedSettings.calendarUnchanged(before, next, "personCalendar"),
    false,
  );
  assert.deepEqual(
    dataChanges(before, next, { settings: changedSettings }),
    dataChanges(before, next),
  );
});

const password = hashPassword("Synthetic-calendar-diff-only-458!");
async function setup(t) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "aa-calendar-diff-test-"),
  );
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
  await store.bootstrapUser({
    _id: "admin",
    username: "diff.admin",
    name: "Synthetic admin",
    role: "admin",
    leaders: [],
    resourceId: "",
    active: true,
    password: await password,
    revision: 1,
    version: 1,
  });
  const actor = await store.findUser({ id: "admin" }),
    team = (await store.read()).data.teams.find((t) => t.lead);
  await store.mutate(actor, (data, active) =>
    applyChanges(data, active, [
      {
        kind: "project",
        id: "p",
        revision: 0,
        value: {
          id: "p",
          name: "Synthetic project",
          start: "2026-01",
          end: "2026-12",
          phases: {},
          milestones: [],
        },
      },
      {
        kind: "resource",
        id: "r",
        revision: 0,
        value: {
          id: "r",
          name: "Synthetic worker",
          note: "Private synthetic HR note",
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
      },
      {
        kind: "actual",
        id: "r|p|2026-01",
        revision: 0,
        value: { unit: "percent", value: 25 },
      },
    ]),
  );
  return { store, actor, team, env };
}
const comparable = (entries) =>
  entries
    .map(({ id, occurred_at, changes, ...rest }) => ({
      ...rest,
      changes: typeof changes === "string" ? JSON.parse(changes) : changes,
    }))
    .sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) || a.record_id.localeCompare(b.record_id),
    );

test("stored calendar create/edit/delete and recalculated actuals retain fresh views, revisions and complete sanitized audit", async (t) => {
  const { store, actor, team, env } = await setup(t);
  const batches = [
    [
      {
        kind: "allocation",
        id: team.id + "|p|2026-01",
        value: 0.5,
        revision: 0,
      },
    ],
    [
      {
        kind: "calendar",
        id: "shared",
        value: {
          "2026-01-01": {
            type: "official",
            label: "Synthetic holiday",
            fraction: 1,
          },
        },
        revision: 0,
      },
    ],
    [
      {
        kind: "personDay",
        id: "r|2026-01-02|leave",
        value: { type: "leave", hours: 2, label: "Private synthetic absence" },
        revision: 0,
      },
    ],
    [
      {
        kind: "personDay",
        id: "r|2026-01-05|training",
        value: {
          type: "training",
          hours: 3,
          label: "Private synthetic training",
        },
        revision: 0,
      },
    ],
    [
      {
        kind: "personDay",
        id: "r|2026-01-02|leave",
        value: {
          type: "leave",
          hours: 4,
          label: "Updated private synthetic absence",
        },
        revision: 1,
      },
    ],
    [
      {
        kind: "personDay",
        id: "r|2026-01-02|leave",
        operation: "delete",
        revision: 2,
      },
    ],
    [{ kind: "calendar", id: "shared", value: {}, revision: 1 }],
  ];
  for (const changes of batches) {
    const before = await store.view(actor),
      previousAudit = (await store.auditLog(actor)).entries;
    const result = await changeAndView(store, actor, changes);
    assert.deepEqual(result, await store.view(actor));
    assert.equal(result.generation, before.generation + 1);
    const expected = auditEntries(before.data, result.data, actor);
    const oldIds = new Set(previousAudit.map((x) => x.id));
    const actual = (await store.auditLog(actor)).entries.filter(
      (e) => !oldIds.has(e.id),
    );
    assert.deepEqual(comparable(actual), comparable(expected));
    assert(!JSON.stringify(actual).includes("Private synthetic"));
    for (const change of changes)
      assert.equal(
        result.data.revisions[change.kind + ":" + change.id],
        change.revision + 1,
      );
  }
  const final = await store.view(actor);
  await store.close();
  const reopened = new Store({ env });
  try {
    await reopened.connect();
    assert.deepEqual(await reopened.view(actor), final);
  } finally {
    await reopened.close();
  }
});

test("settings failure occurs before persistence and preserves data, audit and file bytes", async (t) => {
  const { store, actor, team, env } = await setup(t),
    before = await store.view(actor),
    audit = await store.auditLog(actor),
    file = await fs.readFile(env.SQLJS_FILE);
  let writes = 0;
  t.mock.method(store, "persist", () => {
    writes++;
    throw Error("Persistence must not start");
  });
  t.mock.method(store, "prepareMutationSettings", () => {
    throw Error("Synthetic encoding failure");
  });
  await assert.rejects(
    changeAndView(store, actor, [
      {
        kind: "allocation",
        id: team.id + "|p|2026-01",
        value: 0.5,
        revision: 0,
      },
    ]),
    /Synthetic encoding failure/,
  );
  assert.equal(writes, 0);
  assert.deepEqual(await store.view(actor), before);
  assert.deepEqual(await store.auditLog(actor), audit);
  assert.deepEqual(await fs.readFile(env.SQLJS_FILE), file);
});
