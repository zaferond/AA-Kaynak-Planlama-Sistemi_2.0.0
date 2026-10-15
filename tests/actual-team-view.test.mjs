import test from "node:test";
import assert from "node:assert/strict";
import {
  actualView,
  actualViewTeams,
  actualViewQuery,
} from "../backend/actual-view.mjs";
import { createActualMonthIndex } from "../shared/actual-months.ts";
const v = (team, patch = {}) => ({
  effective: "2026-01",
  start: "2026-01-01",
  end: "",
  team,
  lead: team === "other" ? "Other" : team === "child" ? "Child" : "Root",
  status: "Aktif Çalışan",
  included: true,
  amount: 1,
  assignmentRole: "member",
  ...patch,
});
const person = (id, team, patch) => ({
  id,
  name: id,
  note: "PRIVATE_HR",
  code: "PRIVATE_CODE",
  versions: [v(team, patch)],
});
const data = () => ({
  leaders: ["Root", "Child", "Other"],
  leaderParents: { Child: "Root" },
  leadershipUnits: { Root: "direct" },
  leaderManagers: { Root: "Legacy" },
  teams: [
    { id: "team", name: "Team", lead: "Root" },
    { id: "sibling", name: "Sibling", lead: "Root" },
    { id: "direct", name: "Root", lead: "Root", kind: "leadership" },
    { id: "child", name: "Child", lead: "Child" },
    { id: "other", name: "Other", lead: "Other" },
  ],
  projects: [
    { id: "p", name: "P", start: "2026-01", end: "2026-12", phases: {} },
  ],
  resources: [
    person("own", "team"),
    person("peer", "team", { assignmentRole: "productOwner" }),
    person("sibling", "sibling"),
    person("child", "child"),
    person("outsider", "other"),
  ],
  allocations: {},
  actualAllocations: {
    "peer|p|2026-09": 0.25,
    "outsider|p|2026-09": 0.5,
    "peer|p|2026-11": 0.3,
  },
  actualWorkedHours: {},
  actualPercentEntries: {},
  revisions: {},
  workCalendar: {},
  personCalendar: {
    "peer|2026-09-01|leave": {
      type: "leave",
      hours: 9,
      label: "PRIVATE_LEAVE",
    },
    "peer|2026-09-02|training": {
      type: "training",
      hours: 9,
      label: "PRIVATE_TRAINING",
    },
  },
  risks: [],
});
const user = {
  id: "u",
  username: "u",
  name: "U",
  role: "normal",
  leaders: ["Other"],
  resourceId: "own",
  active: true,
};
const query = { start: "2026-09", count: 3 };
const date = "2026-10-12";
test("actual view: team members and POs see their own team; leaders see descendants independently of account grants", () => {
  const d = data();
  assert.deepEqual(
    actualViewTeams(d, user, date).map((t) => t.id),
    ["team"],
  );
  assert.deepEqual(
    actualViewTeams(d, { ...user, resourceId: "peer" }, date).map((t) => t.id),
    ["team"],
  );
  d.resources[0].versions = [v("direct", { assignmentRole: "leader" })];
  assert.deepEqual(
    new Set(actualViewTeams(d, user, date).map((t) => t.id)),
    new Set(["team", "sibling", "direct", "child"]),
  );
  assert.equal(actualViewTeams(d, { ...user, role: "admin" }, date).length, 5);
  assert.deepEqual(actualViewTeams(d, { ...user, resourceId: "" }, date), []);
});
test("actual view: monthly aggregates preserve capacities while private days, HR and out-of-scope history stay hidden", () => {
  const d = data();
  const transfer = person("transfer", "other");
  transfer.versions.push(v("team", { effective: "2026-10" }));
  d.resources.push(transfer);
  d.actualAllocations["transfer|p|2026-09"] = 0.5;
  d.actualAllocations["transfer|p|2026-10"] = 0.2;
  const before = structuredClone(d);
  const result = actualView(d, user, query, date);
  assert.deepEqual(
    new Set(result.data.resources.map((p) => p.id)),
    new Set(["own", "peer", "transfer"]),
  );
  assert.equal(result.data.actualAllocations["peer|p|2026-09"], 0.25);
  assert.equal(result.data.actualAllocations["transfer|p|2026-09"], undefined);
  assert.equal(result.data.actualAllocations["transfer|p|2026-10"], 0.2);
  assert.equal(result.data.actualAllocations["peer|p|2026-11"], undefined);
  assert.equal(
    result.data.resources.find((p) => p.id === "transfer").versions[0].team,
    "",
  );
  assert.equal(result.monthSummaries["transfer|2026-09"], undefined);
  assert.deepEqual(
    result.monthSummaries["peer|2026-09"],
    createActualMonthIndex(d).get("peer", "2026-09"),
  );
  assert.deepEqual(result.data.personCalendar, {});
  assert(!JSON.stringify(result).includes("PRIVATE_"));
  assert.equal(result.data.users, undefined);
  assert.deepEqual(d, before);
});
test("actual view: inactive and future leaders gain no peer scope; explicit existing manager grants are preserved", () => {
  for (const patch of [
    { assignmentRole: "leader", status: "İşten Ayrıldı", end: "2026-10-01" },
    { assignmentRole: "leader", start: "2026-11-01" },
  ]) {
    const d = data();
    d.resources[0].versions = [v("direct", patch)];
    assert.deepEqual(actualViewTeams(d, user, date), []);
    assert.deepEqual(
      actualView(d, user, query, date).data.resources.map((p) => p.id),
      ["own"],
    );
  }
  assert.deepEqual(
    actualViewTeams(
      data(),
      { ...user, role: "manager", resourceId: "", leaders: ["Other"] },
      date,
    ).map((t) => t.id),
    ["other"],
  );
});
test("actual view query rejects injected scopes and unbounded periods", () => {
  assert.deepEqual(
    actualViewQuery.parse({ start: "2026-09", count: "3" }),
    query,
  );
  for (const q of [
    { start: "bad", count: 3 },
    { start: "2026-01", count: 0 },
    { start: "2026-01", count: 61 },
    { ...query, leaders: "all" },
  ])
    assert.equal(actualViewQuery.safeParse(q).success, false);
});
