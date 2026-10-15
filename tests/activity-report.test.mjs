import test from "node:test";
import assert from "node:assert/strict";
import {
  buildActivityRows,
  activityValue,
} from "../frontend/src/features/activity-report/activity-report-data.ts";
import { scopeData } from "../shared/access.ts";
const teams = [
  { id: "t-b", name: "Zırh", lead: "B Liderliği" },
  { id: "t-a2", name: "Şasi", lead: "A Liderliği" },
  { id: "t-a1", name: "Aktarma", lead: "A Liderliği" },
];
const projects = [{ id: "p1" }, { id: "p2" }];
const version = (team = "t-a1", patch = {}) => ({
  effective: "2026-01",
  start: "2026-01-01",
  end: "",
  team,
  lead: teams.find((t) => t.id === team)?.lead || "",
  status: "Aktif Çalışan",
  included: true,
  amount: 1,
  ...patch,
});
const person = (id, name, versions) => ({ id, name, note: "", versions });
const fixture = () => ({
  teams,
  projects,
  leaders: ["A Liderliği", "B Liderliği"],
  resources: [person("a", "Çetin", [version()])],
  allocations: {},
  actualAllocations: { "a|p1|2026-01": 0.5, "a|p2|2026-01": 0.25 },
  revisions: {},
});
const rows = (data, months = ["2026-01"], selected = projects) =>
  buildActivityRows(data, teams, selected, months, "2026-10");

test("activity report sorts leadership, then teams, then Turkish employee names", () => {
  const data = fixture();
  data.resources = [
    person("z", "Zeynep", [version("t-a1")]),
    person("b", "Ayşe", [version("t-b")]),
    person("s", "Ali", [version("t-a2")]),
    person("a", "Çetin", [version()]),
  ];
  assert.deepEqual(
    rows(data).map((r) => r.resourceId),
    ["a", "z", "s", "b"],
  );
});

test("activity units reuse actual capacity, leave, holidays and training; projects filter only project activities", () => {
  const data = fixture();
  data.workCalendar = {
    "2026-01-01": { type: "official", label: "Synthetic holiday", fraction: 1 },
  };
  data.personCalendar = {
    "a|2026-01-02|leave": { type: "leave", hours: 9, label: "" },
    "a|2026-01-05|training": { type: "training", hours: 9, label: "" },
  };
  data.actualWorkedHours = { "a|2026-01": 180 };
  const cell = rows(data)[0].cells[0];
  assert.equal(cell.effectiveHours, 162);
  assert.equal(activityValue(cell, "hours"), 144);
  assert.equal(activityValue(cell, "days"), 16);
  assert.equal(activityValue(cell, "percent"), (144 / 162) * 100);
  assert.ok(
    Math.abs(
      activityValue(
        rows(data, ["2026-01"], [projects[0]])[0].cells[0],
        "hours",
      ) - 99,
    ) < 1e-9,
  );
  assert.equal(
    activityValue(rows(data, ["2026-01"], [])[0].cells[0], "hours"),
    9,
  );
});

test("before-start and departure labels preserve historical entries including the departure month", () => {
  const data = fixture();
  data.resources = [
    person("a", "Çetin", [
      version("t-a1", { start: "2026-02-10", end: "2026-04-15" }),
      version("t-a1", {
        effective: "2026-04",
        start: "2026-02-10",
        end: "2026-04-15",
        status: "İşten Ayrıldı",
      }),
    ]),
  ];
  data.actualAllocations = { "a|p1|2026-01": 0.5, "a|p1|2026-04": 0.25 };
  const cells = rows(data, ["2026-01", "2026-02", "2026-04", "2026-05"])[0]
    .cells;
  assert.deepEqual(
    cells.map((c) => c.state),
    ["before-start", "working", "departed", "departed"],
  );
  assert.equal(activityValue(cells[0], "hours"), 90);
  assert.equal(activityValue(cells[2], "hours"), 45);
  assert.equal(activityValue(cells[3], "hours"), null);
});

test("transfers report each month under its historical team without duplicating totals", () => {
  const data = fixture();
  data.resources = [
    person("a", "Çetin", [version(), version("t-b", { effective: "2026-02" })]),
  ];
  data.actualAllocations["a|p1|2026-02"] = 1;
  const result = rows(data, ["2026-01", "2026-02"]);
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((r) => r.cells.map((c) => c.totalFte)),
    [
      [0.75, 0],
      [0, 1],
    ],
  );
  assert.equal(result[0].cells[1].state, "other-team");
});

test("zero capacity, future months and rehiring do not fabricate percentages or departure labels", () => {
  const data = fixture();
  data.actualWorkedHours = { "a|2026-01": 0 };
  data.actualAllocations["a|p1|2026-11"] = 1;
  data.resources[0].versions.push(
    version("t-a1", {
      effective: "2026-02",
      status: "İşten Ayrıldı",
      end: "2026-02-01",
    }),
    version("t-a1", { effective: "2026-03", start: "2026-03-01", end: "" }),
  );
  const cells = rows(data, ["2026-01", "2026-02", "2026-03", "2026-11"])[0]
    .cells;
  assert.equal(activityValue(cells[0], "percent"), null);
  assert.equal(activityValue(cells[0], "hours"), 135);
  assert.equal(cells[1].state, "departed");
  assert.equal(cells[2].state, "working");
  assert.equal(cells[3].state, "future");
  assert.equal(activityValue(cells[3], "hours"), null);
});

test("API-scoped manager and normal snapshots retain only permitted named rows and values", () => {
  const data = fixture();
  data.resources.push(person("b", "Private colleague", [version("t-b")]));
  data.actualAllocations["b|p1|2026-01"] = 1;
  const manager = scopeData(data, {
    id: "m",
    role: "manager",
    leaders: ["A Liderliği"],
    resourceId: "",
  });
  assert.deepEqual(
    buildActivityRows(
      manager,
      manager.teams,
      projects,
      ["2026-01"],
      "2026-10",
    ).map((r) => r.resourceId),
    ["a"],
  );
  const normal = scopeData(data, {
    id: "n",
    role: "normal",
    leaders: ["A Liderliği"],
    resourceId: "a",
  });
  assert.deepEqual(
    buildActivityRows(
      normal,
      normal.teams,
      projects,
      ["2026-01"],
      "2026-10",
      "a",
    ).map((r) => r.resourceId),
    ["a"],
  );
  assert.equal(
    buildActivityRows(
      normal,
      normal.teams,
      projects,
      ["2026-01"],
      "2026-10",
      "",
    ).length,
    0,
  );
});

test("activity visibility includes only current employee statuses, independent of inclusion or old actuals", () => {
  const data = fixture();
  const allowed = [
    "Aktif Çalışan",
    "Gear Up",
    "SAAT Ücretli Ofis Ç.",
    "İşten Ayrıldı",
  ];
  data.resources = allowed.map((status, i) =>
    person("allowed-" + i, "Worker " + i, [
      version("t-a1", {
        status,
        included: false,
        ...(status === "İşten Ayrıldı" ? { end: "2026-04-15" } : {}),
      }),
    ]),
  );
  for (const [i, status] of ["Aktif İlan", "Pasif İlan"].entries()) {
    const id = "listing-" + i;
    data.resources.push(
      person(id, "Listing " + i, [
        version(),
        version("t-a1", {
          effective: "2026-06",
          status,
          start: "2026-06-01",
          included: true,
        }),
      ]),
    );
    data.actualAllocations[id + "|p1|2026-01"] = 0.5;
  }
  data.actualAllocations["allowed-3|p1|2026-01"] = 0.25;
  const before = structuredClone(data);
  assert.deepEqual(
    rows(data)
      .map((r) => r.resourceId)
      .sort(),
    allowed.map((_, i) => "allowed-" + i),
  );
  assert.equal(
    activityValue(
      rows(data).find((r) => r.resourceId === "allowed-3").cells[0],
      "hours",
    ),
    45,
  );
  assert.deepEqual(
    data,
    before,
    "visibility must not modify or delete historical records",
  );
});

test("activity status uses the current month, not the report period or a scheduled future version", () => {
  const data = fixture();
  data.resources[0].versions.push(
    version("t-a1", {
      effective: "2026-11",
      status: "Pasif İlan",
      included: false,
    }),
  );
  assert.equal(rows(data, ["2026-01"]).length, 1);
  data.resources[0].versions.push(
    version("t-a1", {
      effective: "2026-09",
      status: "Aktif İlan",
      included: false,
    }),
  );
  assert.equal(rows(data, ["2026-01"]).length, 0);
  assert.equal(rows(data, ["2026-11"]).length, 0);
});

test("team activity scope ignores granted leaderships, limits peers and follows descendant leaders", async () => {
  const { activityReport } = await import("../backend/activity-report.mjs");
  const { directoryEmployees } =
    await import("../shared/employee-directory.ts");
  const data = fixture();
  data.leaderParents = { "B Liderliği": "A Liderliği" };
  data.resources.push(
    person("peer", "Team Peer", [version()]),
    person("sibling", "Sibling Team", [version("t-a2")]),
    person("child", "Child Leadership", [version("t-b")]),
  );
  data.personCalendar = {
    "peer|2026-01-05|leave": {
      type: "leave",
      hours: 9,
      label: "PRIVATE_PEER_LEAVE",
    },
  };
  data.resources[1].note = "PRIVATE_PEER_HR";
  const query = { start: "2026-01", count: 12, projects: [] };
  const own = {
    id: "own",
    role: "normal",
    leaders: ["B Liderliği"],
    resourceId: "a",
  };
  const peerReport = activityReport(data, own, query, "2026-10");
  assert.deepEqual(
    new Set(peerReport.rows.map((row) => row.resourceId)),
    new Set(["a", "peer"]),
  );
  assert(!JSON.stringify(peerReport).includes("PRIVATE_PEER"));
  assert.deepEqual(
    new Set(
      activityReport(
        data,
        { ...own, role: "manager" },
        query,
        "2026-10",
      ).rows.map((row) => row.resourceId),
    ),
    new Set(["a", "peer", "sibling", "child"]),
  );
  assert.deepEqual(
    activityReport(data, { ...own, resourceId: "" }, query, "2026-10").rows,
    [],
  );
  assert.deepEqual(
    activityReport(
      data,
      { ...own, role: "manager", resourceId: "" },
      query,
      "2026-10",
    ).rows,
    [],
  );
  assert.equal(
    directoryEmployees(data, "leader", "A Liderliği", "2026-10").length,
    4,
  );
  assert.equal(directoryEmployees(data, "team", "t-a1", "2026-10").length, 2);
});

test("hierarchy validation prevents self/cyclic/missing links and remaining report groups only top leaders", async () => {
  const { validateLeaderParents, topLeader } =
    await import("../shared/leadership-hierarchy.ts");
  const { selectWorkspaceScope } =
    await import("../frontend/src/features/workspace/workspace-selectors.ts");
  const data = fixture();
  data.leaderParents = { "B Liderliği": "A Liderliği" };
  assert.doesNotThrow(() => validateLeaderParents(data));
  assert.equal(topLeader(data, "B Liderliği"), "A Liderliği");
  const scope = selectWorkspaceScope(
    data,
    { role: "admin", leaders: [] },
    {
      leads: [],
      teamIds: [],
      projectIds: [],
      start: "2026-01",
      months: ["2026-01"],
      currentMonth: "2026-10",
    },
  );
  assert.equal(scope.leaderReportGroups.length, 1);
  assert.equal(scope.leaderReportGroups[0].name, "A Liderliği");
  assert.deepEqual(
    new Set(scope.leaderReportGroups[0].ids),
    new Set(teams.map((team) => team.id)),
  );
  for (const parents of [
    { "A Liderliği": "A Liderliği" },
    { "A Liderliği": "B Liderliği", "B Liderliği": "A Liderliği" },
    { "A Liderliği": "Missing" },
  ])
    assert.throws(() =>
      validateLeaderParents({ ...data, leaderParents: parents }),
    );
});
