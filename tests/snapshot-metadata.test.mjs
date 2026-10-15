import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { snapshotMetadataReader } from "../backend/snapshot-metadata.mjs";
import { readPlanningSnapshot } from "../backend/planning-reader.mjs";
import { Store } from "../backend/store.mjs";
import { hashPassword, publicUser } from "../backend/auth.mjs";
import { seedBenchmarkStore } from "../scripts/benchmark-fixture.mjs";
import { changeAndView } from "../backend/change-service.mjs";
import { applyChanges } from "../backend/operations.mjs";

test("one snapshot's metadata batch uses the same ordered queries and never reuses prior results", async () => {
  const names = [
    "settings",
    "leaders",
    "riskSystems",
    "teams",
    "projects",
    "risks",
    "phases",
    "milestones",
    "resources",
    "resourceVersions",
  ];
  const queries = [];
  const ordinary = await snapshotMetadataReader({
    query: async (query) => {
      queries.push(query);
      return { rows: [{ value: queries.length }] };
    },
  });
  const expected = [];
  for (const name of names) expected.push(await ordinary(name));
  let batches = 0;
  const context = {
    queryMany: async (statements) => {
      batches++;
      assert.deepEqual(statements, queries);
      return expected.map((part, i) => ({
        rows: [{ value: part.rows[0].value + batches }],
      }));
    },
    query: () => {
      throw Error("No individual metadata query");
    },
  };
  for (let i = 1; i <= 2; i++) {
    const batched = await snapshotMetadataReader(context, { batch: true });
    for (const [index, name] of names.entries())
      assert.deepEqual(await batched(name), {
        rows: [{ value: index + 1 + i }],
      });
    assert.throws(() => batched("settings"), /repeated/);
    assert.throws(() => batched("constructor"), /Unknown/);
  }
  assert.equal(batches, 2);
  assert.throws(() => ordinary("__proto__"), /Unknown/);
  const fallbackQueries = [];
  const fallback = await snapshotMetadataReader(
    {
      query: async (q) => {
        fallbackQueries.push(q);
        return { rows: [] };
      },
    },
    { batch: true },
  );
  await fallback("settings");
  assert.deepEqual(fallbackQueries, [queries[0]]);
});

test("malformed, interrupted or incomplete metadata batches cannot become accepted snapshots", async () => {
  for (const result of [
    null,
    [],
    Array(9).fill({ rows: [] }),
    Array(11).fill({ rows: [] }),
    Array(10).fill({ rows: null }),
    Array(10),
  ])
    await assert.rejects(
      snapshotMetadataReader(
        { queryMany: async () => result },
        { batch: true },
      ),
      /incomplete/,
    );
  const error = Error("Synthetic batch interruption");
  await assert.rejects(
    snapshotMetadataReader(
      {
        queryMany: async () => {
          throw error;
        },
      },
      { batch: true },
    ),
    (e) => e === error,
  );
});

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-snapshot-metadata-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
    },
  });
  t.after(async () => {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await store.connect();
  await seedBenchmarkStore(store, 200, {
    resources: 8,
    actuals: 80,
    percentages: 80,
    calendarDays: 8,
  });
  const team = (await store.read()).data.teams.find((t) => t.lead);
  const users = {};
  const password = await hashPassword("Metadata-synthetic-only-492!");
  for (const [id, role, leaders] of [
    ["admin", "admin", []],
    ["manager", "manager", [team.lead]],
    ["normal", "normal", [team.lead]],
    ["unassigned", "manager", []],
  ]) {
    await store.bootstrapUser({
      _id: id,
      username: "metadata." + id,
      name: "Synthetic " + id,
      role,
      leaders,
      resourceId: role === "normal" ? "bench-r0" : "",
      active: true,
      password,
      revision: 1,
      version: 1,
    });
    users[id] = await store.findUser({ id });
  }
  await store.mutate(users.admin, (d, u) => {
    const p = d.projects[0];
    applyChanges(d, u, [
      {
        kind: "project",
        id: p.id,
        revision: 0,
        value: {
          ...p,
          responsibleName: "Synthetic owner",
          phases: { "2026-09": "Türkçe 😀" },
          phaseColors: { "2026-09": "green" },
          milestones: [
            {
              id: "m",
              name: "Başlık",
              start: "2026-09-01",
              end: "2026-09-03",
              barColor: "green",
              barStyle: "outline",
              barNotes: [
                { text: "Detay", includeInReport: true, completed: true },
              ],
              additionalRanges: [
                {
                  start: "2026-09-02",
                  end: "2026-09-02",
                  displayKind: "milestone",
                  diamondStyle: "outline",
                  description: "Hedef",
                  color: "purple",
                },
              ],
            },
          ],
        },
      },
    ]);
    applyChanges(d, u, [
      {
        kind: "calendar",
        id: "shared",
        revision: 0,
        value: {
          "2026-09-01": { type: "company", label: "Synthetic", fraction: 0.5 },
        },
      },
      {
        kind: "risk",
        id: "metadata-risk",
        revision: 0,
        value: {
          id: "metadata-risk",
          projectId: p.id,
          reportedBy: "Synthetic",
          category: "Teknik",
          reportedAt: "2026-09-01",
          system: "Legacy label",
          description: "Türkçe risk 😀",
          cause: "Cause",
          actionPlan: "Plan",
          targetAt: "",
          status: "Açık",
          owner: "Synthetic",
          likelihood: 2,
          impact: 3,
          strategy: "",
          implementedAt: "",
          actionResult: "",
          residualLikelihood: null,
          residualImpact: null,
          createdBy: u._id,
          createdByName: u.name,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      },
    ]);
    d.legacyArchive = { teams: [], allocations: {}, resourceTeams: {} };
    d.resources[0].code = "Synthetic";
    d.resources[0].note = "Only synthetic";
  });
  return { store, users };
}

test("batch and ordinary metadata produce identical full snapshots and role scoped views", async (t) => {
  const { store, users } = await fixture(t);
  await store.transaction(async (c) => {
    let batches = 0;
    const batchContext = {
      ...c,
      queryMany: async (queries) => {
        batches++;
        return Promise.all(queries.map((q) => c.query(q)));
      },
    };
    const full = await readPlanningSnapshot(c, "mssql");
    const batched = await readPlanningSnapshot(batchContext, "mssql");
    assert.deepEqual(batched, full);
    assert.equal(JSON.stringify(batched), JSON.stringify(full));
    assert.equal(batches, 1);
    for (const user of Object.values(users)) {
      assert.deepEqual(
        await store.projectView(
          structuredClone(batched.data),
          batched.generation,
          user,
          c,
        ),
        await store.projectView(
          structuredClone(full.data),
          full.generation,
          user,
          c,
        ),
      );
      const before = batches;
      const scoped = await readPlanningSnapshot(
        batchContext,
        "sqljs",
        publicUser(user),
      );
      assert.equal(batches, before); // Authenticated views retain their scoped ordinary reads.
      const reference = await readPlanningSnapshot(
        c,
        "sqljs",
        publicUser(user),
      );
      assert.deepEqual(
        await store.projectView(scoped.data, scoped.generation, user, c),
        await store.projectView(reference.data, reference.generation, user, c),
      );
    }
  }, true);
});

test("a failed metadata batch cannot run a mutation or advance values, revisions, generation or audit", async (t) => {
  const { store, users } = await fixture(t);
  const before = await store.view(users.admin),
    audit = (await store.auditLog(users.admin)).total;
  const read = store.read,
    error = Error("Synthetic incomplete metadata");
  let staged = false;
  const mock = t.mock.method(store, "read", function (c) {
    return readPlanningSnapshot(
      {
        ...c,
        queryMany: async () => {
          throw error;
        },
      },
      "mssql",
    );
  });
  await assert.rejects(
    store.mutate(users.admin, () => {
      staged = true;
    }),
    (e) => e === error,
  );
  mock.mock.restore();
  assert.equal(staged, false);
  assert.deepEqual(await store.view(users.admin), before);
  assert.equal((await store.auditLog(users.admin)).total, audit);
  const key = Object.keys(before.data.allocations)[0];
  await changeAndView(store, users.admin, [
    {
      kind: "allocation",
      id: key,
      value: 0.5,
      revision: before.data.revisions["allocation:" + key],
    },
  ]);
  assert.equal((await read.call(store)).data.allocations[key], 0.5);
});
