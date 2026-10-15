import test from "node:test";
import assert from "node:assert/strict";
import {
  topLevelReportGroups,
  expandLeadershipReportGroups,
} from "../frontend/src/features/resource-report-groups.ts";
import { buildResourceReportGroups } from "../frontend/src/features/workspace/resource-report-data.ts";
const data = {
  leaders: ["Root", "Child", "Grand", "Other"],
  leaderParents: { Child: "Root", Grand: "Child" },
  teams: [
    { id: "root", name: "Root", lead: "Root", kind: "leadership" },
    { id: "child", name: "Child", lead: "Child", kind: "leadership" },
    { id: "ct", name: "Child Team", lead: "Child" },
    { id: "gt", name: "Grand Team", lead: "Grand" },
    { id: "other", name: "Other Team", lead: "Other" },
    { id: "independent", name: "Standalone PO", lead: "" },
  ],
  resources: [],
};
const roots = () => topLevelReportGroups(data, data.teams);
test("leadership report hierarchy includes child direct units and descendant teams in ordered subtotals", () => {
  const before = structuredClone(data);
  const rows = expandLeadershipReportGroups(data, data.teams, roots());
  assert.deepEqual(
    rows.map((g) => [g.name, g.depth || 0, g.ids]),
    [
      ["Root", 0, ["root", "child", "ct", "gt"]],
      ["Child", 1, ["child", "ct", "gt"]],
      ["Grand", 2, ["gt"]],
      ["Other", 0, ["other"]],
      ["Standalone PO", 0, ["independent"]],
    ],
  );
  assert.equal(rows[1].parentLeader, "Root");
  assert.equal(rows[2].parentLeader, "Child");
  assert.deepEqual(data, before);
});
test("leadership report hierarchy keeps intermediate context for filtered units without adding excluded capacity", () => {
  const teams = data.teams.filter((t) => t.id === "gt");
  const rows = expandLeadershipReportGroups(
    data,
    teams,
    topLevelReportGroups(data, teams),
  );
  assert.deepEqual(
    rows.map((g) => [g.name, g.ids]),
    [
      ["Root", ["gt"]],
      ["Child", ["gt"]],
      ["Grand", ["gt"]],
    ],
  );
  assert.deepEqual(expandLeadershipReportGroups(data, [], []), []);
  const independent = data.teams.filter((t) => !t.lead);
  assert.deepEqual(
    expandLeadershipReportGroups(
      data,
      independent,
      topLevelReportGroups(data, independent),
    ),
    [{ name: "Standalone PO", unitId: "independent", ids: ["independent"] }],
  );
});
test("leadership report payload uses subtree metrics and child leader identity while root totals remain unique", () => {
  const values = {
    root: [1, 0],
    child: [1, 2],
    ct: [2, 4],
    gt: [1, 4],
    other: [1, 0],
    independent: [1, 2],
  };
  const metric = (ids) => ({
    current: ids.reduce((sum, id) => sum + values[id][0], 0),
    total: ids.reduce((sum, id) => sum + values[id][1], 0),
  });
  const full = {
    ...data,
    resources: data.teams.map((team) => ({
      id: team.id,
      name: team.name + " owner",
      note: "",
      versions: [
        {
          effective: "2026-01",
          start: "2026-01-01",
          end: "",
          team: team.id,
          lead: team.lead,
          status: "Aktif Çalışan",
          included: true,
          amount: 1,
          assignmentRole: team.kind === "leadership" ? "leader" : "member",
        },
      ],
    })),
  };
  const rows = buildResourceReportGroups(
    full,
    full.teams,
    roots(),
    "2026-01",
    ["2026-01"],
    metric,
    false,
  );
  assert.deepEqual(
    rows.map((g) => g.months[0].remaining),
    [-5, -6, -3, 1, -1],
  );
  assert.equal(rows[1].manager, "Child owner");
  assert.equal(rows[0].personnel, 4);
  assert.equal(rows[1].personnel, 3);
  assert.equal(
    rows
      .filter((g) => !g.depth)
      .reduce((sum, g) => sum + g.months[0].remaining, 0),
    -5,
  );
  const teamRows = buildResourceReportGroups(
    full,
    full.teams,
    full.teams.map((t) => ({ name: t.name, ids: [t.id] })),
    "2026-01",
    ["2026-01"],
    metric,
    true,
  );
  assert.equal(teamRows.length, 6);
  assert.equal(
    teamRows.reduce((sum, g) => sum + g.months[0].remaining, 0),
    -5,
  );
});
