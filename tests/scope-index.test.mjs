import test from "node:test";
import assert from "node:assert/strict";
import { filterOwnRecords } from "../shared/records.ts";
import {
  createActualTeamIndex,
  actualTeamTotalIndex,
  actualVersionAt,
} from "../shared/model.ts";
import { scopeData, actualReadOwnerScope } from "../shared/access.ts";

const version = (effective, team, status = "Aktif Çalışan") => ({
  effective,
  team,
  lead: team === "a" ? "A" : "B",
  status,
  included: false,
  amount: 1,
  start: "2030-01-01",
  end: "",
});
const fixture = () => ({
  teams: ["a", "b"].map((id) => ({
    id,
    name: id,
    lead: id.toUpperCase(),
    excelCapacity: 0,
  })),
  projects: [
    { id: "p", name: "Project", start: "2025-01", end: "2027-12", phases: {} },
  ],
  resources: [
    {
      id: "r",
      name: "Owner",
      note: "Private",
      code: "Private code",
      versions: [
        version("2026-07", "b", "İşten Ayrıldı"),
        version("2026-03", "a"),
      ],
    },
    {
      id: "s",
      name: "Colleague",
      note: "Private",
      code: "Secret",
      versions: [version("2026-03", "a", "Pasif İlan")],
    },
  ],
  leaders: ["A", "B"],
  leaderManagers: { A: "Manager A", B: "Manager B" },
  catalogVersion: 2,
  users: [{ id: "private-user" }],
  legacyArchive: { allocations: {}, teams: [], resourceTeams: {} },
  risks: [{ id: "first" }, { id: "second" }],
  allocations: { "a|p|2026-01": 1, "b|p|2026-07": 2 },
  actualAllocations: {
    "r|p|2026-01": 0.125,
    "s|p|2026-01": 0.25,
    "r|p|2026-05": 0,
    "r|p|2026-07": 0.5,
  },
  actualWorkedHours: { "r|2026-01": 168, "r|2026-07": 180 },
  actualPercentEntries: { "r|p|2026-01": 5, "r|p|2026-07": 50 },
  workCalendar: {},
  personCalendar: {
    "r|2026-01-02": { type: "leave", label: "Legacy", hours: 1 },
    "r|2026-01-02|training": { type: "training", label: "Training", hours: 2 },
    "r|2026-07-02|leave": { type: "leave", label: "Transferred", hours: 3 },
  },
  revisions: {
    "risk:second": 2,
    "actual:r|p|2026-01": 3,
    "allocation:a|p|2026-01": 4,
    "risk:first": 5,
    "actual:r|p|2026-04": 6,
    "actual:r|p|2026-07": 7,
    "workedHours:r|2026-01": 8,
    "workedHours:r|2026-07": 9,
    "personDay:r|2026-01-02": 10,
    "personDay:r|2026-07-02|leave": 11,
    "actual:gone|p|2026-01": 12,
    "project:p": 13,
    "calendar:shared": 14,
  },
});
const principal = (
  role,
  leaders = ["A"],
  resourceId = role === "normal" ? "r" : "",
) => ({
  id: role,
  username: role,
  name: role,
  role,
  leaders,
  resourceId,
  active: true,
});

test("record filtering preserves own-key order, falsy and prototype-like values without reading rejected values", () => {
  const source = Object.create(
    { inherited: 9 },
    Object.getOwnPropertyDescriptors(
      JSON.parse(
        '{"2":0,"constructor":false,"__proto__":"Own","toString":"","accepted":null}',
      ),
    ),
  );
  Object.defineProperty(source, "hidden", { value: 10, enumerable: false });
  Object.defineProperty(source, "rejected", {
    get() {
      throw Error("Rejected value read");
    },
    enumerable: true,
  });
  const before = Object.getOwnPropertyDescriptors(source),
    prototype = Object.getPrototypeOf(source);
  const result = filterOwnRecords(source, (key) => key !== "rejected");
  assert.deepEqual(Object.keys(result), [
    "2",
    "constructor",
    "__proto__",
    "toString",
    "accepted",
  ]);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(result["2"], 0);
  assert.equal(result.constructor, false);
  assert.equal(result.__proto__, "Own");
  assert.equal(result.toString, "");
  assert.equal(result.accepted, null);
  assert.equal(Object.hasOwn(result, "inherited"), false);
  assert.equal(Object.hasOwn(result, "hidden"), false);
  assert.equal(Object.getPrototypeOf(source), prototype);
  assert.deepEqual(Object.getOwnPropertyDescriptors(source), before);
  assert.deepEqual(
    filterOwnRecords(undefined, () => true),
    {},
  );
});

test("month-team lookup matches historical fallback, transfers and statuses without reordering histories", () => {
  const resources = fixture().resources;
  resources.push({ id: "empty", name: "Empty", note: "", versions: [] });
  for (const id of ["__proto__", "constructor", "toString"])
    resources.push({
      id,
      name: id,
      note: "",
      versions: [version("2026-05", "b", "GearUp")],
    });
  const before = structuredClone(resources),
    index = createActualTeamIndex(resources);
  for (const resource of resources)
    for (const month of ["2025-01", "2026-03", "2026-05", "2026-07", "2031-01"])
      assert.equal(
        index.get(resource.id, month),
        actualVersionAt(resource, month)?.team || "",
      );
  assert.equal(index.get("gone", "2026-01"), undefined);
  assert.equal(index.get("gone", "2026-01"), undefined);
  assert.deepEqual(resources, before);
});

test("one snapshot reuses month history in totals and a new snapshot obtains fresh assignments", () => {
  const data = fixture();
  const history = [version("2026-01", "a")];
  let reads = 0;
  data.resources = [
    {
      id: "r",
      name: "Resource",
      note: "",
      get versions() {
        reads++;
        return history;
      },
    },
  ];
  data.actualAllocations = Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [
      `r|p${i}|2026-05`,
      i === 0 ? 0 : 0.01,
    ]),
  );
  const index = createActualTeamIndex(data.resources);
  for (let i = 0; i < 100; i++) assert.equal(index.get("r", "2026-05"), "a");
  assert.equal(reads, 1);
  const totals = actualTeamTotalIndex(data, new Set(["a"]), index);
  assert.equal(reads, 1);
  assert.equal(Object.keys(totals).length, 100);
  assert.equal(totals["a|p0|2026-05"], 0);
  assert.equal(totals["a|p99|2026-05"], 0.01);
  history.push(version("2026-03", "b"));
  const next = createActualTeamIndex(data.resources);
  assert.equal(next.get("r", "2026-05"), "b");
  assert.equal(reads, 2);
  assert.deepEqual(actualTeamTotalIndex(data, new Set(["a"])), {});
  assert.equal(actualTeamTotalIndex(data)["b|p99|2026-05"], 0.01);
});

test("scoped views preserve historical team boundaries, owned actuals, anonymous totals and tombstones", () => {
  const data = fixture(),
    before = structuredClone(data);
  const a = scopeData(data, principal("manager"));
  const b = scopeData(data, principal("manager", ["B"]));
  const own = scopeData(data, principal("normal"));
  assert.deepEqual(Object.keys(a.actualAllocations), [
    "r|p|2026-01",
    "s|p|2026-01",
    "r|p|2026-05",
  ]);
  assert.deepEqual(Object.keys(b.actualAllocations), ["r|p|2026-07"]);
  assert.deepEqual(Object.keys(own.actualAllocations), [
    "r|p|2026-01",
    "r|p|2026-05",
    "r|p|2026-07",
  ]);
  assert.deepEqual(a.actualTeamTotals, {
    "a|p|2026-01": 0.375,
    "a|p|2026-05": 0,
    "b|p|2026-07": 0.5,
  });
  assert.deepEqual(own.actualTeamTotals, {
    "a|p|2026-01": 0.375,
    "a|p|2026-05": 0,
  });
  assert.deepEqual(b.actualTeamTotals, a.actualTeamTotals);
  assert.equal(a.actualWorkedHours["r|2026-07"], undefined);
  assert.equal(own.actualWorkedHours["r|2026-07"], 180);
  assert.equal(a.actualPercentEntries["r|p|2026-07"], undefined);
  assert.equal(own.actualPercentEntries["r|p|2026-07"], 50);
  assert.deepEqual(a.personCalendar, {});
  assert.deepEqual(b.personCalendar, {});
  assert.equal(own.personCalendar["r|2026-07-02|leave"].hours, 3);
  assert.equal(a.revisions["actual:r|p|2026-04"], 6);
  assert.equal(a.revisions["actual:r|p|2026-07"], undefined);
  assert.equal(a.revisions["actual:gone|p|2026-01"], undefined);
  assert.equal(own.revisions["allocation:a|p|2026-01"], undefined);
  assert.deepEqual(Object.keys(a.revisions), [
    "actual:r|p|2026-01",
    "allocation:a|p|2026-01",
    "actual:r|p|2026-04",
    "workedHours:r|2026-01",
    "calendar:shared",
    "risk:second",
    "risk:first",
  ]);
  for (const view of [a, b, own]) {
    assert.equal(view.users, undefined);
    assert.equal(view.legacyArchive, undefined);
    assert.deepEqual(view.risks, data.risks);
    for (const resource of view.resources) {
      assert.equal(resource.note, "");
      assert.equal(resource.code, undefined);
    }
  }
  assert.equal(own.resources.find((resource) => resource.id === "s").name, "");
  assert.equal(
    own.resources.find((resource) => resource.id === "r").name,
    "Owner",
  );
  assert.equal(
    own.resources.find((resource) => resource.id === "r").versions[0].team,
    "b",
  );
  assert.equal(
    own.resources.find((resource) => resource.id === "r").versions[0].status,
    "İşten Ayrıldı",
  );
  assert.deepEqual(data, before);
});

test("scope changes cannot reuse a previous user's permissions or a previous resource history", () => {
  const data = fixture();
  const normal = scopeData(data, principal("normal"));
  const unassigned = scopeData(data, principal("manager", []));
  const noOwner = scopeData(data, principal("normal", [], ""));
  assert.equal(normal.actualAllocations["r|p|2026-07"], 0.5);
  for (const view of [unassigned, noOwner]) {
    assert.deepEqual(view.actualAllocations, {});
    assert.deepEqual(view.actualWorkedHours, {});
    assert.deepEqual(view.actualPercentEntries, {});
    assert.deepEqual(view.personCalendar, {});
    assert.equal(
      view.resources.every((resource) => resource.name === ""),
      true,
    );
    assert.equal(view.actualTeamTotals["b|p|2026-07"], 0.5);
    assert.deepEqual(view.revisions, {
      ...(view === unassigned ? { "allocation:a|p|2026-01": 4 } : {}),
      "calendar:shared": 14,
      "risk:second": 2,
      "risk:first": 5,
    });
  }
  const revised = structuredClone(data);
  revised.resources[0].versions[0].team = "a";
  const changed = scopeData(revised, principal("manager"));
  assert.equal(changed.actualAllocations["r|p|2026-07"], 0.5);
  assert.equal(
    scopeData(data, principal("manager")).actualAllocations["r|p|2026-07"],
    undefined,
  );
  assert.equal(scopeData(data, principal("admin")), data);
});

test("a normal user's own record survives a complete transfer outside their account leadership without widening other data", () => {
  const data = fixture();
  data.resources[0].versions = [version("2026-01", "b")];
  data.resources.push({
    id: "private-b",
    name: "Private B",
    note: "HR",
    code: "HR",
    versions: [version("2026-01", "b")],
  });
  data.actualAllocations["private-b|p|2026-07"] = 0.25;
  data.personCalendar["private-b|2026-07-02|leave"] = {
    type: "leave",
    label: "Private",
    hours: 1,
  };
  const view = scopeData(data, principal("normal"));
  assert.equal(view.resources.find((r) => r.id === "r").versions[0].team, "b");
  assert.equal(view.resources.find((r) => r.id === "r").name, "Owner");
  assert.equal(
    view.resources.some((r) => r.id === "private-b"),
    false,
  );
  assert.deepEqual(
    view.teams.map((t) => t.id),
    ["a"],
  );
  assert.deepEqual(view.allocations, { "a|p|2026-01": 1 });
  assert.equal(view.actualTeamTotals["b|p|2026-07"], undefined);
  assert.equal(view.actualAllocations["r|p|2026-07"], 0.5);
  assert.equal(view.actualAllocations["private-b|p|2026-07"], undefined);
  assert.equal(view.personCalendar["private-b|2026-07-02|leave"], undefined);
  const manager = scopeData(data, principal("manager"));
  assert.equal(manager.resources.find((r) => r.id === "r").name, "");
});

test("personal read owner candidates preserve own transfers and historical managers without granting unassigned access", () => {
  const data = fixture();
  assert.equal(actualReadOwnerScope(data, principal("admin")), undefined);
  assert.deepEqual(actualReadOwnerScope(data, principal("normal", ["B"])), [
    "r",
  ]);
  assert.deepEqual(actualReadOwnerScope(data, principal("normal", [], "")), []);
  assert.deepEqual(actualReadOwnerScope(data, principal("manager", [])), []);
  assert.deepEqual(actualReadOwnerScope(data, principal("manager", ["B"])), [
    "r",
  ]);
  assert.deepEqual(actualReadOwnerScope(data, principal("manager", ["A"])), [
    "r",
    "s",
  ]);
});

test("linked managers retain their own historical records without gaining another leadership's employees", () => {
  const data = fixture();
  const ownManager = principal("manager", [], "r");
  assert.deepEqual(actualReadOwnerScope(data, ownManager), ["r"]);
  const view = scopeData(data, ownManager);
  assert.deepEqual(
    view.actualAllocations,
    scopeData(data, principal("normal")).actualAllocations,
  );
  assert.equal(view.resources.find((r) => r.id === "r").name, "Owner");
  assert.equal(view.resources.find((r) => r.id === "s").name, "");
  assert.equal(view.actualAllocations["s|p|2026-01"], undefined);
  assert.equal(view.personCalendar["r|2026-07-02|leave"].hours, 3);
  assert.equal(
    view.revisions["actual:r|p|2026-07"],
    data.revisions["actual:r|p|2026-07"],
  );
  const assigned = scopeData(data, principal("manager", ["A"], "r"));
  assert.equal(assigned.actualAllocations["s|p|2026-01"], 0.25);
  assert.equal(assigned.actualAllocations["r|p|2026-07"], 0.5);
});
