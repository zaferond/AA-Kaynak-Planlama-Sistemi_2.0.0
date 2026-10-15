import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../backend/auth.mjs";
import {
  applyChanges,
  applyLeaderChange,
  reset,
} from "../backend/operations.mjs";
import {
  scopeData,
  validate,
  currentPlanningMonth,
  actualTeamTotalIndex,
  buildCapacityIndex,
  activeTeamMembers,
  visibleActualVersion,
  personHoursInMonth,
} from "../backend/domain/index.mjs";
const admin = { _id: "root-admin", role: "admin", leaders: [] };
const fixture = () => ({
  teams: [
    { id: "t", name: "Takım", lead: "A", excelCapacity: 0, catalog: true },
    { id: "b", name: "Diğer", lead: "B", excelCapacity: 0, catalog: true },
  ],
  projects: [
    { id: "p", name: "Proje", start: "2026-01", end: "2030-12", phases: {} },
  ],
  resources: [],
  allocations: {},
  revisions: {},
  leaders: ["A", "B"],
  catalogVersion: 2,
});
test("Salted scrypt password, wrong password and minimum length", async () => {
  const a = await hashPassword("Example-test-347!"),
    b = await hashPassword("Example-test-347!");
  assert.notEqual(a.hash, b.hash);
  assert.equal(await verifyPassword("Example-test-347!", a), true);
  assert.equal(await verifyPassword("wrong", a), false);
  await assert.rejects(() => hashPassword("short"));
});
test("Leadership scope, manager write restrictions and stale version", () => {
  const d = fixture(),
    u = { _id: "n", role: "manager", leaders: ["A"] };
  applyChanges(d, u, [
    { kind: "allocation", id: "t|p|2026-09", value: 0.5, revision: 0 },
  ]);
  assert.equal(d.allocations["t|p|2026-09"], 0.5);
  assert.throws(
    () =>
      applyChanges(d, u, [
        { kind: "allocation", id: "b|p|2026-09", value: 1, revision: 0 },
      ]),
    (e) => e.status === 403,
  );
  assert.throws(
    () =>
      applyChanges(d, u, [
        { kind: "allocation", id: "t|p|2026-09", value: 2, revision: 0 },
      ]),
    (e) => e.status === 409,
  );
  assert.equal(scopeData(d, { ...u, id: "n" }).teams.length, 2);
});
test("A normal user with no selected leadership can view every leadership but cannot allocate", () => {
  const d = fixture();
  d.allocations["t|p|2026-09"] = 0.5;
  d.allocations["b|p|2026-09"] = 0.75;
  const user = { _id: "viewer", id: "viewer", role: "normal", leaders: [] };
  const scoped = scopeData(d, user);
  assert.deepEqual(scoped.leaders, ["A", "B"]);
  assert.deepEqual(
    scoped.teams.map((team) => team.id),
    ["t", "b"],
  );
  assert.deepEqual(scoped.allocations, d.allocations);
  assert.throws(
    () =>
      applyChanges(d, user, [
        { kind: "allocation", id: "t|p|2026-09", value: 1, revision: 0 },
      ]),
    (error) => error.status === 403,
  );
});
test("Moving a team updates linked employee leadership", () => {
  const d = fixture();
  d.resources = [
    {
      id: "r",
      name: "Çalışan",
      note: "",
      versions: [
        {
          team: "t",
          lead: "A",
          effective: "2026-01",
          status: "Aktif Çalışan",
          included: true,
          start: "",
          end: "",
          amount: 1,
        },
      ],
    },
  ];
  applyChanges(d, admin, [
    { kind: "team", id: "t", value: { ...d.teams[0], lead: "B" }, revision: 0 },
  ]);
  assert.equal(d.resources[0].versions[0].lead, "B");
  assert.equal(d.revisions["resource:r"], 1);
  assert.equal(
    scopeData(d, { id: "normal", role: "normal", leaders: ["B"] }).resources
      .length,
    1,
  );
});
test("Leadership edit preserves teams, employees and user scopes; used teams cannot be deleted", async () => {
  const d = fixture();
  d.leaderManagers = { A: "İlk Yönetici", B: "Diğer Yönetici" };
  d.resources = [
    {
      id: "r",
      name: "Çalışan",
      note: "",
      versions: [
        {
          team: "t",
          lead: "A",
          effective: "2026-01",
          status: "Aktif Çalışan",
          included: true,
          start: "",
          end: "",
          amount: 1,
        },
      ],
    },
  ];
  const calls = [];
  const c = {
    query: async () => ({ rows: [{ user_id: "u", leader_name: "A" }] }),
    upsert: async (name, rows) => calls.push(["upsert", name, rows]),
    remove: async (name, rows) => calls.push(["remove", name, rows]),
  };
  await applyLeaderChange(
    d,
    admin,
    { action: "rename", name: "A", newName: "Yeni A", generation: 4 },
    c,
    4,
  );
  assert(d.leaders.includes("Yeni A"));
  assert.equal(d.leaderManagers["Yeni A"], "İlk Yönetici");
  assert.equal(d.leaderManagers.A, undefined);
  assert.equal(d.teams[0].lead, "Yeni A");
  assert.equal(d.resources[0].versions[0].lead, "Yeni A");
  assert(
    calls.some(
      ([operation, name, rows]) =>
        operation === "upsert" &&
        name === "user_leaders" &&
        rows[0].leader_name === "Yeni A",
    ),
  );
  await applyLeaderChange(
    d,
    admin,
    {
      action: "update",
      name: "Yeni A",
      newName: "Yeni A",
      managerName: "Yeni Yönetici",
      generation: 5,
    },
    c,
    5,
  );
  assert.equal(d.leaderManagers["Yeni A"], "Yeni Yönetici");
  assert.deepEqual(
    scopeData(d, { id: "normal", role: "normal", leaders: ["Yeni A"] })
      .leaderManagers,
    { "Yeni A": "Yeni Yönetici" },
  );
  assert.throws(
    () =>
      applyChanges(d, admin, [
        {
          kind: "team",
          id: "t",
          operation: "delete",
          revision: d.revisions["team:t"],
        },
      ]),
    /Kullanılan takım/,
  );
  const empty = fixture();
  empty.leaderManagers = { B: "Silinecek Yönetici" };
  await applyLeaderChange(
    empty,
    admin,
    { action: "delete", name: "B", generation: 0 },
    { query: async () => ({ rows: [] }) },
    0,
  );
  assert(!empty.leaders.includes("B"));
  assert.equal(empty.leaderManagers.B, undefined);
  assert(!empty.teams.some((team) => team.lead === "B"));
});
test("Active job must have start, out of project allocations rejected", () => {
  const d = fixture();
  d.resources = [
    {
      id: "r",
      name: "İlan",
      note: "",
      versions: [
        {
          team: "t",
          effective: "2026-01",
          status: "Aktif İlan",
          included: true,
          start: "",
          end: "",
          amount: 1,
        },
      ],
    },
  ];
  assert.throws(() => validate(d), /İşbaşı Tarihi/);
  d.resources = [];
  assert.throws(
    () =>
      applyChanges(d, admin, [
        { kind: "allocation", id: "t|p|2031-01", value: 1, revision: 0 },
      ]),
    /tarihleri/,
  );
});
test("departed staff keep historical capacity and actual records regardless of dates", () => {
  const d = fixture();
  d.resources = [
    {
      id: "r",
      name: "Çalışan",
      note: "",
      versions: [
        {
          team: "t",
          lead: "A",
          effective: "2026-01",
          status: "Aktif Çalışan",
          included: true,
          start: "2026-01-01",
          end: "",
          amount: 1,
        },
        {
          team: "t",
          lead: "A",
          effective: "2026-09",
          status: "İşten Ayrıldı",
          included: true,
          start: "2026-01-01",
          end: "2026-06-15",
          amount: 1,
        },
      ],
    },
  ];
  const checked = validate(d);
  assert.equal(checked.resources[0].versions[0].end, "2026-06-15");
  const index = buildCapacityIndex(checked, [
    "2026-01",
    "2026-06",
    "2026-07",
    "2026-09",
  ]);
  assert.equal(index["t|2026-01"].current, 1);
  assert.equal(index["t|2026-06"].current, 15 / 30);
  assert.equal(index["t|2026-07"].current, 0);
  assert.equal(index["t|2026-09"].current, 0);
  assert.deepEqual(activeTeamMembers(checked, "2026-09"), {});
  assert.equal(
    visibleActualVersion(checked.resources[0], "2026-06", "2026-09"),
    undefined,
  );
  assert.equal(
    visibleActualVersion(checked.resources[0], "2026-06", "2026-06")?.status,
    "Aktif Çalışan",
  );
  checked.actualAllocations = { "r|p|2026-06": 0.25 };
  assert.doesNotThrow(() => validate(checked));
  checked.actualAllocations["r|p|2026-07"] = 0.25;
  assert.doesNotThrow(() => validate(checked));
  d.resources[0].versions[1].end = "";
  assert.throws(() => validate(d), /işbaşı ve işten ayrılış/);
});
test("actual distribution shows only current working statuses", () => {
  for (const status of [
    "Aktif Çalışan",
    "Gear Up",
    "SAAT Ücretli Ofis Ç.",
    "Aktif İlan",
    "Pasif İlan",
    "İşten Ayrıldı",
  ]) {
    const resource = {
      id: status,
      name: status,
      versions: [
        {
          effective: "2026-01",
          team: "t",
          status,
          included: false,
          start: "2027-01-01",
          end: status === "İşten Ayrıldı" ? "2027-12-31" : "",
          amount: 1,
        },
      ],
    };
    assert.equal(
      !!visibleActualVersion(resource, "2026-06", "2026-09"),
      ["Aktif Çalışan", "Gear Up", "SAAT Ücretli Ofis Ç."].includes(status),
    );
  }
});
test("changing status or planning inclusion preserves actual entries and worked hours", () => {
  const saved = { "r|p|2026-09": 0.5 };
  for (const [status, included, start, end] of [
    ["İşten Ayrıldı", true, "2026-01-01", "2026-09-15"],
    ["Aktif İlan", false, "", ""],
    ["Pasif İlan", false, "", ""],
    ["Aktif Çalışan", false, "2026-01-01", ""],
  ]) {
    const d = fixture();
    d.resources = [
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
    ];
    d.actualAllocations = { ...saved };
    d.actualPercentEntries = { "r|p|2026-09": 50 };
    d.actualWorkedHours = { "r|2026-09": 180 };
    applyChanges(d, admin, [
      {
        kind: "resource",
        id: "r",
        revision: 0,
        value: {
          ...d.resources[0],
          versions: [
            {
              effective: "2026-01",
              team: "t",
              lead: "A",
              status,
              included,
              start,
              end,
              amount: 1,
            },
          ],
        },
      },
    ]);
    assert.deepEqual(d.actualAllocations, saved);
    assert.deepEqual(d.actualPercentEntries, { "r|p|2026-09": 50 });
    assert.deepEqual(d.actualWorkedHours, { "r|2026-09": 180 });
  }
});
test("Actual distribution accepts the Istanbul current month and rejects future months", () => {
  assert.equal(
    currentPlanningMonth(new Date("2026-09-30T20:59:00Z")),
    "2026-09",
  );
  assert.equal(
    currentPlanningMonth(new Date("2026-09-30T21:00:00Z")),
    "2026-10",
  );
  const d = fixture();
  d.projects[0].end = "2199-12";
  d.resources = [
    {
      id: "r",
      name: "Çalışan",
      note: "",
      versions: [
        {
          team: "t",
          effective: "2026-01",
          status: "Aktif Çalışan",
          included: true,
          start: "",
          end: "",
          amount: 1,
        },
      ],
    },
  ];
  const current = currentPlanningMonth();
  const [year, month] = current.split("-").map(Number);
  const future = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
  assert.throws(
    () =>
      applyChanges(d, admin, [
        { kind: "actual", id: "r|p|" + future, value: 1, revision: 0 },
      ]),
    /Gelecek aylara/,
  );
  applyChanges(d, admin, [
    { kind: "actual", id: "r|p|" + current, value: 0.5, revision: 0 },
  ]);
  assert.equal(d.actualAllocations["r|p|" + current], 0.5);
  applyChanges(d, admin, [
    { kind: "allocation", id: "t|p|" + future, value: 1, revision: 0 },
  ]);
  assert.equal(d.allocations["t|p|" + future], 1);
});
test("A person's monthly actual distribution cannot exceed 100 percent across projects", () => {
  const d = fixture(),
    month = "2026-09";
  d.projects.push({
    id: "p2",
    name: "İkinci Proje",
    start: "2026-01",
    end: "2030-12",
    phases: {},
  });
  d.resources = [
    {
      id: "r",
      name: "Çalışan",
      note: "",
      versions: [
        {
          team: "t",
          effective: "2026-01",
          status: "Aktif Çalışan",
          included: true,
          start: "",
          end: "",
          amount: 1,
        },
      ],
    },
  ];
  const change = (project, value, revision = 0) => ({
    kind: "actual",
    id: `r|${project}|${month}`,
    value,
    revision,
  });
  const withDefaultHours = structuredClone(d);
  applyChanges(withDefaultHours, admin, [
    change("p", { unit: "percent", value: 100 }),
  ]);
  const autoCapacity = personHoursInMonth(month, "r") / 180;
  assert.equal(
    withDefaultHours.actualAllocations[`r|p|${month}`],
    autoCapacity,
  );
  applyChanges(withDefaultHours, admin, [
    { kind: "workedHours", id: `r|${month}`, value: 220, revision: 0 },
  ]);
  assert.equal(
    withDefaultHours.actualAllocations[`r|p|${month}`],
    autoCapacity,
  );
  assert(
    Math.abs(
      withDefaultHours.actualPercentEntries[`r|p|${month}`] -
        ((autoCapacity * 180) / 220) * 100,
    ) < 1e-10,
  );
  assert.throws(
    () =>
      applyChanges(structuredClone(withDefaultHours), admin, [
        { kind: "workedHours", id: `r|${month}`, value: 160, revision: 1 },
      ]),
    /%100/,
  );
  applyChanges(d, admin, [
    { kind: "workedHours", id: `r|${month}`, value: 220, revision: 0 },
  ]);
  assert.throws(
    () =>
      applyChanges(structuredClone(d), admin, [
        change("p", { unit: "percent", value: 101 }),
      ]),
    /%100/,
  );
  applyChanges(d, admin, [change("p", { unit: "percent", value: 60 })]);
  assert.throws(
    () =>
      applyChanges(structuredClone(d), admin, [
        change("p2", { unit: "percent", value: 50 }),
      ]),
    /%100/,
  );
  assert.throws(
    () =>
      applyChanges(structuredClone(d), admin, [
        change("p2", { unit: "hours", value: 89 }),
      ]),
    /%100/,
  );
  applyChanges(d, admin, [change("p2", { unit: "hours", value: 88 })]);
  assert.throws(
    () =>
      applyChanges(structuredClone(d), admin, [
        { kind: "workedHours", id: `r|${month}`, value: 198, revision: 1 },
      ]),
    /%100/,
  );
  assert.equal(d.actualPercentEntries[`r|p|${month}`], 60);
  assert.equal(d.actualAllocations[`r|p2|${month}`], 88 / 180);
});
test("Past actual months use the first known employee assignment", () => {
  const d = fixture();
  d.resources = [
    {
      id: "r",
      name: "Çalışan",
      note: "",
      versions: [
        {
          team: "t",
          effective: "2026-09",
          status: "Aktif Çalışan",
          included: true,
          start: "2026-09-01",
          end: "",
          amount: 1,
        },
      ],
    },
  ];
  applyChanges(d, admin, [
    { kind: "actual", id: "r|p|2026-01", value: 0.5, revision: 0 },
  ]);
  assert.equal(d.actualAllocations["r|p|2026-01"], 0.5);
  const scoped = scopeData(d, { id: "normal", role: "normal", leaders: ["A"] });
  assert.equal(scoped.actualTeamTotals["t|p|2026-01"], 0.5);
  assert.deepEqual(scoped.actualAllocations, {});
});
test("Actual totals follow each employee's team in the allocated month", () => {
  const d = fixture();
  d.resources = [
    {
      id: "r",
      name: "Çalışan",
      note: "",
      versions: [
        {
          team: "t",
          lead: "A",
          effective: "2026-01",
          status: "Aktif Çalışan",
          included: true,
          start: "",
          end: "",
          amount: 1,
        },
        {
          team: "b",
          lead: "B",
          effective: "2026-10",
          status: "Aktif Çalışan",
          included: true,
          start: "",
          end: "",
          amount: 1,
        },
      ],
    },
  ];
  d.actualAllocations = { "r|p|2026-09": 0.5, "r|p|2026-11": 0.75 };
  const totals = actualTeamTotalIndex(d);
  assert.equal(totals["t|p|2026-09"], 0.5);
  assert.equal(totals["b|p|2026-11"], 0.75);
  const scoped = scopeData(d, { id: "normal", role: "normal", leaders: ["A"] });
  assert.deepEqual(scoped.actualTeamTotals, { "t|p|2026-09": 0.5 });
});
test("Deleted record retains revision; stale reset cannot erase newer writes", () => {
  const d = fixture();
  const r = {
    id: "r",
    name: "Kaynak",
    note: "",
    versions: [
      {
        team: "t",
        effective: "2026-01",
        status: "Aktif Çalışan",
        included: true,
        start: "2026-01-01",
        end: "",
        amount: 1,
      },
    ],
  };
  applyChanges(d, admin, [
    { kind: "resource", id: "r", value: r, revision: 0 },
  ]);
  applyChanges(d, admin, [
    { kind: "resource", id: "r", operation: "delete", revision: 1 },
  ]);
  assert.equal(d.resources.length, 0);
  assert.throws(
    () =>
      applyChanges(d, admin, [
        { kind: "resource", id: "r", value: r, revision: 1 },
      ]),
    (e) => e.status === 409,
  );
  applyChanges(d, admin, [
    { kind: "allocation", id: "t|p|2026-09", value: 1, revision: 0 },
  ]);
  assert.throws(
    () => reset(d, admin, {}),
    (e) => e.status === 409,
  );
  reset(d, admin, { "allocation:t|p|2026-09": 1 });
  assert.deepEqual(d.allocations, {});
});

test("Normal user sees and edits only the linked employee's actual distribution", () => {
  const month = currentPlanningMonth();
  const d = fixture();
  d.resources = ["own", "other"].map((id) => ({
    id,
    name: id,
    note: "",
    versions: [
      {
        effective: "2026-01",
        team: "t",
        lead: "A",
        status: "Aktif Çalışan",
        included: true,
        start: "",
        end: "",
        amount: 1,
      },
    ],
  }));
  d.actualAllocations = { ["other|p|" + month]: 0.2 };
  d.actualWorkedHours = {};
  d.actualPercentEntries = {};
  const user = {
    _id: "normal",
    id: "normal",
    role: "normal",
    resourceId: "own",
    leaders: ["A"],
  };
  applyChanges(d, user, [
    {
      kind: "actual",
      id: "own|p|" + month,
      value: { unit: "percent", value: 40 },
      revision: 0,
    },
  ]);
  assert.equal(
    d.actualAllocations["own|p|" + month],
    (0.4 * personHoursInMonth(month, "own")) / 180,
  );
  const scoped = scopeData(d, user);
  assert.deepEqual(Object.keys(scoped.actualAllocations), ["own|p|" + month]);
  assert.equal(
    scoped.resources.find((resource) => resource.id === "own").name,
    "own",
  );
  assert.equal(
    scoped.resources.find((resource) => resource.id === "other").name,
    "",
  );
  assert(
    Math.abs(
      scoped.actualTeamTotals["t|p|" + month] -
        (0.2 + (0.4 * personHoursInMonth(month, "own")) / 180),
    ) < 1e-9,
  );
  assert.throws(
    () =>
      applyChanges(d, user, [
        { kind: "actual", id: "other|p|" + month, value: 0.5, revision: 0 },
      ]),
    (error) => error.status === 403,
  );
  assert.throws(
    () =>
      applyChanges(d, user, [
        { kind: "allocation", id: "t|p|" + month, value: 1, revision: 0 },
      ]),
    (error) => error.status === 403,
  );
});

test("Manager actual permissions follow leadership rather than planning status", () => {
  const month = currentPlanningMonth();
  const d = fixture();
  d.resources = [
    {
      id: "assigned",
      name: "Yetkili Çalışan",
      note: "",
      versions: [
        {
          effective: "2026-01",
          team: "t",
          lead: "A",
          status: "Aktif Çalışan",
          included: true,
          start: "",
          end: "",
          amount: 1,
        },
      ],
    },
    {
      id: "other",
      name: "Diğer Çalışan",
      note: "",
      versions: [
        {
          effective: "2026-01",
          team: "b",
          lead: "B",
          status: "Aktif Çalışan",
          included: true,
          start: "",
          end: "",
          amount: 1,
        },
      ],
    },
    {
      id: "excluded",
      name: "Hariç Çalışan",
      note: "",
      versions: [
        {
          effective: "2026-01",
          team: "t",
          lead: "A",
          status: "Aktif Çalışan",
          included: false,
          start: "",
          end: "",
          amount: 1,
        },
      ],
    },
  ];
  const manager = {
    _id: "manager",
    id: "manager",
    role: "manager",
    leaders: ["A"],
  };
  applyChanges(d, manager, [
    {
      kind: "actual",
      id: `assigned|p|${month}`,
      value: { unit: "percent", value: 30 },
      revision: 0,
    },
  ]);
  applyChanges(d, manager, [
    { kind: "workedHours", id: `assigned|${month}`, value: 200, revision: 0 },
  ]);
  assert.throws(
    () =>
      applyChanges(d, manager, [
        { kind: "actual", id: `other|p|${month}`, value: 0.2, revision: 0 },
      ]),
    (error) => error.status === 403,
  );
  assert.throws(
    () =>
      applyChanges(d, manager, [
        { kind: "workedHours", id: `other|${month}`, value: 180, revision: 0 },
      ]),
    (error) => error.status === 403,
  );
  applyChanges(d, manager, [
    { kind: "actual", id: `excluded|p|${month}`, value: 0.2, revision: 0 },
  ]);
  assert.equal(d.actualAllocations[`excluded|p|${month}`], 0.2);
  const scoped = scopeData(d, manager);
  assert.equal(
    scoped.resources.find((resource) => resource.id === "assigned").name,
    "Yetkili Çalışan",
  );
  assert.equal(
    scoped.resources.find((resource) => resource.id === "other").name,
    "",
  );
  assert.equal(
    scoped.actualAllocations[`assigned|p|${month}`],
    (0.3 * personHoursInMonth(month, "assigned")) / 180,
  );
  assert.equal(scoped.actualWorkedHours[`assigned|${month}`], 200);
  assert.equal(scoped.revisions[`actual:assigned|p|${month}`], 2);
  assert.equal(scoped.revisions[`workedHours:assigned|${month}`], 1);
  const viewOnly = scopeData(d, { ...manager, leaders: [] });
  assert.equal(
    viewOnly.resources.find((resource) => resource.id === "assigned").name,
    "",
  );
  assert.deepEqual(viewOnly.actualAllocations, {});
  assert.throws(
    () =>
      applyChanges(d, { ...manager, leaders: [] }, [
        { kind: "actual", id: `assigned|p|${month}`, value: 0.2, revision: 1 },
      ]),
    (error) => error.status === 403,
  );
});
