import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { projectVisibility } from "../shared/project-access.ts";
import { scopeData, HIDDEN_PROJECT_ID } from "../shared/access.ts";
import { buildCapacityIndex } from "../shared/metrics.ts";

const month = "2026-03";
const version = (team, lead) => ({
  effective: "2026-01",
  start: "2026-01-01",
  end: "",
  team,
  lead,
  status: "Aktif Çalışan",
  included: true,
  amount: 1,
});
const restricted = (access) => ({
  roles: [],
  leaders: [],
  teams: [],
  people: [],
  ...access,
});
function sample() {
  const project = (id, access) => ({
    id,
    name: "Proje " + id,
    start: "2026-01",
    end: "2026-12",
    phases: {},
    milestones: [],
    ...(access ? { access } : {}),
  });
  return {
    leaders: ["Root", "Child", "Other"],
    leaderParents: { Child: "Root" },
    leadershipUnits: {},
    leaderManagers: {},
    teams: [
      { id: "a", name: "Team A", lead: "Root", excelCapacity: 0 },
      { id: "b", name: "Team B", lead: "Child", excelCapacity: 0 },
      { id: "c", name: "Team C", lead: "Other", excelCapacity: 0 },
    ],
    resources: [
      {
        id: "r-b",
        name: "Kişi B",
        note: "",
        versions: [version("b", "Child")],
      },
      {
        id: "r-c",
        name: "Kişi C",
        note: "",
        versions: [version("c", "Other")],
      },
    ],
    projects: [
      project("open"),
      project("admins", restricted({ people: ["nobody"] })),
      project("role", restricted({ roles: ["manager"] })),
      project("person", restricted({ people: ["r-b"] })),
      project("team", restricted({ teams: ["b"] })),
      project("lead", restricted({ leaders: ["Root"] })),
      project("planned", restricted({ people: ["nobody"] })),
      project("actual", restricted({ people: ["nobody"] })),
      project("empty", restricted({})),
    ],
    allocations: {
      ["c|planned|" + month]: 0.5,
      ["a|admins|" + month]: 2,
      ["a|open|" + month]: 1,
    },
    actualAllocations: { ["r-c|actual|" + month]: 0.25 },
    actualWorkedHours: {},
    actualPercentEntries: {},
    personCalendar: {},
    revisions: {
      ["allocation:a|admins|" + month]: 1,
      ["allocation:a|open|" + month]: 1,
    },
    risks: [],
  };
}
const visible = (data, user) => {
  const can = projectVisibility(data, user, month);
  return data.projects.filter((p) => can(p.id)).map((p) => p.id);
};

test("project rules are alternatives over person, team, leadership (with descendants) and role", () => {
  const data = sample();
  const user = (resourceId, extra = {}) => ({
    role: "normal",
    resourceId,
    leaders: [],
    ...extra,
  });
  assert.deepEqual(visible(data, { ...user(), role: "admin" }).length, 9);
  // Team B sits under Child, which sits under Root: person, team and the
  // Root leadership rule all match.
  assert.deepEqual(visible(data, user("r-b")), [
    "open",
    "person",
    "team",
    "lead",
    "empty",
  ]);
  // Team C has planned hours on "planned" and its member actual hours on
  // "actual": both stay visible without an explicit rule.
  assert.deepEqual(visible(data, user("r-c")), [
    "open",
    "planned",
    "actual",
    "empty",
  ]);
  // "Only selected" without any selection is the same as no rules: everyone.
  assert.deepEqual(visible(data, user(undefined)), ["open", "empty"]);
  // A manager granted Root manages teams a and b: role, team and leadership
  // rules match; Team A's planned hours keep "admins" visible.
  assert.deepEqual(
    visible(data, user(undefined, { role: "manager", leaders: ["Root"] })),
    ["open", "admins", "role", "team", "lead", "empty"],
  );
  // A team-only planning grant does not reach the Root leadership rule.
  assert.deepEqual(
    visible(data, user(undefined, { role: "manager", planningTeams: ["c"] })),
    ["open", "role", "planned", "actual", "empty"],
  );
});

test("scoped data drops hidden projects and their records but keeps team capacity totals", () => {
  const data = sample();
  const admin = { role: "admin", leaders: [] };
  const viewer = { role: "normal", resourceId: "r-b", leaders: [] };
  const scoped = scopeData(data, viewer);
  const ids = scoped.projects.map((p) => p.id);
  assert(!ids.includes("admins") && ids.includes("person"));
  assert(scoped.projects.every((p) => p.access === undefined));
  assert.equal(scoped.allocations["a|admins|" + month], undefined);
  assert.equal(scoped.allocations["a|open|" + month], 1);
  assert.equal(scoped.revisions["allocation:a|admins|" + month], undefined);
  assert.equal(scoped.hiddenAllocationTotals["a|" + month], 2);
  assert(
    !Object.keys(scoped.actualTeamTotals).some((key) =>
      ["planned", "actual", "admins"].includes(key.split("|")[1]),
    ),
  );
  assert(
    Object.keys(scoped.actualTeamTotals).every(
      (key) => !key.includes("|actual|") || key.includes(HIDDEN_PROJECT_ID),
    ),
  );
  const full = buildCapacityIndex(data, [month]);
  const partial = buildCapacityIndex(scoped, [month]);
  for (const team of scoped.teams)
    assert.equal(
      partial[team.id + "|" + month].total,
      full[team.id + "|" + month].total,
    );
  assert.equal(scopeData(data, admin), data);
});

test("restricted projects persist, reach only permitted users and reject writes from others", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-project-access-"));
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
  };
  let store = new Store({ env });
  try {
    await store.connect();
    const password = await hashPassword("Project-access-test-1!");
    await store.bootstrapUser({
      _id: "root-admin",
      username: "qa.admin",
      name: "Admin",
      role: "admin",
      resourceId: "",
      leaders: [],
      active: true,
      password,
      version: 1,
      revision: 1,
    });
    const admin = await store.findUser({ id: "root-admin" });
    const team = (await store.read()).data.teams.find((t) => t.lead);
    const resource = {
      id: "r-own",
      name: "Çalışan",
      note: "",
      versions: [version(team.id, team.lead)],
    };
    const secret = {
      id: "p-secret",
      name: "Gizli Proje",
      start: "2026-01",
      end: "2026-12",
      phases: {},
      milestones: [],
      access: restricted({ roles: ["manager"], people: ["r-other"] }),
    };
    await store.mutate(admin, (d, u) =>
      applyChanges(d, u, [
        { kind: "resource", id: resource.id, value: resource, revision: 0 },
        { kind: "project", id: secret.id, value: secret, revision: 0 },
      ]),
    );
    await store.bootstrapUser({
      _id: "employee",
      username: "qa.employee",
      name: "Çalışan",
      role: "normal",
      resourceId: "r-own",
      leaders: [team.lead],
      active: true,
      password,
      version: 1,
      revision: 1,
    });
    await store.close();
    store = new Store({ env });
    await store.connect();
    const saved = (await store.read()).data.projects.find(
      (p) => p.id === secret.id,
    );
    assert.deepEqual(saved.access, secret.access);
    const employee = await store.findUser({ id: "employee" });
    const scoped = scopeData((await store.read()).data, employee);
    assert(!scoped.projects.some((p) => p.id === secret.id));
    const key = "r-own|p-secret|2026-03";
    await assert.rejects(
      store.mutate(employee, (d, u) =>
        applyChanges(d, u, [
          { kind: "actual", id: key, value: 0.2, revision: 0 },
        ]),
      ),
      /görüntüleme yetkiniz yok/,
    );
    // Opening the project to everyone removes every stored rule.
    const { access: _rules, ...open } = saved;
    await store.mutate(admin, (d, u) =>
      applyChanges(d, u, [
        {
          kind: "project",
          id: secret.id,
          value: open,
          revision: d.revisions["project:" + secret.id],
        },
      ]),
    );
    assert.equal(
      (await store.db.query("SELECT COUNT(*) AS n FROM kp_project_access"))
        .rows[0].n,
      0,
    );
    await store.mutate(employee, (d, u) =>
      applyChanges(d, u, [
        { kind: "actual", id: key, value: 0.2, revision: 0 },
      ]),
    );
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
