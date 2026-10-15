import test from "node:test";
import assert from "node:assert/strict";
import {
  buildResourceReportGroups,
  resourceReportFilterSummary,
} from "../frontend/src/features/workspace/resource-report-data.ts";
import { scopeData } from "../shared/access.ts";
import { workingStatuses } from "../shared/model.ts";
const v = (override = {}) => ({
  effective: "2026-01",
  team: "a",
  lead: "A",
  status: "Aktif Çalışan",
  included: true,
  amount: 1,
  start: "2026-01-01",
  end: "",
  ...override,
});
const fixture = () => ({
  leaders: ["A", "B"],
  leaderManagers: { A: "Synthetic leader" },
  teams: [
    { id: "a", name: "Team A", lead: "A", managerName: "Synthetic team" },
    { id: "b", name: "Team B", lead: "B" },
  ],
  projects: [],
  revisions: {},
  allocations: {},
  actualAllocations: {},
  actualWorkedHours: {},
  actualPercentEntries: {},
  workCalendar: {},
  personCalendar: {},
  resources: [
    { id: "active", name: "Active", note: "", versions: [v()] },
    {
      id: "hourly",
      name: "Hourly",
      note: "",
      versions: [v({ status: workingStatuses[1], start: "2026-01-31" })],
    },
    {
      id: "gear",
      name: "Gear",
      note: "",
      versions: [v({ status: "Gear Up" })],
    },
    {
      id: "posting",
      name: "Posting",
      note: "",
      versions: [v({ status: "Aktif İlan" })],
    },
    {
      id: "excluded",
      name: "Excluded",
      note: "",
      versions: [v({ included: false })],
    },
    {
      id: "left",
      name: "Left",
      note: "",
      versions: [v({ status: "İşten Ayrıldı", end: "2026-01-15" })],
    },
    {
      id: "ended",
      name: "Ended",
      note: "",
      versions: [
        v({ effective: "2025-01", start: "2025-01-01", end: "2025-12-31" }),
      ],
    },
    {
      id: "future",
      name: "Future",
      note: "",
      versions: [v({ start: "2026-03-01" })],
    },
    {
      id: "transfer",
      name: "Transfer",
      note: "",
      versions: [v(), v({ effective: "2026-02", team: "b", lead: "B" })],
    },
  ],
});
const groups = [
  { name: "Team A", ids: ["a"], leader: "A" },
  { name: "Team B", ids: ["b"], leader: "B" },
];
const zeroMetric = () => ({ current: 0, total: 0 });
const rows = (
  data,
  start = "2026-01",
  metric = zeroMetric,
  teamReport = false,
) =>
  buildResourceReportGroups(
    data,
    data.teams,
    groups,
    start,
    ["2026-01", "2026-02"],
    metric,
    teamReport,
  );

test("report personnel uses the start-month version, inclusion, working status and nonzero date overlap", () => {
  const data = fixture(),
    before = structuredClone(data);
  assert.deepEqual(
    rows(data).map((g) => g.personnel),
    [4, 0],
  );
  assert.deepEqual(
    rows(data, "2026-02").map((g) => g.personnel),
    [3, 1],
  );
  assert.deepEqual(data, before);
});
test("report months retain order, all-project metrics and shortage classes including zero capacity", () => {
  const data = fixture(),
    calls = [];
  const metric = (ids, month) => {
    calls.push([ids, month]);
    if (ids[0] === "b") return { current: 0, total: 0.5 };
    return month === "2026-01"
      ? { current: 2, total: 2.1 }
      : { current: 2, total: 2.5 };
  };
  const result = rows(data, "2026-01", metric);
  assert.deepEqual(calls, [
    [["a"], "2026-01"],
    [["a"], "2026-02"],
    [["b"], "2026-01"],
    [["b"], "2026-02"],
  ]);
  assert(Math.abs(result[0].months[0].remaining + 0.1) < 1e-10);
  assert.equal(result[0].months[0].status, "over-warning");
  assert.deepEqual(result[0].months[1], {
    remaining: -0.5,
    status: "over-critical",
  });
  assert.deepEqual(result[1].months, [
    { remaining: -0.5, status: "over-critical" },
    { remaining: -0.5, status: "over-critical" },
  ]);
});
test("report managers derive only current employee responsibilities, never legacy manager names", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-12T09:00:00Z"),
  });
  const data = fixture();
  assert.deepEqual(
    rows(data).map((g) => g.manager),
    ["—", "—"],
  );
  assert.deepEqual(
    rows(data, "2026-01", zeroMetric, true).map((g) => g.manager),
    ["—", "—"],
  );
  data.teams.push({
    id: "leader-unit",
    name: "A",
    lead: "A",
    kind: "leadership",
  });
  data.resources.push({
    id: "leader",
    name: "Assigned Leader",
    note: "",
    versions: [
      v({ team: "leader-unit", assignmentRole: "leader", included: false }),
    ],
  });
  data.resources[0].versions[0].assignmentRole = "productOwner";
  assert.equal(rows(data)[0].manager, "Assigned Leader");
  assert.equal(rows(data, "2026-01", zeroMetric, true)[0].manager, "Active");
  const direct = buildResourceReportGroups(
    data,
    data.teams,
    [{ name: "A", ids: ["leader-unit"] }],
    "2026-01",
    [],
    zeroMetric,
    true,
  );
  assert.equal(direct[0].manager, "Assigned Leader");
  data.resources[0].versions.push(
    v({ effective: "2026-10", assignmentRole: "member" }),
  );
  assert.equal(rows(data, "2026-01", zeroMetric, true)[0].manager, "—");
  data.resources.at(-1).versions[0].end = "2026-10-11";
  assert.equal(rows(data)[0].manager, "—");
  assert.deepEqual(
    buildResourceReportGroups(
      data,
      data.teams,
      [],
      "2026-01",
      [],
      zeroMetric,
      false,
    ),
    [],
  );
});
test("root leadership does not borrow its child's leader or legacy manager", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-12T09:00:00Z"),
  });
  const data = fixture();
  data.leaderParents = { B: "A" };
  data.teams.push({
    id: "child-unit",
    name: "B",
    lead: "B",
    kind: "leadership",
  });
  data.resources.push({
    id: "child",
    name: "Child Leader",
    note: "",
    versions: [v({ team: "child-unit", lead: "B", assignmentRole: "leader" })],
  });
  assert.equal(rows(data)[0].manager, "—");
  assert.equal(rows(data)[1].manager, "Child Leader");
  const scoped = scopeData(data, {
    role: "manager",
    leaders: ["A"],
    resourceId: "",
  });
  assert.equal(rows(scoped)[0].manager, "—");
});
test("a manager sees all planning groups with personnel identities still scoped", () => {
  const full = fixture(),
    user = {
      id: "m",
      username: "m",
      name: "Synthetic manager",
      role: "manager",
      active: true,
      leaders: ["A"],
      resourceId: "",
    };
  const data = scopeData(full, user);
  const visible = groups.filter((g) =>
    g.ids.some((id) => data.teams.some((t) => t.id === id)),
  );
  const result = buildResourceReportGroups(
    data,
    data.teams,
    visible,
    "2026-01",
    ["2026-01"],
    zeroMetric,
    true,
  );
  assert.deepEqual(
    result.map((r) => r.name),
    ["Team A", "Team B"],
  );
  assert.equal(result[0].personnel, 4);
  assert(data.teams.some((t) => t.id === "b"));
});
test("resource report filter text preserves all/selection counts without mutating filters", () => {
  const leads = ["A", "B"],
    teams = ["a"],
    before = structuredClone({ leads, teams });
  assert.equal(
    resourceReportFilterSummary([], []),
    "Liderlik: Tümü · Takım: Tümü",
  );
  assert.equal(
    resourceReportFilterSummary(leads, teams),
    "Liderlik: 2 seçili · Takım: 1 seçili",
  );
  assert.deepEqual({ leads, teams }, before);
});

test("independent units derive the Product Owner from employees in the Excel payload", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-12T09:00:00Z"),
  });
  const d = fixture();
  d.teams.push({
    id: "po",
    name: "Standalone PO",
    lead: "",
    managerName: "Synthetic PO",
  });
  d.resources.push({
    id: "po-worker",
    name: "Standalone worker",
    note: "",
    versions: [v({ team: "po", lead: "", assignmentRole: "productOwner" })],
  });
  const result = buildResourceReportGroups(
    d,
    d.teams,
    [
      { name: "Standalone PO", unitId: "po", ids: ["po"] },
      { name: "Same name", unitId: "missing", ids: ["missing"] },
    ],
    "2026-01",
    ["2026-01"],
    (ids) => (ids[0] === "po" ? { current: 1, total: 0.25 } : zeroMetric()),
    false,
  );
  assert.equal(result[0].manager, "Standalone worker");
  assert.equal(result[0].personnel, 1);
  assert.deepEqual(result[0].months, [
    { remaining: 0.75, status: "within-capacity" },
  ]);
  assert.equal(result[1].manager, "—");
});
