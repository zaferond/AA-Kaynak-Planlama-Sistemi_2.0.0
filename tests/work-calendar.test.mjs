import { schemaVersion } from "../backend/migration-catalog.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { applyChanges } from "../backend/operations.mjs";
import {
  validate,
  currentPlanningMonth,
  personHoursInMonth,
  trainingHoursInMonth,
  DEFAULT_MONTHLY_HOURS,
} from "../backend/domain/index.mjs";
import { Store } from "../backend/store.mjs";
import { hashPassword } from "../backend/auth.mjs";
import fs from "node:fs/promises";
import path from "node:path";

const admin = { _id: "root-admin", role: "admin", leaders: [] };
const employee = { _id: "u", role: "normal", resourceId: "r", leaders: [] };
const other = { _id: "v", role: "normal", resourceId: "other", leaders: [] };
const fixture = () => ({
  teams: [
    { id: "t", name: "Takım", lead: "L", excelCapacity: 0, catalog: true },
  ],
  projects: [
    { id: "p", name: "Proje", start: "2025-01", end: "2030-12", phases: {} },
  ],
  resources: [
    {
      id: "r",
      name: "Çalışan",
      note: "",
      versions: [
        {
          effective: "2025-01",
          team: "t",
          lead: "L",
          status: "Aktif Çalışan",
          included: true,
          start: "2025-01-01",
          end: "",
          amount: 1,
        },
      ],
    },
  ],
  allocations: {},
  actualAllocations: {},
  actualPercentEntries: {},
  actualWorkedHours: {},
  workCalendar: {},
  personCalendar: {},
  revisions: {},
  leaders: ["L"],
  catalogVersion: 2,
});
const dayInMonth = (month, day) => month + "-" + String(day).padStart(2, "0");
const weekday = (month) => {
  for (let day = 1; day <= 28; day++) {
    const date = dayInMonth(month, day),
      n = new Date(date + "T12:00:00Z").getUTCDay();
    if (n > 0 && n < 6) return date;
  }
  throw Error("weekday missing");
};
const nextWeekday = (month, after) => {
  for (let day = Number(after.slice(-2)) + 1; day <= 28; day++) {
    const date = dayInMonth(month, day),
      n = new Date(date + "T12:00:00Z").getUTCDay();
    if (n > 0 && n < 6) return date;
  }
  throw Error("next weekday missing");
};

test("shared and personal days recalculate actual percentages while preserving allocated hours", () => {
  const d = fixture(),
    month = currentPlanningMonth(),
    date = weekday(month),
    key = "r|p|" + month;
  const startHours = personHoursInMonth(month, "r");
  applyChanges(d, admin, [
    {
      kind: "actual",
      id: key,
      value: { unit: "percent", value: 50 },
      revision: 0,
    },
  ]);
  const amount = d.actualAllocations[key];
  assert.equal(amount, startHours / 2 / DEFAULT_MONTHLY_HOURS);
  applyChanges(d, employee, [
    {
      kind: "personDay",
      id: "r|" + date,
      value: { type: "leave", hours: 2.5, label: "İzin" },
      revision: 0,
    },
  ]);
  assert.equal(d.actualAllocations[key], amount);
  assert.equal(
    d.actualPercentEntries[key],
    ((amount * DEFAULT_MONTHLY_HOURS) / (startHours - 2.5)) * 100,
  );
  assert.equal(d.revisions["actual:" + key], 2);
  assert.equal(
    validate(structuredClone(d)).personCalendar["r|" + date].hours,
    2.5,
  );
  assert.throws(
    () =>
      applyChanges(d, other, [
        {
          kind: "personDay",
          id: "r|" + date,
          operation: "delete",
          revision: 1,
        },
      ]),
    (error) => error.status === 403,
  );
  assert.throws(
    () =>
      applyChanges(d, employee, [
        { kind: "calendar", id: "shared", value: {}, revision: 0 },
      ]),
    (error) => error.status === 403,
  );
  assert.throws(
    () =>
      applyChanges(d, { _id: "manager", role: "manager", leaders: ["L"] }, [
        { kind: "calendar", id: "shared", value: {}, revision: 0 },
      ]),
    (error) => error.status === 403,
  );
  applyChanges(d, admin, [
    {
      kind: "calendar",
      id: "shared",
      value: { [date]: { type: "official", label: "Tatil", fraction: 1 } },
      revision: 0,
    },
  ]);
  assert.equal(d.actualAllocations[key], amount);
  assert.equal(
    d.actualPercentEntries[key],
    ((amount * DEFAULT_MONTHLY_HOURS) / (startHours - 9)) * 100,
  );
  applyChanges(d, admin, [
    { kind: "workedHours", id: "r|" + month, value: 220, revision: 0 },
  ]);
  const manualPercent = d.actualPercentEntries[key];
  applyChanges(d, employee, [
    { kind: "personDay", id: "r|" + date, operation: "delete", revision: 1 },
  ]);
  assert.equal(d.actualPercentEntries[key], manualPercent);
  assert.equal(d.actualAllocations[key], amount);
});

test("training counts toward distributed percentage without reducing hours; leave reduces even manual hours", () => {
  const d = fixture(),
    month = currentPlanningMonth(),
    date = weekday(month),
    leaveDate = nextWeekday(month, date),
    key = "r|p|" + month;
  const base = personHoursInMonth(month, "r");
  applyChanges(d, employee, [
    {
      kind: "personDay",
      id: "r|" + date,
      value: { type: "training", hours: 3, label: "Eğitim" },
      revision: 0,
    },
  ]);
  assert.equal(
    personHoursInMonth(month, "r", d.workCalendar, d.personCalendar),
    base,
  );
  assert.equal(
    trainingHoursInMonth(month, "r", d.workCalendar, d.personCalendar),
    3,
  );
  assert.throws(
    () =>
      applyChanges(structuredClone(d), admin, [
        {
          kind: "actual",
          id: key,
          value: { unit: "percent", value: 100 },
          revision: 0,
        },
      ]),
    /%100/,
  );
  applyChanges(d, admin, [
    {
      kind: "actual",
      id: key,
      value: { unit: "percent", value: 40 },
      revision: 0,
    },
  ]);
  const projectAmount = d.actualAllocations[key];
  const distributedPercent =
    ((projectAmount + 3 / DEFAULT_MONTHLY_HOURS) /
      (base / DEFAULT_MONTHLY_HOURS)) *
    100;
  assert(distributedPercent > 40);
  applyChanges(d, admin, [
    { kind: "workedHours", id: "r|" + month, value: 220, revision: 0 },
  ]);
  applyChanges(d, employee, [
    {
      kind: "personDay",
      id: "r|" + leaveDate,
      value: { type: "leave", hours: 4, label: "Yıllık izin" },
      revision: 0,
    },
  ]);
  assert.equal(
    personHoursInMonth(month, "r", d.workCalendar, d.personCalendar),
    base - 4,
  );
  assert.equal(
    trainingHoursInMonth(month, "r", d.workCalendar, d.personCalendar),
    3,
  );
  assert.equal(
    d.actualPercentEntries[key],
    ((projectAmount * DEFAULT_MONTHLY_HOURS) / 216) * 100,
  );
});

test("shared holidays and personal absences persist with revisions after restart", async () => {
  const dir = await fs.mkdtemp(path.resolve("tests/local-calendar-"));
  const env = {
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "calendar.sqlite"),
  };
  let store = new Store({ env });
  try {
    await store.connect();
    await store.bootstrapUser({
      _id: "root-admin",
      username: "calendar.admin",
      name: "Admin",
      role: "admin",
      leaders: [],
      active: true,
      password: await hashPassword("Calendar-test-284!"),
      revision: 1,
      version: 1,
    });
    const active = await store.findUser({ id: "root-admin" });
    await store.mutate(active, (d) => {
      const team = d.teams[0];
      d.resources.push({
        id: "r",
        name: "Çalışan",
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
      });
    });
    await store.mutate(active, (d) =>
      applyChanges(d, active, [
        {
          kind: "calendar",
          id: "shared",
          value: {
            "2026-09-01": { type: "official", label: "Tatil", fraction: 1 },
          },
          revision: 0,
        },
        {
          kind: "personDay",
          id: "r|2026-09-02",
          value: { type: "training", hours: 3, label: "Eğitim" },
          revision: 0,
        },
        {
          kind: "personDay",
          id: "r|2026-09-02|leave",
          value: { type: "leave", hours: 2, label: "İzin" },
          revision: 0,
        },
      ]),
    );
    await store.close();
    store = new Store({ env });
    await store.connect();
    const reloaded = (await store.read()).data;
    assert.equal(reloaded.workCalendar["2026-09-01"].label, "Tatil");
    assert.equal(reloaded.personCalendar["r|2026-09-02"].hours, 3);
    assert.equal(reloaded.personCalendar["r|2026-09-02|leave"].hours, 2);
    assert.equal(reloaded.revisions["personDay:r|2026-09-02|leave"], 1);
    assert.equal(reloaded.revisions["calendar:shared"], 1);
    assert.equal(reloaded.revisions["personDay:r|2026-09-02"], 1);
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("migration recalculates old training percentages without changing project hours", async () => {
  const dir = await fs.mkdtemp(path.resolve("tests/local-training-migration-"));
  const env = {
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "plan.sqlite"),
  };
  let store = new Store({ env });
  try {
    await store.connect();
    await store.bootstrapUser({
      _id: "root-admin",
      username: "migration.admin",
      name: "Admin",
      role: "admin",
      leaders: [],
      active: true,
      password: await hashPassword("Migration-test-284!"),
      revision: 1,
      version: 1,
    });
    const active = await store.findUser({ id: "root-admin" }),
      month = "2026-09",
      date = "2026-09-02",
      amount = 0.5;
    const automatic = personHoursInMonth(month, "r");
    await store.mutate(active, (d) => {
      const team = d.teams[0];
      d.projects.push({
        id: "p",
        name: "Proje",
        start: "2026-01",
        end: "2026-12",
        phases: {},
      });
      d.resources.push({
        id: "r",
        name: "Çalışan",
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
      });
      d.personCalendar = {
        ["r|" + date]: { type: "training", hours: 3, label: "Eğitim" },
      };
      d.actualAllocations = { ["r|p|" + month]: amount };
      d.actualPercentEntries = {
        ["r|p|" + month]: ((amount * DEFAULT_MONTHLY_HOURS) / automatic) * 100,
      };
    });
    await store.transaction(async (c) => {
      await c.query(
        "UPDATE kp_actual_percent_entries SET percent=@p0 WHERE resource_id=@p1 AND project_id=@p2 AND month=@p3",
        [
          ((amount * DEFAULT_MONTHLY_HOURS) / (automatic - 3)) * 100,
          "r",
          "p",
          month,
        ],
      );
      await c.query("DELETE FROM kp_schema_migrations WHERE version=22");
    });
    await store.close();
    store = new Store({ env });
    await store.connect();
    const data = (await store.read()).data;
    assert.equal(data.actualAllocations["r|p|" + month], amount);
    assert(
      Math.abs(
        data.actualPercentEntries["r|p|" + month] -
          ((amount * DEFAULT_MONTHLY_HOURS) / automatic) * 100,
      ) < 1e-10,
    );
    assert.equal(data.revisions["actual:r|p|" + month], 1);
    assert.equal(
      (
        await store.db.query(
          "SELECT MAX(version) AS version FROM kp_schema_migrations",
        )
      ).rows[0].version,
      schemaVersion,
    );
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

for (const type of ["training", "leave"])
  test(`adding ${type} after a full allocation rejects monthly overbooking`, () => {
    const d = fixture(),
      month = currentPlanningMonth(),
      date = weekday(month),
      key = "r|p|" + month;
    applyChanges(d, admin, [
      {
        kind: "actual",
        id: key,
        value: { unit: "percent", value: 100 },
        revision: 0,
      },
    ]);
    assert.throws(
      () =>
        applyChanges(d, employee, [
          {
            kind: "personDay",
            id: "r|" + date,
            value: { type, hours: 3, label: "Test" },
            revision: 0,
          },
        ]),
      /%100/,
    );
  });

test("adding a shared holiday after a full allocation rejects overbooking", () => {
  const d = fixture(),
    month = currentPlanningMonth(),
    date = weekday(month),
    key = "r|p|" + month;
  applyChanges(d, admin, [
    {
      kind: "actual",
      id: key,
      value: { unit: "hours", value: personHoursInMonth(month, "r") },
      revision: 0,
    },
  ]);
  assert.throws(
    () =>
      applyChanges(d, admin, [
        {
          kind: "calendar",
          id: "shared",
          value: { [date]: { type: "company", label: "Tatil", fraction: 1 } },
          revision: 0,
        },
      ]),
    /%100/,
  );
});

test("batch allocation transfer checks final totals in either order", () => {
  const month = currentPlanningMonth(),
    hours = personHoursInMonth(month, "r");
  for (const reverse of [false, true]) {
    const d = fixture();
    d.projects.push({ ...d.projects[0], id: "q" });
    applyChanges(d, admin, [
      {
        kind: "actual",
        id: "r|p|" + month,
        value: { unit: "hours", value: hours },
        revision: 0,
      },
    ]);
    const changes = [
      {
        kind: "actual",
        id: "r|q|" + month,
        value: { unit: "hours", value: hours },
        revision: 0,
      },
      { kind: "actual", id: "r|p|" + month, operation: "delete", revision: 1 },
    ];
    applyChanges(d, admin, reverse ? changes.reverse() : changes);
    assert.equal(
      d.actualAllocations["r|q|" + month],
      hours / DEFAULT_MONTHLY_HOURS,
    );
    assert.equal(d.actualAllocations["r|p|" + month], undefined);
  }
});

test("calendar plus corrected allocation is atomic and does not invalidate input revisions", () => {
  const month = currentPlanningMonth(),
    date = weekday(month),
    key = "r|p|" + month,
    base = personHoursInMonth(month, "r");
  for (const reverse of [false, true]) {
    const d = fixture();
    applyChanges(d, admin, [
      {
        kind: "actual",
        id: key,
        value: { unit: "percent", value: 100 },
        revision: 0,
      },
    ]);
    const changes = [
      {
        kind: "calendar",
        id: "shared",
        value: { [date]: { type: "company", label: "Tatil", fraction: 1 } },
        revision: 0,
      },
      {
        kind: "actual",
        id: key,
        value: { unit: "hours", value: base - 9 },
        revision: 1,
      },
    ];
    applyChanges(d, admin, reverse ? changes.reverse() : changes);
    assert.equal(d.actualAllocations[key], (base - 9) / DEFAULT_MONTHLY_HOURS);
    assert.equal(d.revisions["actual:" + key], 2);
  }
});

test("personal hours use the same half-hour rule in API changes and data validation", () => {
  const month = currentPlanningMonth(),
    date = weekday(month),
    id = "r|" + date;
  for (const hours of [0.1, 0.25, 0.75, 9.5]) {
    const d = fixture();
    assert.throws(() =>
      applyChanges(d, employee, [
        {
          kind: "personDay",
          id,
          value: { type: "leave", hours, label: "" },
          revision: 0,
        },
      ]),
    );
    assert.throws(() =>
      validate({
        ...fixture(),
        personCalendar: { [id]: { type: "leave", hours, label: "" } },
      }),
    );
  }
  for (const hours of [0.5, 2.5, 9])
    assert.doesNotThrow(() =>
      applyChanges(fixture(), employee, [
        {
          kind: "personDay",
          id,
          value: { type: "leave", hours, label: "" },
          revision: 0,
        },
      ]),
    );
});

test("training-only totals are validated when manual monthly hours are reduced", () => {
  const d = fixture(),
    month = currentPlanningMonth(),
    date = weekday(month);
  applyChanges(d, employee, [
    {
      kind: "personDay",
      id: "r|" + date,
      value: { type: "training", hours: 3, label: "" },
      revision: 0,
    },
  ]);
  assert.throws(
    () =>
      applyChanges(d, admin, [
        { kind: "workedHours", id: "r|" + month, value: 2, revision: 0 },
      ]),
    /%100/,
  );
});

test("failed overbooking changes roll back calendar data, revisions and generation", async () => {
  const dir = await fs.mkdtemp(path.resolve("tests/local-calendar-rollback-"));
  const store = new Store({
    env: {
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "calendar.sqlite"),
    },
  });
  try {
    await store.connect();
    await store.bootstrapUser({
      _id: "root-admin",
      username: "rollback.admin",
      name: "Admin",
      role: "admin",
      leaders: [],
      active: true,
      password: await hashPassword("Calendar-rollback-284!"),
      revision: 1,
      version: 1,
    });
    const active = await store.findUser({ id: "root-admin" }),
      month = currentPlanningMonth(),
      date = weekday(month);
    await store.mutate(active, (d) => {
      const team = d.teams[0];
      d.projects.push({
        id: "p",
        name: "Proje",
        start: "2025-01",
        end: "2030-12",
        phases: {},
      });
      d.resources.push({
        id: "r",
        name: "Çalışan",
        note: "",
        versions: [
          {
            effective: "2025-01",
            team: team.id,
            lead: team.lead,
            status: "Aktif Çalışan",
            included: true,
            start: "2025-01-01",
            end: "",
            amount: 1,
          },
        ],
      });
    });
    await store.mutate(active, (d) =>
      applyChanges(d, active, [
        {
          kind: "actual",
          id: "r|p|" + month,
          value: { unit: "percent", value: 100 },
          revision: 0,
        },
      ]),
    );
    const before = await store.read();
    await assert.rejects(
      () =>
        store.mutate(active, (d) =>
          applyChanges(d, active, [
            {
              kind: "personDay",
              id: "r|" + date,
              value: { type: "training", hours: 3, label: "" },
              revision: 0,
            },
          ]),
        ),
      /%100/,
    );
    assert.deepEqual(await store.read(), before);
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("leave and training coexist on one date while legacy records keep IDs and revisions", () => {
  const d = fixture(),
    month = currentPlanningMonth(),
    date = weekday(month),
    legacy = "r|" + date,
    training = legacy + "|training",
    base = personHoursInMonth(month, "r");
  applyChanges(d, employee, [
    {
      kind: "personDay",
      id: legacy,
      value: { type: "leave", hours: 2, label: "İzin" },
      revision: 0,
    },
  ]);
  applyChanges(d, employee, [
    {
      kind: "personDay",
      id: training,
      value: { type: "training", hours: 3, label: "Eğitim" },
      revision: 0,
    },
  ]);
  assert.equal(Object.keys(d.personCalendar).length, 2);
  assert.equal(personHoursInMonth(month, "r", {}, d.personCalendar), base - 2);
  assert.equal(trainingHoursInMonth(month, "r", {}, d.personCalendar), 3);
  assert.equal(d.revisions["personDay:" + legacy], 1);
  assert.throws(
    () =>
      applyChanges(structuredClone(d), employee, [
        {
          kind: "personDay",
          id: legacy,
          value: { type: "training", hours: 2, label: "" },
          revision: 1,
        },
      ]),
    /ayrı kayıtlar/,
  );
  applyChanges(d, employee, [
    { kind: "personDay", id: training, operation: "delete", revision: 1 },
  ]);
  assert.equal(d.personCalendar[legacy].hours, 2);
  assert.equal(trainingHoursInMonth(month, "r", {}, d.personCalendar), 0);
});

test("personal day type, daily total and legacy duplicate checks are enforced on the server", () => {
  const d = fixture(),
    month = currentPlanningMonth(),
    date = weekday(month),
    key = "r|" + date;
  applyChanges(d, employee, [
    {
      kind: "personDay",
      id: key,
      value: { type: "leave", hours: 6, label: "" },
      revision: 0,
    },
  ]);
  assert.throws(
    () =>
      applyChanges(structuredClone(d), employee, [
        {
          kind: "personDay",
          id: key + "|training",
          value: { type: "training", hours: 4, label: "" },
          revision: 0,
        },
      ]),
    /günde 9/,
  );
  assert.throws(
    () =>
      applyChanges(structuredClone(d), employee, [
        {
          kind: "personDay",
          id: key + "|training",
          value: { type: "leave", hours: 1, label: "" },
          revision: 0,
        },
      ]),
    /eşleşmiyor/,
  );
  assert.throws(
    () =>
      applyChanges(structuredClone(d), employee, [
        {
          kind: "personDay",
          id: key + "|leave",
          value: { type: "leave", hours: 1, label: "" },
          revision: 0,
        },
      ]),
    /birden fazla/,
  );
});
