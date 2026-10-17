import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { seedBenchmarkStore } from "../scripts/benchmark-fixture.mjs";

const password = hashPassword("View-cache-test-only-284!");
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-view-cache-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "test.sqlite"),
    },
  });
  t.after(async () => {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await store.connect();
  await seedBenchmarkStore(store, 1000, {
    resources: 20,
    actuals: 200,
    percentages: 200,
    calendarDays: 20,
  });
  const team = (await store.read()).data.teams.find((x) => x.lead);
  const users = {};
  for (const [id, role, leaders, resourceId] of [
    ["admin", "admin", [], ""],
    ["manager", "manager", [team.lead], ""],
    ["normal", "normal", [team.lead], "bench-r0"],
    ["unassigned", "manager", [], ""],
    ["no-owner", "normal", [], ""],
  ]) {
    await store.bootstrapUser({
      _id: id,
      username: "viewcache." + id,
      name: "Synthetic " + id,
      role,
      leaders,
      resourceId,
      active: true,
      password: await password,
      revision: 1,
      version: 1,
    });
    users[id] = await store.findUser({ id });
  }
  // Counts complete snapshot reads, i.e. cache misses.
  let reads = 0;
  const read = store.read.bind(store);
  store.read = (...args) => {
    reads++;
    return read(...args);
  };
  const uncached = async (user) => {
    const age = store.viewCacheMaxAgeMs;
    store.viewCacheMaxAgeMs = 0;
    try {
      return await store.view(user);
    } finally {
      store.viewCacheMaxAgeMs = age;
    }
  };
  const rename = (name) =>
    store.mutate(users.admin, (d, u) => {
      const project = d.projects[0];
      return applyChanges(d, u, [
        {
          kind: "project",
          id: project.id,
          revision: d.revisions["project:" + project.id] || 0,
          value: { ...project, name },
        },
      ]);
    });
  return { store, users, uncached, rename, reads: () => reads };
}

test("cached views equal per-user narrowed reads for every role", async (t) => {
  const { store, users, uncached, rename } = await setup(t);
  for (const round of [0, 1]) {
    if (round) await rename("Renamed for the second round");
    for (const user of Object.values(users))
      assert.deepEqual(
        await store.view(user),
        await uncached(user),
        user._id + " round " + round,
      );
  }
});

test("one complete read serves every view of a generation; a save refreshes it", async (t) => {
  const { store, users, rename, reads } = await setup(t);
  const start = reads();
  for (const user of Object.values(users)) await store.view(user);
  await store.view(users.admin);
  assert.equal(reads() - start, 1);
  const before = await store.view(users.admin);
  await rename("Cache refresh project");
  const after = await store.view(users.admin);
  assert.equal(after.generation, before.generation + 1);
  assert.equal(after.data.projects[0].name, "Cache refresh project");
});

test("changes made outside the application are picked up", async (t) => {
  const { store, users } = await setup(t);
  const first = await store.view(users.admin);
  const id = first.data.projects[0].id;
  const edit = (name, bump) =>
    store.transaction((c) =>
      c.query(
        "UPDATE kp_projects SET name=@p0 WHERE id=@p1" +
          (bump
            ? "; UPDATE kp_settings SET generation=generation+1 WHERE id=1"
            : ""),
        [name, id],
      ),
    );
  const name = async () =>
    (await store.view(users.admin)).data.projects.find((p) => p.id === id).name;
  // Another server instance saving bumps the generation: seen at once.
  await edit("External with generation", false);
  await store.transaction((c) =>
    c.query("UPDATE kp_settings SET generation=generation+1 WHERE id=1"),
  );
  assert.equal(await name(), "External with generation");
  // A manual SQL fix without a generation bump: seen after the maximum age.
  await edit("Manual SQL fix", false);
  assert.equal(await name(), "External with generation");
  store.viewCacheMaxAgeMs = 1;
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await name(), "Manual SQL fix");
});

test("callers cannot change the shared snapshot", async (t) => {
  const { store, users } = await setup(t);
  // /api/backup removes accounts from its copy of the admin view.
  const view = await store.view(users.admin);
  delete view.data.users;
  view.data.revisions = {};
  const again = await store.view(users.admin);
  assert(again.data.users.length >= 5);
  assert(Object.keys(again.data.revisions).length > 0);
  // Nested records are frozen: an accidental edit fails loudly.
  assert.throws(() => {
    again.data.projects[0].name = "Edited in place";
  }, TypeError);
  assert.notEqual(
    (await store.view(users.admin)).data.projects[0].name,
    "Edited in place",
  );
});

test("VIEW_CACHE_MAX_AGE_MS must be zero or a positive number", () => {
  for (const value of ["-1", "abc"])
    assert.throws(
      () =>
        new Store({
          env: { DB_PROVIDER: "sqljs", VIEW_CACHE_MAX_AGE_MS: value },
        }),
      /VIEW_CACHE_MAX_AGE_MS/,
    );
});
