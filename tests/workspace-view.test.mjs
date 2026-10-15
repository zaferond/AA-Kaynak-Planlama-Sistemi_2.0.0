import test from "node:test";
import assert from "node:assert/strict";
import {
  readWorkspaceOptions,
  planWorkspacePath,
} from "../frontend/src/features/workspace/workspace-options.ts";
import {
  selectWorkspaceScope,
  selectWorkspacePages,
  workspaceMetric,
} from "../frontend/src/features/workspace/workspace-selectors.ts";
import { scopeData } from "../shared/access.ts";
import { buildCapacityIndex, projectTotalIndex } from "../shared/metrics.ts";
import { MAX_FILTER_START } from "../shared/planning-dates.ts";
const defaults = { start: "2026-01", count: 12 };
const principal = (
  role,
  leaders = ["A"],
  resourceId = role === "normal" ? "own" : "",
) => ({
  id: role,
  username: role,
  name: role,
  role,
  leaders,
  resourceId,
  active: true,
});
const version = (team, effective = "2026-01") => ({
  effective,
  team,
  lead: team === "a" ? "A" : "B",
  status: "Aktif Çalışan",
  included: true,
  amount: 1,
  start: "2026-01-01",
  end: "",
});
const fixture = () => ({
  leaders: ["A", "B"],
  leaderManagers: { A: "Leader A", B: "Leader B" },
  catalogVersion: 2,
  revisions: {},
  teams: [
    { id: "a", name: "Team A", lead: "A", excelCapacity: 0 },
    { id: "b", name: "Team B", lead: "B", excelCapacity: 0 },
    { id: "unmatched", name: "No leader", lead: "", excelCapacity: 0 },
  ],
  projects: [
    {
      id: "p",
      name: "Project P",
      start: "2026-01",
      end: "2026-12",
      phases: {},
    },
    {
      id: "q",
      name: "Project Q",
      start: "2026-01",
      end: "2026-12",
      phases: {},
    },
  ],
  resources: [
    {
      id: "own",
      name: "Synthetic own",
      note: "",
      versions: [version("a"), version("b", "2026-02")],
    },
    {
      id: "other",
      name: "Synthetic other",
      note: "",
      versions: [version("b")],
    },
    {
      id: "posting",
      name: "Posting",
      note: "",
      versions: [{ ...version("a"), status: "Aktif İlan" }],
    },
  ],
  allocations: { "a|p|2026-01": 0.25, "a|q|2026-01": 0.5, "b|p|2026-01": 0.75 },
  actualAllocations: { "own|p|2026-01": 0.1 },
  actualWorkedHours: {},
  actualPercentEntries: {},
  workCalendar: {},
  personCalendar: {},
});
const filters = (override = {}) => ({
  leads: [],
  teamIds: [],
  projectIds: [],
  start: "2026-01",
  months: ["2026-01"],
  currentMonth: "2026-10",
  ...override,
});

test("workspace query only initializes full planning mode and rejects invalid dates, counts and modes", () => {
  assert.deepEqual(
    readWorkspaceOptions(
      "?lead=B&team=b&project=q&start=2027-03&count=60&view=team&density=overview",
      defaults,
    ),
    {
      ...defaults,
      fullPlan: false,
      leads: [],
      teamIds: [],
      projectIds: [],
      view: "project",
      density: "detail",
    },
  );
  for (const query of [
    "start=not-a-month&count=0",
    "start=2026-13&count=NaN",
    "start=2200-01&count=120",
  ]) {
    const result = readWorkspaceOptions(
      "?allocation=full&density=unknown&view=unknown&" + query,
      defaults,
    );
    assert.equal(result.start, defaults.start);
    assert.equal(result.count, 12);
    assert.equal(result.density, "detail");
    assert.equal(result.view, "project");
  }
  assert.equal(
    readWorkspaceOptions("?allocation=full&start=2199-12&count=60", defaults)
      .start,
    MAX_FILTER_START,
  );
});

test("planning links round-trip repeated and encoded filters while dropping unrelated query and fragment values", () => {
  const values = {
    leads: ["A & B", "L/2"],
    teamIds: ["a", "b"],
    projectIds: ["p"],
    start: "2027-03",
    count: 24,
    density: "compact",
    view: "team",
  };
  const before = structuredClone(values);
  const link = planWorkspacePath(
    "https://example.invalid/portal?unused=value#fragment",
    values,
  );
  assert(link.startsWith("/portal?allocation=full"));
  assert(!link.includes("unused"));
  assert(!link.includes("fragment"));
  assert.deepEqual(
    readWorkspaceOptions(link.slice(link.indexOf("?")), defaults),
    { ...values, fullPlan: true },
  );
  assert.deepEqual(values, before);
});

test("scope filters preserve source order, unassigned leader groups and the names of active filters", () => {
  const data = fixture(),
    before = structuredClone(data);
  const all = selectWorkspaceScope(data, principal("admin"), filters());
  assert.deepEqual(
    all.leaderReportGroups.map((g) => g.name),
    ["A", "B", "No leader"],
  );
  const selected = selectWorkspaceScope(
    data,
    principal("admin"),
    filters({ leads: ["B"], teamIds: ["b"], projectIds: ["q"] }),
  );
  assert.deepEqual(
    selected.availableTeams.map((t) => t.id),
    ["b"],
  );
  assert.deepEqual(selected.ids, ["b"]);
  assert.deepEqual(
    selected.projects.map((p) => p.id),
    ["q"],
  );
  assert.deepEqual(
    selected.availablePeople.map((p) => p.id),
    ["other"],
  );
  assert.deepEqual(
    selected.capacityFilters.slice(0, 3).map((f) => f.values),
    [["B"], ["Team B"], ["Project Q"]],
  );
  assert.deepEqual(
    selectWorkspaceScope(
      data,
      principal("admin"),
      filters({ leads: ["A"], teamIds: ["b"] }),
    ).ids,
    [],
  );
  assert.deepEqual(data, before);
});

test("a project filter leaves all-project team capacity intact and project totals retain only selected teams", () => {
  const data = fixture();
  const scope = selectWorkspaceScope(
    data,
    principal("admin"),
    filters({ teamIds: ["a"], projectIds: ["p"] }),
  );
  const cache = buildCapacityIndex(data, ["2026-01"]);
  assert.deepEqual(workspaceMetric(cache, scope.ids, "2026-01"), {
    current: 2,
    total: 0.75,
  });
  assert.deepEqual(projectTotalIndex(data, scope.ids, ["2026-01"]), {
    "p|2026-01": 0.25,
    "q|2026-01": 0.5,
  });
  assert.deepEqual(workspaceMetric(cache, ["missing"], "2026-01"), {
    current: 0,
    total: 0,
  });
});

test("normal own-person visibility survives a team transfer while excluding others, postings and future months", () => {
  const data = fixture(),
    user = principal("normal");
  const scoped = scopeData(data, user);
  const own = selectWorkspaceScope(
    scoped,
    user,
    filters({ months: ["2026-02"], teamIds: ["a"] }),
  );
  assert.deepEqual(
    own.availablePeople.map((p) => p.id),
    ["own"],
  );
  assert.deepEqual(
    selectWorkspaceScope(scoped, user, filters({ months: ["2026-11"] }))
      .availablePeople,
    [],
  );
  assert.deepEqual(
    selectWorkspaceScope(
      scoped,
      user,
      filters({ months: ["2025-12"] }),
    ).availablePeople.map((p) => p.id),
    ["own"],
  );
});

test("managers can filter all planning teams without exposing anonymous personnel", () => {
  const user = principal("manager"),
    full = fixture();
  full.resources.push({
    id: "local",
    name: "Synthetic local",
    note: "",
    versions: [version("a")],
  });
  const data = scopeData(full, user);
  const outside = selectWorkspaceScope(
    data,
    user,
    filters({ teamIds: ["b"], leads: ["B"] }),
  );
  assert.deepEqual(
    outside.teams.map((t) => t.id),
    ["b"],
  );
  assert.deepEqual(outside.availablePeople, []);
  const allowed = selectWorkspaceScope(data, user, filters());
  assert.deepEqual(allowed.ids, ["unmatched", "a", "b"]);
  assert.deepEqual(
    allowed.availablePeople.map((p) => p.id),
    ["own", "local"],
  );
});

test("all filtered rows remain reachable without pagination in both grouping directions", () => {
  const teams = Array.from({ length: 17 }, (_, i) => ({ id: "t" + i })),
    projects = Array.from({ length: 23 }, (_, i) => ({ id: "p" + i }));
  const teamView = selectWorkspacePages(teams, projects, {
    count: 60,
    view: "team",
    planPage: 99,
    projectPage: 99,
  });
  assert.equal(teamView.planPageSize, 391);
  assert.equal(teamView.effectivePlanPage, 0);
  assert.equal(teamView.effectiveProjectPage, 0);
  assert.equal(teamView.visiblePlanRows.length, 391);
  assert.equal(teamView.visiblePlanRows[0], "t0|p0");
  assert.equal(teamView.visiblePlanRows.at(-1), "t16|p22");
  const projectView = selectWorkspacePages(teams, projects, {
    count: 12,
    view: "project",
    planPage: 0,
    projectPage: 0,
  });
  assert.equal(projectView.planPageSize, 391);
  assert.deepEqual(projectView.visiblePlanRows.slice(0, 2), ["t0|p0", "t1|p0"]);
  for (const [total, expectedPage] of [
    [250, 0],
    [251, 0],
    [500, 0],
    [501, 0],
  ]) {
    const paged = selectWorkspacePages(
      teams,
      Array.from({ length: total }, (_, i) => ({ id: "p" + i })),
      {
        count: 12,
        view: "project",
        planPage: 0,
        projectPage: 99,
      },
    );
    assert.equal(paged.effectiveProjectPage, expectedPage);
  }
  const empty = selectWorkspacePages([], [], {
    count: 12,
    view: "project",
    planPage: 99,
    projectPage: 99,
  });
  assert.equal(empty.effectivePlanPage, 0);
  assert.equal(empty.effectiveProjectPage, 0);
  assert.deepEqual(empty.visiblePlanRows, []);
});

test("a manager's linked employee stays available alongside authorized employees after transfer", () => {
  const full = fixture(),
    user = principal("manager", ["A"], "own");
  const data = scopeData(full, user);
  const scope = selectWorkspaceScope(
    data,
    user,
    filters({ months: ["2026-02"] }),
  );
  assert.deepEqual(
    scope.availablePeople.map((p) => p.id),
    ["own"],
  );
  assert.deepEqual(scope.ids, ["unmatched", "a", "b"]);
  assert.equal(
    scope.availablePeople.some((p) => p.id === "other"),
    false,
  );
});

test("remaining resource groups retain only root leaderships and each independent Product Owner unit with no double counting", () => {
  const d = fixture();
  d.leaders.push("Child", "Grandchild", "Standalone PO");
  d.leaderParents = { Child: "A", Grandchild: "Child" };
  d.teams.push(
    {
      id: "direct-a",
      name: "A",
      lead: "A",
      kind: "leadership",
      excelCapacity: 0,
    },
    {
      id: "child-unit",
      name: "Child",
      lead: "Child",
      kind: "leadership",
      excelCapacity: 0,
    },
    { id: "child-team", name: "Child Team", lead: "Child", excelCapacity: 0 },
    {
      id: "grand-team",
      name: "Grand Team",
      lead: "Grandchild",
      excelCapacity: 0,
    },
    {
      id: "independent-po",
      name: "Independent Product Ownership",
      lead: "",
      excelCapacity: 0,
    },
    { id: "same-name", name: "A", lead: "", excelCapacity: 0 },
    {
      id: "root-po-unit",
      name: "Standalone PO",
      lead: "Standalone PO",
      kind: "leadership",
      excelCapacity: 0,
    },
  );
  const before = structuredClone(d);
  const scope = selectWorkspaceScope(d, principal("admin"), filters());
  const groups = scope.leaderReportGroups;
  assert.deepEqual(groups.find((g) => g.leader === "A").ids, [
    "a",
    "direct-a",
    "child-unit",
    "child-team",
    "grand-team",
  ]);
  assert(!groups.some((g) => ["Child", "Grandchild"].includes(g.name)));
  for (const id of ["unmatched", "independent-po", "same-name"]) {
    const group = groups.find((g) => g.unitId === id);
    assert.deepEqual(group.ids, [id]);
    assert.equal(group.name, d.teams.find((t) => t.id === id).name);
  }
  assert(
    groups.some(
      (g) => g.name === "Standalone PO" && g.leader === "Standalone PO",
    ),
  );
  const allIds = groups.flatMap((g) => g.ids);
  assert.equal(new Set(allIds).size, allIds.length);
  assert.deepEqual([...allIds].sort(), scope.ids.toSorted());
  const selected = selectWorkspaceScope(
    d,
    principal("admin"),
    filters({ teamIds: ["child-team", "independent-po"] }),
  );
  assert.deepEqual(selected.leaderReportGroups, [
    { name: "A", leader: "A", ids: ["child-team"] },
    {
      name: "Independent Product Ownership",
      unitId: "independent-po",
      ids: ["independent-po"],
    },
  ]);
  assert.deepEqual(d, before);
  const user = principal("manager");
  const scoped = scopeData(d, user);
  assert(
    selectWorkspaceScope(scoped, user, filters()).leaderReportGroups.some(
      (g) => g.unitId,
    ),
  );
});
