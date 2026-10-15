import assert from "node:assert/strict";
import { seedBenchmarkStore } from "../scripts/benchmark-fixture.mjs";
import {
  planningCommand,
  preparePlanningCommand,
  stageChanges,
} from "../backend/operations.mjs";
import { readPlanningPreflight } from "../backend/planning-preflight.mjs";
import { hashPassword } from "../backend/auth.mjs";

export async function planningPreflightSuite(store, t) {
  await seedBenchmarkStore(store, 1000, {
    resources: 20,
    actuals: 200,
    percentages: 200,
    calendarDays: 20,
  });
  const initial = await store.read(),
    team = initial.data.teams.find((x) => x.lead),
    other = initial.data.teams.find((x) => x.lead && x.lead !== team.lead),
    key = Object.keys(initial.data.allocations).find((k) =>
      k.startsWith(team.id + "|"),
    ),
    otherKey = Object.keys(initial.data.allocations).find((k) =>
      k.startsWith(other.id + "|"),
    ),
    revision = initial.data.revisions["allocation:" + key];
  assert(key && otherKey && revision > 0);
  const password = await hashPassword("Synthetic-preflight-only-284!"),
    users = {};
  for (const [id, role, leaders] of [
    ["admin", "admin", []],
    ["manager", "manager", [team.lead]],
    ["unassigned", "manager", []],
    ["normal", "normal", []],
  ]) {
    await store.bootstrapUser({
      _id: "preflight-" + id,
      username: "preflight." + id,
      name: "Synthetic " + id,
      role,
      leaders,
      active: true,
      password,
      version: 1,
      revision: 1,
    });
    users[id] = await store.findUser({ id: "preflight-" + id });
  }
  const change = (id = key, rev = revision, extra = {}) => ({
    kind: "allocation",
    id,
    revision: rev,
    value: 2,
    ...extra,
  });
  const baseline = () =>
    store.transaction(
      async (c) => ({
        snapshot: await store.read(c),
        audit: (
          await c.query(
            "SELECT * FROM kp_audit_events ORDER BY kind,record_id,occurred_at,id",
          )
        ).rows,
      }),
      true,
    );
  const outcome = (fn) => {
    try {
      const d = fn();
      return {
        value: d.allocations[key],
        revision: d.revisions["allocation:" + key],
      };
    } catch (e) {
      return { status: e.status, message: e.message };
    }
  };
  await t.test(
    "single-cell preflight staging matches the complete snapshot for permissions, zeros, stale revisions and deletion tombstones",
    async () => {
      const empty = team.id + "|bench-p0|2030-01";
      // The tombstone is real: create and delete via the unchanged full callback.
      for (const extra of [{ value: 0 }, { operation: "delete" }])
        await store.mutate(users.admin, (d, u) =>
          stageChanges(d, u, [
            change(empty, d.revisions["allocation:" + empty] || 0, extra),
          ]),
        );
      await store.transaction(async (c) => {
        const snapshot = await store.read(c);
        const cases = [
          change(),
          change(key, revision, { value: 0 }),
          change(key, revision - 1),
          change(key, revision, { operation: "delete" }),
          change(otherKey, snapshot.data.revisions["allocation:" + otherKey]),
          change(empty, 2, { operation: "delete" }),
          change(empty, 1, { operation: "delete" }),
          change("missing|bench-p0|2026-01", 0, { operation: "delete" }),
          change(team.id + "|missing|2026-01", 0, { operation: "delete" }),
          change(team.id + "|bench-p0|2031-01", 0, { operation: "delete" }),
        ];
        for (const user of Object.values(users))
          for (const ch of cases) {
            const prepared = preparePlanningCommand(planningCommand([ch]));
            assert(prepared);
            const narrow = await readPlanningPreflight(c, prepared.id);
            const full = structuredClone(snapshot.data);
            const run = (data) => {
              prepared.stage(data, user);
              return data;
            };
            // Compare the target, not only the common first cell.
            const compare = (data) => {
              const result = outcome(() => run(data));
              if (!result.message) {
                result.value = data.allocations[ch.id];
                result.revision = data.revisions["allocation:" + ch.id];
              }
              return result;
            };
            assert.deepEqual(
              compare(narrow),
              compare(full),
              user.role + " / " + ch.id,
            );
          }
      }, true);
    },
  );
  await t.test(
    "stale and unauthorized owned writes reject before any complete snapshot and never change data, audit or generation",
    async () => {
      for (const [user, ch, status] of [
        [users.admin, change(key, revision - 1), 409],
        [users.manager, change(otherKey, 0), 403],
        [users.unassigned, change(), 403],
        [{ ...users.normal, role: "admin" }, change(), 403],
        [
          users.admin,
          change("missing|bench-p0|2026-01", 0, { operation: "delete" }),
          404,
        ],
      ]) {
        const before = await baseline(),
          read = store.read;
        let reads = 0;
        store.read = function (...args) {
          reads++;
          return read.apply(this, args);
        };
        try {
          await assert.rejects(
            store.mutate(user, planningCommand([ch])),
            (e) => e.status === status,
          );
        } finally {
          store.read = read;
        }
        assert.equal(reads, 0);
        assert.deepEqual(await baseline(), before);
      }
    },
  );
  await t.test(
    "passing preflight retains full validation of unrelated persisted data and rollback",
    async () => {
      const resource = initial.data.resources[0].id;
      await store.transaction((c) =>
        c.upsert("actual_allocations", [
          {
            resource_id: resource,
            project_id: "bench-p0",
            month: "2039-01",
            amount: 0.5,
          },
        ]),
      );
      try {
        const before = await baseline(),
          read = store.read;
        let reads = 0;
        store.read = function (...args) {
          reads++;
          return read.apply(this, args);
        };
        try {
          await assert.rejects(
            store.mutate(users.admin, planningCommand([change()])),
            /Geçersiz gerçekleşen dağılım kaydı/,
          );
        } finally {
          store.read = read;
        }
        assert.equal(reads, 1);
        assert.deepEqual(await baseline(), before);
      } finally {
        await store.transaction((c) =>
          c.remove("actual_allocations", [
            { resource_id: resource, project_id: "bench-p0", month: "2039-01" },
          ]),
        );
      }
    },
  );
  await t.test(
    "committed owned write equals rollback-only full reference including delta, full data, audit, revision and generation",
    async () => {
      const before = await baseline(),
        transaction = store.transaction,
        marker = new Error("synthetic reference rollback");
      let expected;
      const options = {
        returnView: true,
        planningDelta: {
          baseGeneration: before.snapshot.generation,
          ids: [key],
        },
      };
      store.transaction = function (fn, readOnly) {
        return transaction.call(
          this,
          async (c) => {
            const view = await fn(c);
            expected = {
              view,
              snapshot: await store.read(c),
              audit: (
                await c.query(
                  "SELECT * FROM kp_audit_events ORDER BY kind,record_id,occurred_at,id",
                )
              ).rows,
            };
            throw marker;
          },
          readOnly,
        );
      };
      try {
        await assert.rejects(
          store.mutate(
            users.manager,
            (d, u) => stageChanges(d, u, [change()]),
            options,
          ),
          (e) => e === marker,
        );
      } finally {
        store.transaction = transaction;
      }
      assert.deepEqual(await baseline(), before);
      const actual = await store.mutate(
          users.manager,
          planningCommand([change()]),
          options,
        ),
        after = await baseline();
      const audit = (rows) =>
        rows
          .map(({ id, occurred_at, ...rest }) => rest)
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      assert.deepEqual(actual, expected.view);
      assert.equal(actual.responseMode, "planning-delta-v1");
      assert.deepEqual(after.snapshot, expected.snapshot);
      assert.deepEqual(audit(after.audit), audit(expected.audit));
      assert.equal(after.snapshot.generation, before.snapshot.generation + 1);
      assert.equal(
        after.snapshot.data.revisions["allocation:" + key],
        revision + 1,
      );
    },
  );
  await t.test(
    "preflight uses current persisted leadership and account version, and read errors cannot reach persistence",
    async () => {
      await store.transaction((c) =>
        c.query("DELETE FROM kp_user_leaders WHERE user_id=@p0", [
          users.manager._id,
        ]),
      );
      const before = await baseline(),
        read = store.read;
      let reads = 0;
      store.read = function (...args) {
        reads++;
        return read.apply(this, args);
      };
      try {
        await assert.rejects(
          store.mutate(
            users.manager,
            planningCommand([change(key, revision + 1)]),
          ),
          (e) => e.status === 403,
        );
      } finally {
        store.read = read;
      }
      assert.equal(reads, 0);
      assert.deepEqual(await baseline(), before);
      await store.transaction((c) =>
        c.query("UPDATE kp_users SET version=version+1 WHERE id=@p0", [
          users.admin._id,
        ]),
      );
      await assert.rejects(
        store.mutate(users.admin, planningCommand([change(key, revision + 1)])),
        (e) => e.status === 401,
      );
      // A transaction-local query fault must roll back; no broad reader fallback.
      const active = await store.findUser({ id: users.admin._id }),
        tx = store.transaction;
      store.transaction = function (fn, ro) {
        return tx.call(
          this,
          (c) =>
            fn({
              ...c,
              query: (sql, ...args) => {
                if (sql.includes("FROM (SELECT @p0 AS owner_id"))
                  throw Error("synthetic preflight SQL failure");
                return c.query(sql, ...args);
              },
            }),
          ro,
        );
      };
      try {
        await assert.rejects(
          store.mutate(active, planningCommand([change(key, revision + 1)])),
          /synthetic preflight SQL failure/,
        );
      } finally {
        store.transaction = tx;
      }
      assert.deepEqual(await baseline(), before);
    },
  );
}
