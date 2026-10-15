import { schemaVersion } from "../backend/migration-catalog.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { validate } from "../shared/server-domain.ts";
import { orderedProjects } from "../shared/project-order.ts";
import { prepareProjectReorder } from "../frontend/src/features/project-order-commands.ts";

const project = (id) => ({
  id,
  name: id,
  start: "2026-01",
  end: "2026-12",
  phases: { "2026-03": "Design" },
  phaseColors: { "2026-03": "blue" },
  responsibleName: "Owner",
  milestones: [
    {
      id: "topic",
      name: "Heading",
      start: "2026-03-01",
      end: "2026-03-05",
      barNotes: [
        {
          text: "Important note",
          includeInReport: true,
          start: "2026-03-01",
          end: "2026-03-05",
        },
      ],
    },
  ],
});
const fixture = () => ({
  teams: [{ id: "t", name: "Team", lead: "", excelCapacity: 0 }],
  resources: [],
  leaders: [],
  allocations: {},
  revisions: { "project:a": 3, "project:b": 2, "project:c": 1 },
  projects: ["a", "b", "c"].map(project),
});

test("project reorder retains filtered-out projects and all phase/note metadata", () => {
  const data = fixture(),
    original = structuredClone(data);
  const commands = prepareProjectReorder(data, "c", "a", false, ["a", "c"]);
  applyChanges(
    data,
    { role: "admin", _id: "root-admin", leaders: [] },
    commands,
  );
  assert.deepEqual(
    data.projects.map((p) => p.id),
    ["c", "a", "b"],
  );
  for (const p of data.projects) {
    const { sortOrder, ...rest } = p;
    assert.deepEqual(
      rest,
      original.projects.find((x) => x.id === p.id),
    );
  }
  assert.deepEqual(original, fixture());
  assert.equal(commands.find((c) => c.id === "a").revision, 3);
  assert.deepEqual(
    prepareProjectReorder(data, "c", "a", false, ["c", "a"]),
    [],
  );
  assert.throws(
    () => prepareProjectReorder(data, "c", "a", false, ["a", "c"]),
    /sıralaması değişmiş/,
  );
  assert.throws(
    () => prepareProjectReorder(data, "c", "missing", false, ["c", "a"]),
    /bulunamadı/,
  );
});

test("project ordering rejects invalid ranks and treats legacy order and both drop sides consistently", () => {
  const data = fixture();
  assert.deepEqual(
    orderedProjects(data.projects).map((p) => p.id),
    ["a", "b", "c"],
  );
  const commands = prepareProjectReorder(data, "a", "c", true, ["a", "b", "c"]);
  applyChanges(
    data,
    { role: "admin", _id: "root-admin", leaders: [] },
    commands,
  );
  assert.deepEqual(
    data.projects.map((p) => p.id),
    ["b", "c", "a"],
  );
  for (const sortOrder of [-1, 0.5, 1000000001, NaN, "1"]) {
    const copy = fixture();
    copy.projects[0].sortOrder = sortOrder;
    assert.throws(() => validate(copy));
  }
  const duplicate = fixture();
  duplicate.projects[0].sortOrder = duplicate.projects[1].sortOrder = 1;
  assert.throws(() => validate(duplicate), /sıralama değerleri/);
});

test("project order persists through restart, content edits, additions and backup validation; unauthorized/stale batches roll back", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-project-order-"));
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
  };
  let store = new Store({ env });
  t.after(async () => {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await store.connect();
  await store.bootstrapUser({
    _id: "root-admin",
    username: "order-test",
    name: "Synthetic Admin",
    role: "admin",
    leaders: [],
    resourceId: "",
    active: true,
    password: await hashPassword("Project-order-only-128!"),
    version: 1,
    revision: 1,
  });
  const actor = await store.findUser({ id: "root-admin" });
  await store.bootstrapUser({
    _id: "normal",
    username: "order-normal",
    name: "Synthetic Normal",
    role: "normal",
    leaders: [],
    resourceId: "",
    active: true,
    password: actor.password,
    version: 1,
    revision: 1,
  });
  await store.mutate(actor, (d, u) =>
    applyChanges(
      d,
      u,
      ["a", "b", "c"].map((id) => ({
        kind: "project",
        id,
        value: project(id),
        revision: 0,
      })),
    ),
  );
  const before = await store.read();
  const commands = prepareProjectReorder(before.data, "c", "a", false, [
    "a",
    "b",
    "c",
  ]);
  const normal = await store.findUser({ id: "normal" });
  await assert.rejects(
    () => store.mutate(normal, (d, u) => applyChanges(d, u, commands)),
    { status: 403 },
  );
  assert.deepEqual(await store.read(), before);
  const stale = commands.map((c, i) => ({
    ...c,
    revision: i === commands.length - 1 ? c.revision + 1 : c.revision,
  }));
  await assert.rejects(
    () => store.mutate(actor, (d, u) => applyChanges(d, u, stale)),
    { status: 409 },
  );
  assert.deepEqual(await store.read(), before);
  await store.mutate(actor, (d, u) => applyChanges(d, u, commands));
  const ordered = await store.read();
  assert.deepEqual(
    ordered.data.projects.map((p) => p.id),
    ["c", "a", "b"],
  );
  assert.deepEqual(validate(ordered.data).projects, ordered.data.projects);
  await store.close();
  store = new Store({ env });
  await store.connect();
  assert.deepEqual(await store.read(), ordered);
  const freshActor = await store.findUser({ id: "root-admin" });
  await store.mutate(freshActor, (d, u) =>
    applyChanges(d, u, [
      {
        kind: "project",
        id: "c",
        value: { ...project("c"), name: "Renamed" },
        revision: d.revisions["project:c"],
      },
      { kind: "project", id: "new", value: project("new"), revision: 0 },
    ]),
  );
  const added = await store.read();
  assert.deepEqual(
    added.data.projects.map((p) => p.id),
    ["c", "a", "b", "new"],
  );
  assert.equal(added.data.projects[0].sortOrder, 0);
  assert.equal(added.data.projects.at(-1).sortOrder, 3);
  assert.equal(added.data.projects[0].name, "Renamed");
  const audit = (
    await store.db.query(
      "SELECT changes FROM kp_audit_events WHERE record_id='c' ORDER BY occurred_at",
    )
  ).rows;
  assert(
    audit.some((r) =>
      JSON.parse(r.changes).some((c) => c.path.includes("sortOrder")),
    ),
  );
});

test("migration 30 preserves legacy model/history, runs once and enforces rank bounds", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-order-migration-"));
  const env = {
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
  };
  let store = new Store({ env });
  t.after(async () => {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await store.connect();
  await store.transaction(async (c) => {
    const prev = (await store.read(c)).data;
    await store.persist(
      prev,
      validate({ ...prev, projects: [project("legacy")] }),
      c,
    );
    await c.query("ALTER TABLE kp_projects DROP COLUMN sort_order");
    await c.query("DELETE FROM kp_schema_migrations WHERE version=30");
  });
  await store.close();
  store = new Store({ env });
  await store.connect();
  const before = await store.read();
  assert.equal(before.data.projects[0].sortOrder, undefined);
  assert.equal(before.data.projects[0].phases["2026-03"], "Design");
  assert.equal(
    (await store.db.query("SELECT MAX(version) AS v FROM kp_schema_migrations"))
      .rows[0].v,
    schemaVersion,
  );
  await assert.rejects(() =>
    store.transaction((c) => c.query("UPDATE kp_projects SET sort_order=-1")),
  );
  await store.close();
  store = new Store({ env });
  await store.connect();
  assert.deepEqual(await store.read(), before);
});
