import test from "node:test";
import assert from "node:assert/strict";
import {
  directoryResponsibilityIndex,
  planningUnitManagerIndex,
  resourceRole,
  assertUniqueProductOwners,
  PRODUCT_OWNER_CONFLICT,
  LEADER_CONFLICT,
  assertUniqueLeadershipLeaders,
} from "../shared/resource-roles.ts";
import { validate } from "../shared/server-domain.ts";
import { prepareEditorChanges } from "../frontend/src/features/editor-commands.ts";
import { captureEditorRevisions } from "../frontend/src/features/editor-revisions.ts";
const version = (patch = {}) => ({
  effective: "2026-01",
  team: "t",
  lead: "A",
  status: "Aktif Çalışan",
  included: true,
  start: "2026-01-01",
  end: "",
  amount: 1,
  ...patch,
});
const person = (id, role, patch = {}) => ({
  id,
  name: "Synthetic " + id,
  note: "",
  versions: [version({ ...(role ? { assignmentRole: role } : {}), ...patch })],
});
const fixture = (...resources) => ({
  teams: [
    { id: "t", name: "Team", lead: "A", excelCapacity: 0, catalog: true },
    {
      id: "unit",
      name: "A",
      lead: "A",
      kind: "leadership",
      excelCapacity: 0,
      catalog: true,
    },
    { id: "other", name: "Other", lead: "A", excelCapacity: 0, catalog: true },
  ],
  leaders: ["A"],
  leadershipUnits: { A: "unit" },
  leaderManagers: { A: "Ignored legacy manager" },
  projects: [],
  allocations: {},
  revisions: {},
  catalogVersion: 2,
  resources,
});
const conflict = (fn, name) =>
  assert.throws(
    fn,
    (e) =>
      e.code === PRODUCT_OWNER_CONFLICT &&
      e.status === 400 &&
      e.message.includes(name),
  );

test("old resource roles remain compatible and explicit roles must match real teams or direct leadership owners", () => {
  const d = fixture();
  assert.equal(resourceRole(d, version()), "member");
  assert.equal(resourceRole(d, version({ team: "unit" })), "leader");
  for (const [role, team] of [
    ["leader", "unit"],
    ["productOwner", "t"],
    ["member", "t"],
    ["coe", "t"],
  ])
    assert.equal(
      validate(fixture(person("p", role, { team }))).resources[0].versions[0]
        .assignmentRole,
      role,
    );
  for (const [role, team] of [
    ["leader", "t"],
    ["productOwner", "unit"],
    ["member", "unit"],
    ["coe", "unit"],
    ["coe", ""],
    ["productOwner", ""],
  ])
    assert.throws(
      () => validate(fixture(person("p", role, { team }))),
      (e) => e.status === 400,
    );
  assert.throws(() => validate(fixture(person("p", "admin"))), /Invalid enum/);
  assert.throws(
    () => validate(fixture(person("p", "productOwner", { lead: "Other" }))),
    /geçerli liderlik/,
  );
});

test("manager names come only from active assignments; inclusion and legacy free text do not affect them", () => {
  const d = fixture(
    person("leader", "leader", { team: "unit", included: false }),
    person("owner", "productOwner", { included: false }),
    person("member", "member"),
    person("future", "leader", { team: "unit", start: "2026-11-01" }),
    person("departed", "leader", {
      team: "unit",
      status: "İşten Ayrıldı",
      end: "2026-10-10",
    }),
    person("posting", "productOwner", { team: "other", status: "Aktif İlan" }),
  );
  assert.deepEqual(directoryResponsibilityIndex(d, "2026-10-12"), {
    leaders: { A: "Synthetic leader" },
    teams: { t: "Synthetic owner" },
  });
  d.resources[1].name = "Renamed Owner";
  assert.equal(
    directoryResponsibilityIndex(d, "2026-10-12").teams.t,
    "Renamed Owner",
  );
  d.resources[1].versions.push(
    version({ effective: "2026-10", assignmentRole: "member" }),
  );
  assert.deepEqual(directoryResponsibilityIndex(d, "2026-10-12").teams, {});
  assert.equal(
    directoryResponsibilityIndex(d, "2026-09-01").teams.t,
    "Renamed Owner",
  );
});

test("duplicate owners are rejected regardless of planning inclusion and name order; own edits remain valid", () => {
  const owner = person("existing", "productOwner"),
    d = fixture(owner, person("new", "productOwner", { included: false }));
  conflict(() => validate(d, { previousResources: [owner] }), owner.name);
  d.resources.reverse();
  conflict(() => validate(d, { previousResources: [owner] }), owner.name);
  assert.doesNotThrow(() =>
    validate(fixture(owner), { previousResources: [owner] }),
  );
  owner.name = "<b>Synthetic & owner</b>";
  conflict(() => assertUniqueProductOwners(d), d.resources[0].name);
});

test("effective-month handovers and nonoverlapping employment are valid, future overlaps are blocked", () => {
  const old = person("old", "productOwner");
  old.versions.push(
    version({ assignmentRole: "member", effective: "2026-10" }),
  );
  const next = person("next", "productOwner", { effective: "2026-10" });
  const d = fixture(old, next);
  assert.doesNotThrow(() => validate(d));
  assert.equal(directoryResponsibilityIndex(d, "2026-09-01").teams.t, old.name);
  assert.equal(
    directoryResponsibilityIndex(d, "2026-10-12").teams.t,
    next.name,
  );
  const a = person("a", "productOwner", { end: "2026-10-10" }),
    b = person("b", "productOwner", { start: "2026-10-11" });
  assert.doesNotThrow(() => validate(fixture(a, b)));
  b.versions[0].start = "2026-10-10";
  conflict(() => validate(fixture(a, b)), a.name);
  b.versions[0].team = "other";
  assert.doesNotThrow(() => validate(fixture(a, b)));
  conflict(
    () =>
      validate(
        fixture(
          person("future1", "productOwner", {
            effective: "2027-01",
            start: "2027-01-01",
          }),
          person("future2", "productOwner", {
            effective: "2027-02",
            start: "2027-02-01",
          }),
        ),
      ),
    "Synthetic future1",
  );
});

test("resource editor saves Product Owner, requires a real team and detects conflicts without mutating the draft", () => {
  const own = person("owner", "productOwner"),
    d = fixture(own, person("new", "member"));
  const editor = {
    kind: "resource",
    isNew: false,
    value: structuredClone(d.resources[1]),
    version: version(),
    assignmentKind: "productOwner",
    baseRevisions: captureEditorRevisions(d),
  };
  const before = structuredClone(editor);
  conflict(
    () =>
      prepareEditorChanges(d, editor, { start: "2026-01", resourceIds: [] }),
    own.name,
  );
  assert.deepEqual(editor, before);
  editor.version.team = "other";
  assert.equal(
    prepareEditorChanges(d, editor, { start: "2026-01", resourceIds: [] })[0]
      .value.versions[0].assignmentRole,
    "productOwner",
  );
  editor.version.team = "";
  assert.throws(
    () =>
      prepareEditorChanges(d, editor, { start: "2026-01", resourceIds: [] }),
    /Takım seçin/,
  );
});

test("bulk team changes normalize direct leaders to Team Member and preserve Product Owner subject to uniqueness", () => {
  const d = fixture(
    person("leader", "leader", { team: "unit" }),
    person("owner", "productOwner"),
  );
  const editor = {
    kind: "bulkResources",
    effective: "2026-01",
    team: "t",
    lead: "A",
    status: "",
    included: "keep",
    baseRevisions: captureEditorRevisions(d),
  };
  const changes = prepareEditorChanges(d, editor, {
    start: "2026-01",
    resourceIds: ["leader"],
  });
  assert.equal(changes[0].value.versions[0].assignmentRole, "member");
  editor.team = "unit";
  assert.throws(
    () =>
      prepareEditorChanges(d, editor, {
        start: "2026-01",
        resourceIds: ["owner"],
      }),
    (e) => e.code === LEADER_CONFLICT && e.message.includes("Synthetic leader"),
  );
  d.resources = d.resources.filter((r) => r.id !== "leader");
  assert.equal(
    prepareEditorChanges(d, editor, {
      start: "2026-01",
      resourceIds: ["owner"],
    })[0].value.versions[0].assignmentRole,
    "leader",
  );
});

const leader = (id, patch = {}) =>
  person(id, "leader", { team: "unit", ...patch });
const leaderConflict = (fn, name) =>
  assert.throws(
    fn,
    (e) =>
      e.code === LEADER_CONFLICT &&
      e.status === 400 &&
      e.message.includes(name),
  );
test("leadership uniqueness blocks a second leader, inferred legacy assignments and future reservations; inclusion is irrelevant", () => {
  const old = leader("current"),
    candidate = leader("candidate", { included: false });
  for (const resources of [
    [old, candidate],
    [candidate, old],
  ])
    leaderConflict(
      () => validate(fixture(...resources), { previousResources: [old] }),
      old.name,
    );
  const legacy = person("legacy", undefined, { team: "unit" });
  leaderConflict(
    () => validate(fixture(legacy, candidate), { previousResources: [legacy] }),
    legacy.name,
  );
  for (const status of [
    "Aktif Çalışan",
    "Gear Up",
    "SAAT Ücretli Ofis Ç.",
    "İşten Ayrıldı",
  ])
    leaderConflict(
      () =>
        validate(
          fixture(
            old,
            leader("next", {
              status,
              ...(status === "İşten Ayrıldı" ? { end: "2026-12-31" } : {}),
            }),
          ),
        ),
      old.name,
    );
  for (const status of ["Aktif İlan", "Pasif İlan"])
    assert.doesNotThrow(() =>
      validate(
        fixture(old, leader("posting", { status, included: false, start: "" })),
      ),
    );
  leaderConflict(
    () =>
      validate(
        fixture(
          leader("future1", { effective: "2027-01", start: "2027-01-01" }),
          leader("future2", { effective: "2027-02", start: "2027-02-01" }),
        ),
      ),
    "Synthetic future1",
  );
});
test("leader handovers, own edits and independent child leadership assignments stay valid", () => {
  const old = leader("old", { end: "2026-10-10" }),
    next = leader("next", { start: "2026-10-11" });
  assert.doesNotThrow(() => validate(fixture(old, next)));
  next.versions[0].start = "2026-10-10";
  leaderConflict(() => validate(fixture(old, next)), old.name);
  const previous = leader("previous");
  previous.versions.push(
    version({ effective: "2026-10", assignmentRole: "member" }),
  );
  assert.doesNotThrow(() =>
    validate(
      fixture(previous, leader("replacement", { effective: "2026-10" })),
    ),
  );
  const d = fixture(
    leader("parent"),
    leader("child", { team: "childunit", lead: "B" }),
  );
  d.leaders.push("B");
  d.leaderParents = { B: "A" };
  d.leadershipUnits.B = "childunit";
  d.teams.push({
    id: "childunit",
    name: "B",
    lead: "B",
    kind: "leadership",
    excelCapacity: 0,
    catalog: true,
  });
  assert.doesNotThrow(() => validate(d));
  const copy = structuredClone(d.resources);
  d.resources[0].name = "Renamed";
  d.resources[0].note = "Changed note";
  assert.doesNotThrow(() => validate(d, { previousResources: copy }));
});
test("unchanged historic duplicate leaders do not block unrelated saves but cannot be widened or joined by a third leader", () => {
  const a = leader("a", { end: "2026-06-30" }),
    b = leader("b", { end: "2026-06-30" });
  const previous = structuredClone([a, b]);
  const d = fixture(a, b);
  leaderConflict(() => assertUniqueLeadershipLeaders(d), a.name);
  assert.doesNotThrow(() => validate(d, { previousResources: previous }));
  d.resources[0].note = "Unrelated note";
  assert.doesNotThrow(() => validate(d, { previousResources: previous }));
  d.resources.push(leader("third", { end: "2026-06-30" }));
  leaderConflict(() => validate(d, { previousResources: previous }), a.name);
  d.resources.pop();
  d.resources.forEach((r) => (r.versions[0].end = "2026-07-01"));
  leaderConflict(() => validate(d, { previousResources: previous }), a.name);
});
test("removing a later assignment cannot silently expand a grandfathered leader overlap", () => {
  const a = leader("a"),
    b = leader("b");
  for (const r of [a, b])
    r.versions.push(
      version({ effective: "2026-07", assignmentRole: "member" }),
    );
  const previous = structuredClone([a, b]);
  const d = fixture(a, b);
  assert.doesNotThrow(() => validate(d, { previousResources: previous }));
  d.resources.forEach((r) => r.versions.pop());
  leaderConflict(() => validate(d, { previousResources: previous }), a.name);
});
test("leader editor and bulk changes preserve drafts while rejecting conflicting assignments", () => {
  const old = leader("current"),
    d = fixture(old, person("new", "member"));
  const editor = {
    kind: "resource",
    isNew: false,
    value: structuredClone(d.resources[1]),
    version: version(),
    assignmentKind: "leader",
    baseRevisions: captureEditorRevisions(d),
  };
  const before = structuredClone(editor);
  leaderConflict(
    () =>
      prepareEditorChanges(d, editor, { start: "2026-01", resourceIds: [] }),
    old.name,
  );
  assert.deepEqual(editor, before);
  const bulk = {
    kind: "bulkResources",
    effective: "2026-01",
    team: "unit",
    lead: "A",
    status: "",
    included: "keep",
    baseRevisions: captureEditorRevisions(d),
  };
  leaderConflict(
    () =>
      prepareEditorChanges(d, bulk, { start: "2026-01", resourceIds: ["new"] }),
    old.name,
  );
});

test("planning unit managers derive team Product Owners and leadership Leaders without legacy fallback", () => {
  const d = fixture(
    person("leader", "leader", { team: "unit", included: false }),
    person("owner", "productOwner", { included: false }),
  );
  d.teams.forEach((team) => (team.managerName = "Ignored legacy manager"));
  const before = structuredClone(d);
  assert.deepEqual(planningUnitManagerIndex(d, "2026-10-12"), {
    t: "Synthetic owner",
    unit: "Synthetic leader",
    other: "",
  });
  assert.deepEqual(d, before);
  d.resources[0].versions[0].end = "2026-10-11";
  d.resources[1].versions[0].assignmentRole = "member";
  assert.deepEqual(planningUnitManagerIndex(d, "2026-10-12"), {
    t: "",
    unit: "",
    other: "",
  });
});

test("Team Member, Product Owner and CoE can save with only a team, including independent teams", () => {
  for (const role of ["member", "productOwner", "coe"]) {
    for (const standalone of [false, true]) {
      const d = fixture();
      if (standalone) d.teams.find((t) => t.id === "t").lead = "";
      const resource = person("only-team", role, { lead: "" });
      const editor = {
        kind: "resource",
        isNew: true,
        value: { ...resource, versions: [] },
        version: resource.versions[0],
        assignmentKind: role,
        baseRevisions: captureEditorRevisions(d),
      };
      const before = structuredClone(editor);
      const changes = prepareEditorChanges(d, editor, {
        start: "2026-01",
        resourceIds: [],
      });
      assert.equal(changes.length, 1);
      const saved = changes[0].value;
      assert.equal(saved.versions[0].lead, standalone ? "" : "A");
      assert.equal(
        validate({ ...d, resources: [resource] }).resources[0].versions[0].lead,
        standalone ? "" : "A",
      );
      assert.equal(
        validate({ ...d, resources: [saved] }).resources[0].versions[0]
          .assignmentRole,
        role,
      );
      assert.deepEqual(editor, before);
    }
  }
});

test("independent Product Owners still conflict and leader assignments still require leadership", () => {
  const d = fixture(
    person("owner", "productOwner", { lead: "" }),
    person("new", "productOwner", { lead: "" }),
  );
  d.teams.find((t) => t.id === "t").lead = "";
  conflict(() => validate(d), "Synthetic owner");
  assert.throws(
    () =>
      validate(fixture(person("leader", "leader", { team: "t", lead: "" }))),
    /geçerli liderlik/,
  );
  const one = fixture(person("member", "member"));
  one.teams.find((t) => t.id === "other").lead = "";
  const changes = prepareEditorChanges(
    one,
    {
      kind: "bulkResources",
      effective: "2026-01",
      team: "other",
      lead: "",
      status: "",
      included: "keep",
      baseRevisions: captureEditorRevisions(one),
    },
    { start: "2026-01", resourceIds: ["member"] },
  );
  assert.equal(changes.length, 1);
  assert.equal(changes[0].value.versions[0].lead, "");
  assert.doesNotThrow(() =>
    validate({ ...one, resources: [changes[0].value] }),
  );
});

test("CoE behaves like a member: multiple assignments allowed, no directory manager or extra access", async () => {
  const { scopeData } = await import("../shared/access.ts");
  const { resourceCapacity } = await import("../shared/model.ts");
  const d = fixture(
    person("coe-a", "coe"),
    person("coe-b", "coe"),
    person("peer", "member"),
  );
  const valid = validate(d);
  assert.deepEqual(directoryResponsibilityIndex(valid, "2026-10-14"), {
    leaders: {},
    teams: {},
  });
  assert.equal(
    resourceCapacity(valid.resources[0].versions[0], "2026-10"),
    resourceCapacity(valid.resources[2].versions[0], "2026-10"),
  );
  const user = { id: "u", role: "normal", resourceId: "coe-a", leaders: [] };
  const member = structuredClone(valid);
  member.resources[0].versions[0].assignmentRole = "member";
  const coeScope = scopeData(valid, user),
    memberScope = scopeData(member, user);
  coeScope.resources.find((r) => r.id === "coe-a").versions[0].assignmentRole =
    "member";
  assert.deepEqual(coeScope, memberScope);
});
