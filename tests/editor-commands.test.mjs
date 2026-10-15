import test from "node:test";
import assert from "node:assert/strict";
import { captureEditorRevisions } from "../frontend/src/features/editor-revisions.ts";
import { prepareEditorChanges } from "../frontend/src/features/editor-commands.ts";
import { applyChanges } from "../backend/operations.mjs";
import { validate, buildCapacityIndex } from "../shared/server-domain.ts";
const context = { start: "2026-10", resourceIds: [] };
const admin = { _id: "root-admin", role: "admin", leaders: [] };
const version = {
  effective: "2026-01",
  team: "t",
  lead: "A",
  status: "Aktif Çalışan",
  included: true,
  start: "2026-01-01",
  end: "",
  amount: 1,
};
const fixture = () => ({
  teams: [
    { id: "t", name: "Takım", lead: "A", excelCapacity: 0, catalog: true },
    {
      id: "unassigned",
      name: "Eşleşmemiş",
      lead: "",
      excelCapacity: 0,
      catalog: true,
    },
  ],
  projects: [
    { id: "p", name: "Proje", start: "2026-01", end: "2026-12", phases: {} },
  ],
  resources: [
    { id: "r", name: "Çalışan", note: "", versions: [{ ...version }] },
  ],
  allocations: {},
  revisions: { "project:p": 4, "resource:r": 2 },
  leaders: ["A", "B"],
  catalogVersion: 2,
});
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const milestone = () => ({
  id: "m",
  name: "  Kritik Konu  ",
  start: "2026-10-10",
  end: "2026-10-20",
  barStyle: "outline",
  barNotes: [
    {
      text: "Detay",
      includeInReport: true,
      start: "2026-10-12",
      end: "2026-10-18",
    },
  ],
});

test("new topics append even with earlier dates; edits keep their existing row", () => {
  const data = fixture();
  const current = milestone();
  data.projects[0].milestones = [
    current,
    { ...structuredClone(current), id: "second", name: "Second" },
  ];
  const editor = {
    baseRevisions: captureEditorRevisions(data),
    kind: "milestone",
    projectId: "p",
    isNew: true,
    draftEmpty: true,
    value: {
      ...milestone(),
      id: "new",
      start: "2026-01-01",
      end: "2026-01-01",
    },
  };
  const saved = prepareEditorChanges(data, editor, context)[0].value;
  assert.deepEqual(
    saved.milestones.map((m) => m.id),
    ["m", "second", "new"],
  );
  const edited = prepareEditorChanges(
    { ...data, projects: [saved] },
    {
      ...editor,
      isNew: false,
      value: { ...current, name: "Changed" },
    },
    context,
  )[0].value;
  assert.deepEqual(
    edited.milestones.map((m) => m.id),
    ["m", "second", "new"],
  );
  assert.equal(edited.milestones[0].name, "Changed");
  assert.throws(
    () => prepareEditorChanges(data, { ...editor, isNew: false }, context),
    /bulunamadı/,
  );
});

test("editor prepares revision-aware project updates without changing the draft or source", () => {
  const data = freeze(fixture());
  const editor = freeze({
    baseRevisions: captureEditorRevisions(data),
    kind: "project",
    isNew: false,
    value: { ...data.projects[0], name: "Yeni ad" },
  });
  const changes = prepareEditorChanges(data, editor, context);
  assert.equal(changes[0].revision, 4);
  assert.equal(data.projects[0].name, "Proje");
  const saved = structuredClone(data);
  applyChanges(saved, admin, changes);
  validate(saved);
  assert.equal(saved.projects[0].name, "Yeni ad");
  assert.throws(
    () => applyChanges(saved, admin, changes),
    (error) => error.status === 409,
  );
});
test("phase editor rejects a month outside the project dates", () => {
  const data = fixture();
  const editor = {
    baseRevisions: captureEditorRevisions(data),
    kind: "projectPhase",
    value: data.projects[0],
    phaseMonth: "2027-01",
  };
  assert.throws(
    () => prepareEditorChanges(data, editor, context),
    /proje dönemi/,
  );
  assert.equal(
    prepareEditorChanges(data, { ...editor, phaseMonth: "2026-12" }, context)
      .length,
    1,
  );
});
test("critical topic preparation preserves enclosing dates and allows a topic with no notes", () => {
  const data = freeze(fixture());
  const editor = freeze({
    baseRevisions: captureEditorRevisions(data),
    kind: "milestone",
    projectId: "p",
    isNew: true,
    draftEmpty: false,
    value: milestone(),
  });
  const changes = prepareEditorChanges(data, editor, context);
  const saved = structuredClone(data);
  applyChanges(saved, admin, changes);
  validate(saved);
  const topic = saved.projects[0].milestones[0];
  assert.equal(topic.name, "Kritik Konu");
  assert.equal(topic.start, "2026-10-10");
  assert.equal(topic.end, "2026-10-20");
  assert.equal(topic.barNotes[0].includeInReport, true);
  const empty = prepareEditorChanges(
    data,
    { ...editor, draftEmpty: true },
    context,
  )[0].value.milestones[0];
  assert.equal(empty.hasCriticalTopics, false);
  assert.equal(data.projects[0].milestones, undefined);
});
test("critical topic preparation rejects missing projects and overlapping date ranges before saving", () => {
  const data = fixture();
  const editor = {
    baseRevisions: captureEditorRevisions(data),
    kind: "milestone",
    projectId: "p",
    isNew: true,
    draftEmpty: false,
    value: {
      ...milestone(),
      additionalRanges: [
        {
          start: "2026-10-15",
          end: "2026-10-25",
          notes: [{ text: "İkinci", includeInReport: true }],
        },
      ],
    },
  };
  assert.throws(
    () => prepareEditorChanges(data, editor, context),
    /diğer kritik tarihlerin/,
  );
  assert.throws(
    () =>
      prepareEditorChanges(data, { ...editor, projectId: "missing" }, context),
    /Proje bulunamadı/,
  );
});
test("new resource uses its team leadership without binding an independent team", () => {
  const data = freeze(fixture());
  const editor = freeze({
    baseRevisions: captureEditorRevisions(data),
    kind: "resource",
    isNew: true,
    value: { id: "new", name: "Yeni çalışan", note: "", versions: [] },
    version: { ...version, team: "unassigned", start: "2026-04-12" },
  });
  const changes = prepareEditorChanges(data, editor, context);
  assert.deepEqual(
    changes.map((c) => c.kind),
    ["resource"],
  );
  assert.equal(changes[0].value.versions[0].effective, "2026-04");
  assert.equal(changes[0].value.versions[0].lead, "");
  const saved = structuredClone(data);
  applyChanges(saved, admin, changes);
  validate(saved);
  assert.equal(saved.teams.find((t) => t.id === "unassigned").lead, "");
  assert.equal(data.teams[1].lead, "");
});
test("resource edits retain date and leadership checks and explain stale team selections", () => {
  const data = fixture();
  const editor = {
    baseRevisions: captureEditorRevisions(data),
    kind: "resource",
    isNew: false,
    value: data.resources[0],
    version,
  };
  for (const [patch, message] of [
    [{ start: "" }, /İşbaşı Tarihi/],
    [{ status: "İşten Ayrıldı", end: "" }, /iki|işten ayrılış/],
    [{ end: "2025-12-31" }, /önce olamaz/],
    [{ team: "missing" }, /takım bulunamadı/],
  ])
    assert.throws(
      () =>
        prepareEditorChanges(
          data,
          { ...editor, version: { ...version, ...patch } },
          context,
        ),
      message,
    );
});
test("bulk resource edits preserve history, deduplicate selections and keep source data unchanged", () => {
  const data = fixture();
  data.resources[0].versions.push({
    ...version,
    effective: "2026-09",
    amount: 0.5,
  });
  freeze(data);
  const editor = freeze({
    baseRevisions: captureEditorRevisions(data),
    kind: "bulkResources",
    effective: "2026-10",
    team: "",
    lead: "",
    status: "",
    included: "no",
  });
  const changes = prepareEditorChanges(data, editor, {
    ...context,
    resourceIds: ["r", "r"],
  });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].revision, 2);
  const saved = structuredClone(data);
  applyChanges(saved, admin, changes);
  validate(saved);
  assert.deepEqual(
    saved.resources[0].versions.slice(0, 2),
    data.resources[0].versions,
  );
  assert.equal(saved.resources[0].versions[2].included, false);
  assert.equal(saved.resources[0].versions[2].amount, 0.5);
});
test("bulk resource edits fail clearly for removed selections without partially changing a team", () => {
  const data = freeze(fixture());
  const editor = {
    baseRevisions: captureEditorRevisions(data),
    kind: "bulkResources",
    effective: "2026-10",
    team: "unassigned",
    lead: "A",
    status: "",
    included: "keep",
  };
  assert.throws(
    () =>
      prepareEditorChanges(data, editor, {
        ...context,
        resourceIds: ["r", "missing"],
      }),
    /kaynak bulunamadı/,
  );
  assert.equal(data.teams[1].lead, "");
  assert.throws(
    () =>
      prepareEditorChanges(
        data,
        { ...editor, team: "missing" },
        { ...context, resourceIds: ["r"] },
      ),
    /takım bulunamadı/,
  );
  assert.throws(
    () => prepareEditorChanges(data, editor, context),
    /En az bir kayıt/,
  );
});

test("all entity editor drafts retain opening revisions after a background snapshot changes", () => {
  for (const kind of [
    "project",
    "projectPhase",
    "milestone",
    "resource",
    "bulkResources",
  ]) {
    const data = fixture();
    data.projects[0].milestones = [milestone()];
    const baseRevisions = captureEditorRevisions(data);
    const draft =
      kind === "resource"
        ? {
            kind,
            baseRevisions,
            isNew: false,
            value: structuredClone(data.resources[0]),
            version: { ...version },
          }
        : kind === "bulkResources"
          ? {
              kind,
              baseRevisions,
              effective: "2026-10",
              team: "",
              lead: "",
              status: "",
              included: "no",
            }
          : kind === "milestone"
            ? {
                kind,
                baseRevisions,
                isNew: false,
                draftEmpty: false,
                projectId: "p",
                value: milestone(),
              }
            : {
                kind,
                baseRevisions,
                isNew: false,
                phaseMonth: "2026-10",
                value: structuredClone(data.projects[0]),
              };
    const target =
      kind === "resource" || kind === "bulkResources" ? "resource" : "project";
    const id = target === "resource" ? "r" : "p";
    const opening = data.revisions[target + ":" + id];
    applyChanges(data, admin, [
      {
        kind: target,
        id,
        revision: opening,
        value:
          target === "resource"
            ? { ...data.resources[0], note: "Remote note" }
            : { ...data.projects[0], responsibleName: "Remote owner" },
      },
    ]);
    const afterRemote = structuredClone(data);
    const changes = prepareEditorChanges(data, draft, {
      ...context,
      resourceIds: ["r"],
    });
    assert.equal(changes.at(-1).revision, opening, kind);
    assert.throws(
      () => applyChanges(data, admin, changes),
      (error) => error.status === 409,
      kind,
    );
    assert.deepEqual(data, afterRemote);
    assert.equal(baseRevisions[target + ":" + id], opening);
  }
});

test("resource saves use the current team leadership without overwriting a concurrently updated team", () => {
  const data = fixture();
  const draft = {
    kind: "resource",
    baseRevisions: captureEditorRevisions(data),
    isNew: true,
    value: { id: "new", name: "Synthetic", note: "", versions: [] },
    version: { ...version, team: "unassigned" },
  };
  data.teams[1].lead = "B";
  data.revisions["team:unassigned"] = 1;
  const teamBefore = structuredClone(data.teams[1]);
  const commands = prepareEditorChanges(data, draft, context);
  assert.deepEqual(
    commands.map((c) => c.kind),
    ["resource"],
  );
  assert.equal(commands[0].value.versions[0].lead, "B");
  applyChanges(data, admin, commands);
  assert.deepEqual(data.teams[1], teamBefore);
  assert.equal(data.revisions["team:unassigned"], 1);
});

test("leader resource selects a direct leadership owner without a team; member still requires a real team", async () => {
  const { ensureLeadershipUnits } =
    await import("../shared/leadership-units.ts");
  const data = fixture();
  ensureLeadershipUnits(data);
  const editor = {
    kind: "resource",
    value: structuredClone(data.resources[0]),
    version: { ...version, team: "", lead: "A" },
    isNew: false,
    assignmentKind: "leader",
    baseRevisions: captureEditorRevisions(data),
  };
  const changes = prepareEditorChanges(data, editor, context);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].value.versions.at(-1).team, data.leadershipUnits.A);
  assert.equal(changes[0].value.versions.at(-1).lead, "A");
  assert.throws(
    () =>
      prepareEditorChanges(
        data,
        { ...editor, assignmentKind: "member" },
        context,
      ),
    /Takım seçin/,
  );
  assert.throws(
    () =>
      prepareEditorChanges(
        data,
        {
          ...editor,
          assignmentKind: "member",
          version: { ...editor.version, team: data.leadershipUnits.A },
        },
        context,
      ),
    /Product Owner, Team Member ve CoE/,
  );
  assert.throws(
    () =>
      prepareEditorChanges(
        data,
        { ...editor, version: { ...editor.version, lead: "" } },
        context,
      ),
    /Liderlik seçin/,
  );
});

test("AD employee names drive save commands without overwriting the manual draft; selection is required", () => {
  const data = freeze(fixture());
  const editor = freeze({
    kind: "resource",
    baseRevisions: captureEditorRevisions(data),
    isNew: true,
    value: { id: "new-ad", name: "Manual draft", note: "", versions: [] },
    version,
    account: {
      changed: true,
      form: {
        id: "",
        role: "normal",
        leaders: [],
        resourceId: "new-ad",
        revision: 0,
        directoryUser: {
          id: "f".repeat(32),
          name: "AD Display Name",
          username: "qa.ad",
          email: "qa@example.test",
        },
      },
    },
  });
  assert.equal(
    prepareEditorChanges(data, editor, context).at(-1).value.name,
    "AD Display Name",
  );
  assert.equal(editor.value.name, "Manual draft");
  const noAccount = { ...editor, account: { form: null, changed: false } };
  assert.equal(
    prepareEditorChanges(data, noAccount, context).at(-1).value.name,
    "Manual draft",
  );
  const unselected = {
    ...editor,
    account: {
      ...editor.account,
      form: { ...editor.account.form, directoryUser: undefined },
    },
  };
  assert.throws(
    () => prepareEditorChanges(data, unselected, context),
    /Active Directory kullanıcısı seçin/,
  );
});
test("linked AD employee commands retain the authoritative account name while local employee names stay editable", () => {
  const data = fixture();
  data.users = [
    {
      id: "ad-account",
      name: "AD Linked Name",
      authSource: "ldap",
      resourceId: "r",
      role: "normal",
      leaders: [],
      active: true,
    },
    {
      id: "local-account",
      name: "Local Account",
      authSource: "local",
      resourceId: "",
      role: "normal",
      leaders: [],
      active: true,
    },
  ];
  const editor = {
    kind: "resource",
    baseRevisions: captureEditorRevisions(data),
    isNew: false,
    value: { ...data.resources[0], name: "Manual override" },
    version,
    account: {
      changed: false,
      form: {
        id: "ad-account",
        role: "normal",
        leaders: [],
        resourceId: "r",
        revision: 1,
      },
    },
  };
  assert.equal(
    prepareEditorChanges(data, editor, context).at(-1).value.name,
    "AD Linked Name",
  );
  editor.account.form.id = "local-account";
  assert.equal(
    prepareEditorChanges(data, editor, context).at(-1).value.name,
    "Manual override",
  );
});

for (const status of ["Aktif İlan", "Pasif İlan"]) {
  test(`${status}: a nameless posting saves without an employee role and respects capacity rules`, () => {
    const data = freeze(fixture());
    const editor = freeze({
      baseRevisions: captureEditorRevisions(data),
      kind: "resource",
      isNew: true,
      assignmentKind: "leader", // A previously selected hidden role must not redirect the vacancy.
      value: { id: "posting", name: "", note: "", versions: [] },
      version: {
        ...version,
        status,
        assignmentRole: "leader",
        start: "2026-10-16",
        included: true,
      },
    });
    const changes = prepareEditorChanges(data, editor, context);
    const saved = structuredClone(data);
    applyChanges(saved, admin, changes);
    validate(saved);
    const posting = saved.resources.find((r) => r.id === "posting");
    assert.equal(posting.name, status);
    const v = posting.versions[0];
    assert.equal(v.team, "t");
    assert.equal(v.assignmentRole, undefined);
    assert.equal(v.start, status === "Aktif İlan" ? "2026-10-16" : "");
    assert.equal(v.included, status === "Aktif İlan");
    const capacity = buildCapacityIndex(saved, ["2026-10"])["t|2026-10"]
      .current;
    assert.equal(capacity, status === "Aktif İlan" ? 1 + 16 / 31 : 1);
    assert.equal(editor.value.name, "");
    assert.equal(editor.version.included, true);
  });
}

test("active postings still require an estimated start only when included in planning", () => {
  const data = fixture();
  const editor = {
    baseRevisions: captureEditorRevisions(data),
    kind: "resource",
    isNew: true,
    value: { id: "posting", name: "", note: "", versions: [] },
    version: { ...version, status: "Aktif İlan", start: "", included: true },
  };
  assert.throws(
    () => prepareEditorChanges(data, editor, context),
    /İşbaşı Tarihi/,
  );
  const changes = prepareEditorChanges(
    data,
    {
      ...editor,
      version: { ...editor.version, included: false },
    },
    context,
  );
  const saved = structuredClone(data);
  applyChanges(saved, admin, changes);
  validate(saved);
  assert.equal(saved.resources.at(-1).versions[0].included, false);
});

test("switching an existing employee to passive posting keeps the name and previous employment history", () => {
  const data = fixture();
  const resource = data.resources[0];
  const editor = {
    baseRevisions: captureEditorRevisions(data),
    kind: "resource",
    isNew: false,
    value: resource,
    version: { ...version, effective: "2026-10", status: "Pasif İlan" },
  };
  const changes = prepareEditorChanges(data, editor, context);
  const saved = structuredClone(data);
  applyChanges(saved, admin, changes);
  validate(saved);
  assert.equal(saved.resources[0].name, resource.name);
  assert.deepEqual(saved.resources[0].versions[0], resource.versions[0]);
  assert.equal(saved.resources[0].versions[1].included, false);
  assert.equal(saved.resources[0].versions[1].start, "");
});

for (const status of [
  "Aktif Çalışan",
  "Gear Up",
  "SAAT Ücretli Ofis Ç.",
  "İşten Ayrıldı",
  "Aktif İlan",
  "Pasif İlan",
]) {
  test(`${status}: assignment follows the selected team's leadership and clears stale leadership for independent teams`, () => {
    const data = fixture();
    data.teams.push({ id: "b", name: "Team B", lead: "B", excelCapacity: 0 });
    const editor = {
      kind: "resource",
      baseRevisions: captureEditorRevisions(data),
      isNew: true,
      assignmentKind: "productOwner",
      value: {
        id: "new",
        name: status.includes("İlan") ? "" : "Synthetic",
        note: "",
        versions: [],
      },
      version: {
        ...version,
        team: "b",
        lead: "A",
        status,
        end: status === "İşten Ayrıldı" ? "2026-12-31" : "",
      },
    };
    for (const [team, lead] of [
      ["b", "B"],
      ["unassigned", ""],
    ]) {
      const changes = prepareEditorChanges(
        data,
        { ...editor, version: { ...editor.version, team } },
        context,
      );
      assert.equal(changes.length, 1);
      assert.equal(changes[0].kind, "resource");
      assert.equal(changes[0].value.versions[0].lead, lead);
      const saved = structuredClone(data);
      applyChanges(saved, admin, changes);
      validate(saved);
      assert.deepEqual(saved.teams, data.teams);
    }
  });
}
