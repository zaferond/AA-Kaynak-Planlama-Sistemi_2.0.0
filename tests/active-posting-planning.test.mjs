import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { validate, buildCapacityIndex } from "../shared/server-domain.ts";
import { activePostingPlanningChanges } from "../frontend/src/features/workspace/active-posting-changes.ts";

const today = "2026-10-14";
const admin = { _id: "root-admin", role: "admin", leaders: [] };
const version = (status, patch = {}) => ({
  effective: "2026-01",
  team: "t",
  lead: "L",
  status,
  included: false,
  start: "",
  end: "",
  amount: 1,
  ...patch,
});
const resource = (id, ...versions) => ({ id, name: id, note: "", versions });
const fixture = () => ({
  teams: [
    { id: "t", name: "Team", lead: "L", excelCapacity: 0 },
    { id: "other", name: "Other", lead: "M", excelCapacity: 0 },
  ],
  projects: [],
  allocations: {},
  revisions: { "resource:a": 3, "resource:b": 7 },
  leaders: ["L", "M"],
  catalogVersion: 2,
  resources: [
    resource("a", version("Aktif İlan", { amount: 2 })),
    resource(
      "b",
      version("Aktif İlan", { team: "other", lead: "M", start: "2026-12-01" }),
    ),
    resource("future", version("Aktif İlan", { effective: "2027-01" })),
    resource("passive", version("Pasif İlan")),
    ...[
      "Aktif Çalışan",
      "Gear Up",
      "SAAT Ücretli Ofis Ç.",
      "İşten Ayrıldı",
    ].map((status, i) =>
      resource(
        "employee" + i,
        version(status, {
          start: "2026-01-01",
          included: true,
          end: status === "İşten Ayrıldı" ? "2026-09-30" : "",
        }),
      ),
    ),
    resource(
      "filled",
      version("Aktif İlan"),
      version("Aktif Çalışan", {
        effective: "2026-09",
        start: "2026-09-01",
        included: true,
      }),
    ),
  ],
});

test("one batch includes all latest active postings from today across teams, including future vacancies", () => {
  const data = fixture(),
    original = structuredClone(data);
  const changes = activePostingPlanningChanges(data, true, today);
  assert.deepEqual(
    changes.map((c) => [c.id, c.revision]),
    [
      ["a", 3],
      ["b", 7],
      ["future", 0],
    ],
  );
  applyChanges(data, admin, changes);
  validate(data);
  for (const id of ["a", "b", "future"]) {
    const v = data.resources.find((r) => r.id === id).versions.at(-1);
    assert.equal(v.start, today);
    assert.equal(v.included, true);
    assert(v.effective <= "2026-10");
  }
  const capacity = buildCapacityIndex(data, ["2026-10", "2026-11"]);
  assert.equal(capacity["other|2026-10"].current, 18 / 31);
  assert.equal(capacity["other|2026-11"].current, 1);
  for (const r of original.resources.filter(
    (r) => !["a", "b", "future"].includes(r.id),
  ))
    assert.deepEqual(
      data.resources.find((saved) => saved.id === r.id),
      r,
    );
  assert.deepEqual(activePostingPlanningChanges(data, true, today), []);
  assert.deepEqual(original.resources[0].versions[0].start, "");
});

test("turning off clears vacancy dates and inclusion, preserves older history, and removes capacity", () => {
  const data = fixture();
  const past = version("Pasif İlan", { effective: "2025-01" });
  data.resources[0].versions.unshift(past);
  applyChanges(data, admin, activePostingPlanningChanges(data, true, today));
  applyChanges(data, admin, activePostingPlanningChanges(data, false, today));
  for (const id of ["a", "b", "future"]) {
    const v = data.resources.find((r) => r.id === id).versions.at(-1);
    assert.equal(v.start, "");
    assert.equal(v.included, false);
  }
  assert.deepEqual(data.resources.find((r) => r.id === "a").versions[0], past);
  assert.equal(
    buildCapacityIndex(data, ["2026-11"])["other|2026-11"].current,
    0,
  );
  assert.deepEqual(activePostingPlanningChanges(data, false, today), []);
  assert.deepEqual(
    activePostingPlanningChanges({ ...data, resources: [] }, true, today),
    [],
  );
});

test("batch preparation is pure and refuses invalid dates without changing source records", () => {
  const data = fixture(),
    before = structuredClone(data);
  assert.throws(
    () => activePostingPlanningChanges(data, true, "2026-02-30"),
    /Geçerli/,
  );
  assert.deepEqual(data, before);
  activePostingPlanningChanges(data, true, today);
  assert.deepEqual(data, before);
});

test("manager and normal users cannot update global active-posting settings", () => {
  for (const role of ["manager", "normal"]) {
    const data = fixture(),
      before = structuredClone(data);
    assert.throws(
      () =>
        applyChanges(
          data,
          { ...admin, role, leaders: ["L", "M"] },
          activePostingPlanningChanges(data, true, today),
        ),
      (e) => e.status === 403,
    );
    assert.deepEqual(data, before);
  }
});

test("a stale vacancy revision rolls back the entire batch in a temporary database", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-posting-toggle-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
    },
  });
  try {
    await store.connect();
    await store.bootstrapUser({
      ...admin,
      username: "synthetic.admin",
      name: "Synthetic",
      active: true,
      password: { salt: "test", hash: "test" },
      version: 1,
      revision: 1,
    });
    const actor = await store.findUser({ id: admin._id });
    const team = (await store.read()).data.teams.find((t) => t.lead);
    const resources = ["a", "b"].map((id) =>
      resource(id, version("Aktif İlan", { team: team.id, lead: team.lead })),
    );
    await store.mutate(actor, (data, u) =>
      applyChanges(
        data,
        u,
        resources.map((value) => ({
          kind: "resource",
          id: value.id,
          value,
          revision: 0,
        })),
      ),
    );
    const opening = (await store.read()).data;
    const changes = activePostingPlanningChanges(opening, true, today);
    await store.mutate(actor, (data, u) =>
      applyChanges(data, u, [
        {
          kind: "resource",
          id: "b",
          revision: opening.revisions["resource:b"],
          value: { ...resources[1], note: "Concurrent edit" },
        },
      ]),
    );
    const before = (await store.read()).data;
    await assert.rejects(
      () => store.mutate(actor, (data, u) => applyChanges(data, u, changes)),
      (e) => e.status === 409,
    );
    assert.deepEqual((await store.read()).data, before);
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
