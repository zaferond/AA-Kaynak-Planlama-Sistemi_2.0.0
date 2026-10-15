import assert from "node:assert/strict";
import { DIRECTORY_REVISION_KEY } from "../shared/directory-policy.ts";
import { hashPassword } from "../backend/auth.mjs";
import { planningCommand, stageChanges } from "../backend/operations.mjs";
import { seedBenchmarkStore } from "../scripts/benchmark-fixture.mjs";
import { validationFixture } from "./snapshot-validation-suite.mjs";
import { validate as referenceValidate } from "./snapshot-validation-reference.mjs";

const errorResult = (error) => ({
  name: error.name,
  message: error.message,
  status: error.status,
  issues: error.issues,
});
const comparableAudit = (rows) =>
  rows
    .map(({ id, occurred_at, ...rest }) => rest)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

// The frozen oracle predates organization hierarchies. Keep this differential
// suite inside its legacy domain; never teach the oracle current validation.
// SQL readers now always return empty organization maps, so retain only those
// empty defaults after legacy validation. Nonempty/new-role fixtures must use
// the dedicated hierarchy/responsibility suites, not this compatibility bridge.
function validateLegacyContract(input, options) {
  assert.deepEqual(input.leaderParents, {});
  assert.deepEqual(input.leadershipUnits, {});
  assert(input.teams.every((team) => team.kind === undefined));
  assert(
    input.resources.every((resource) =>
      resource.versions.every(
        (version) => version.assignmentRole === undefined,
      ),
    ),
  );
  const valid = referenceValidate(input, options);
  return { ...valid, leaderParents: {}, leadershipUnits: {} };
}

/** Disposable SQL.js or leased Native MSSQL only; never call with a live Store. */
export async function planningContractSuite(store, t) {
  await seedBenchmarkStore(store, 24, {
    resources: 4,
    actuals: 8,
    percentages: 8,
    calendarDays: 4,
  });
  let initial = await store.read();
  const team = initial.data.teams.find((x) => x.lead),
    other = initial.data.teams.find((x) => x.lead && x.lead !== team.lead);
  assert(team && other);
  const password = await hashPassword("Synthetic-contract-only-284!"),
    users = {};
  for (const [id, role, leaders] of [
    ["admin", "admin", []],
    ["manager", "manager", [team.lead]],
    ["normal", "normal", []],
    ["unassigned", "manager", []],
  ]) {
    await store.bootstrapUser({
      _id: "contract-" + id,
      username: "contract." + id,
      name: "Synthetic " + id,
      role,
      leaders,
      active: true,
      password,
      version: 1,
      revision: 1,
    });
    users[id] = await store.findUser({ id: "contract-" + id });
  }
  await store.mutate(users.admin, (data) => {
    data.leaderParents = {};
    data.leadershipUnits = {};
    for (const team of data.teams) delete team.kind;
  });
  const risk = {
    ...validationFixture().risks[0],
    projectId: "bench-p0",
    systemId: initial.data.riskSystems[0].id,
    system: initial.data.riskSystems[0].name,
  };
  await store.mutate(users.admin, (d, u) =>
    stageChanges(d, u, [
      { kind: "risk", id: risk.id, revision: 0, value: risk },
    ]),
  );
  initial = await store.read();
  const key = team.id + "|bench-p0|2026-01",
    empty = team.id + "|bench-p0|2028-12",
    outside = team.id + "|bench-p0|2030-01";
  const capture = () =>
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
  const change = (data, id = key, extra = {}) => ({
    kind: "allocation",
    id,
    revision: data.revisions["allocation:" + id] || 0,
    value: 0.5,
    ...extra,
  });

  async function compare(
    user,
    changes,
    { fault, expectedStatus, expectedMode } = {},
  ) {
    const before = await capture(),
      untouched = structuredClone(changes),
      transaction = store.transaction,
      validator = store.validateSnapshot,
      read = store.read;
    const marker = Error("synthetic reference rollback");
    const options = {
      returnView: true,
      planningDelta: {
        baseGeneration: before.snapshot.generation,
        ids: changes.map((x) => x.id),
      },
    };
    if (fault) {
      const staged = structuredClone(before.snapshot.data);
      fault(staged);
      assert.doesNotThrow(
        () => stageChanges(staged, user, changes),
        "target staging unexpectedly caught an unrelated fault",
      );
    }
    let expected, referenceError, actual, actualError;
    const installFault = () => {
      if (fault)
        store.read = async function (...args) {
          const snapshot = await read.apply(this, args);
          fault(snapshot.data);
          return snapshot;
        };
    };
    store.validateSnapshot = validateLegacyContract;
    installFault();
    store.transaction = function (fn, ro) {
      return transaction.call(
        this,
        async (c) => {
          const view = await fn(c);
          expected = {
            view,
            snapshot: await read.call(store, c),
            audit: (
              await c.query(
                "SELECT * FROM kp_audit_events ORDER BY kind,record_id,occurred_at,id",
              )
            ).rows,
          };
          throw marker;
        },
        ro,
      );
    };
    try {
      await store.mutate(user, (d, u) => stageChanges(d, u, changes), options);
      assert.fail("Reference must roll back");
    } catch (e) {
      if (e !== marker) referenceError = errorResult(e);
    } finally {
      store.transaction = transaction;
      store.validateSnapshot = validator;
      store.read = read;
    }
    assert.deepEqual(await capture(), before, "reference did not roll back");
    installFault();
    try {
      actual = await store.mutate(user, planningCommand(changes), options);
    } catch (e) {
      actualError = errorResult(e);
    } finally {
      store.read = read;
    }
    assert.deepEqual(changes, untouched, "command input mutated");
    assert.deepEqual(actualError, referenceError, "first error differs");
    if (referenceError) {
      if (expectedStatus !== undefined)
        assert.equal(actualError.status, expectedStatus);
      assert.deepEqual(
        await capture(),
        before,
        "rejected write changed data, revision, audit or generation",
      );
      return { error: actualError };
    }
    assert(expected, "reference returned neither result nor error");
    const after = await capture();
    assert.deepEqual(actual, expected.view, "response differs");
    assert.deepEqual(
      after.snapshot,
      expected.snapshot,
      "committed data/revision/generation differs",
    );
    assert.deepEqual(
      comparableAudit(after.audit),
      comparableAudit(expected.audit),
      "audit differs",
    );
    assert.equal(after.snapshot.generation, before.snapshot.generation + 1);
    for (const ch of changes) {
      const oldRevision =
        before.snapshot.data.revisions["allocation:" + ch.id] || 0;
      const noOpClear =
        ch.operation && !Object.hasOwn(before.snapshot.data.allocations, ch.id);
      assert.equal(
        after.snapshot.data.revisions["allocation:" + ch.id] || 0,
        oldRevision + (noOpClear ? 0 : 1),
      );
    }
    if (expectedMode !== undefined)
      assert.equal(actual.responseMode, expectedMode);
    if (user.role === "manager") {
      assert(!actual.allocations?.some((x) => x.id.startsWith(other.id + "|")));
      if (actual.data)
        for (const [id, value] of Object.entries(
          before.snapshot.data.allocations,
        ))
          if (id.startsWith(other.id + "|"))
            assert.equal(actual.data.allocations[id], value);
    }
    return { view: actual, before, after };
  }

  await t.test(
    "owned single-cell commits match a rollback-only frozen validator for values, zeros, tombstones, no-ops and manager scope",
    async () => {
      const cases = [
        [empty, { value: 0.25 }],
        [key, { value: 0 }],
        [key, { value: 0 }],
        [key, { value: 10000 }],
        [key, { value: 0.125 }],
        [key, { operation: "delete" }],
        [key, { operation: "delete" }],
        [outside, { value: 0 }],
        [outside, { operation: "delete" }],
        [team.id + "|bench-p0|2031-01", { operation: "delete" }],
      ];
      let comparisons = 0;
      for (const user of [users.admin, users.manager])
        for (const [id, extra] of cases) {
          const d = (await store.read()).data;
          const result = await compare(user, [change(d, id, extra)], {
            expectedMode: "planning-delta-v1",
          });
          assert(!result.error);
          comparisons++;
        }
      assert.equal(comparisons, 20);
    },
  );
  await t.test(
    "owned single-cell rejections preserve permission/revision/shape/domain error order and the entire transaction",
    async () => {
      const d = (await store.read()).data;
      const cases = [
        [users.admin, change(d, key, { revision: 999999 }), 409],
        [users.normal, change(d, key), 403],
        [users.unassigned, change(d, key), 403],
        [{ ...users.normal, role: "admin" }, change(d, key), 403],
        [{ ...users.admin, version: 0 }, change(d, key), 401],
        [users.manager, change(d, other.id + "|bench-p0|2026-01"), 403],
        [users.admin, change(d, outside, { value: 1 }), 400],
        [
          users.admin,
          change(d, team.id + "|bench-p0|2026-00", { value: 0 }),
          400,
        ],
        [users.admin, change(d, "missing|bench-p0|2026-01"), 400],
        [users.admin, change(d, team.id + "|missing|2026-01"), 400],
        [
          users.admin,
          change(d, "missing|missing|2026-01", { operation: "delete" }),
          404,
        ],
        [users.admin, change(d, key, { value: 10001 })],
        [users.admin, change(d, key, { value: -1 })],
        [users.admin, change(d, key, { value: "2" })],
        [users.admin, change(d, key, { value: NaN })],
        [users.normal, change(d, key, { revision: 999999, value: -1 }), 403],
        [users.admin, change(d, key, { revision: 999999, value: -1 }), 409],
      ];
      for (const [user, ch, status] of cases) {
        const result = await compare(user, [ch], { expectedStatus: status });
        assert(result.error);
      }
    },
  );
  await t.test(
    "unrelated metadata and numeric faults remain global dependencies; target staging alone misses these invalid drafts",
    async () => {
      const faults = [
        (d) => {
          d.workCalendar["2026-02-30"] = {
            type: "company",
            label: "Off",
            fraction: 1,
          };
        },
        (d) => {
          d.teams.push({ ...d.teams[0] });
        },
        (d) => {
          d.riskSystems.push({ ...d.riskSystems[0], id: "duplicate-name" });
        },
        (d) => {
          d.projects[0].end = "2025-12";
        },
        (d) => {
          d.risks[0].projectId = "missing";
        },
        (d) => {
          d.risks[0].residualImpact = 2;
        },
        (d) => {
          d.personCalendar["missing|2026-01-01|leave"] = {
            type: "leave",
            hours: 1,
            label: "",
          };
        },
        (d) => {
          d.personCalendar["bench-r0|2026-02-30|leave"] = {
            type: "leave",
            hours: 1,
            label: "",
          };
        },
        (d) => {
          for (const type of ["leave", "training"])
            d.personCalendar["bench-r0|2026-01-10|" + type] = {
              type,
              hours: 5,
              label: "",
            };
        },
        (d) => {
          d.resources[0].versions.push({ ...d.resources[0].versions[0] });
        },
        (d) => {
          d.resources[0].versions[0].team = "missing";
        },
        (d) => {
          d.resources[0].versions[0].end = "2025-12-31";
        },
        (d) => {
          d.allocations["missing|bench-p0|2026-01"] = 0;
        },
        (d) => {
          d.actualAllocations["missing|bench-p0|2026-01"] = 0;
        },
        (d) => {
          d.actualWorkedHours["bench-r0|2026-13"] = 1;
        },
        (d) => {
          const k = Object.keys(d.actualPercentEntries)[0];
          d.actualPercentEntries[k] += 50;
        },
        (d) => {
          d.leaders = [];
        },
        (d) => {
          d.leaderManagers = { missing: "Manager" };
        },
        (d) => {
          d.projects[0].phases["2026-13"] = "Phase";
        },
        (d) => {
          d.risks[0].extra = "strict field";
        },
      ];
      for (const fault of faults) {
        const d = (await store.read()).data;
        const result = await compare(users.admin, [change(d, key)], { fault });
        assert(result.error);
      }
      for (const [a, b] of [
        [faults[0], faults[19]],
        [faults[4], faults[6]],
        [faults[11], faults[13]],
        [faults[15], faults[16]],
      ]) {
        const d = (await store.read()).data;
        assert(
          (
            await compare(users.admin, [change(d, key)], {
              fault: (d) => {
                a(d);
                b(d);
              },
            })
          ).error,
        );
      }
    },
  );
  await t.test(
    "a planned cell also persists legacy project/risk/departure normalization and falls back to a complete scoped response",
    async () => {
      const d = (await store.read()).data,
        resource = d.resources[0],
        departure = "2026-03-15";
      await store.transaction(async (c) => {
        await c.query("UPDATE kp_teams SET name=@p0 WHERE id=@p1", [
          "  Legacy team  ",
          team.id,
        ]);
        await c.query("UPDATE kp_projects SET name=@p0 WHERE id=@p1", [
          "  Legacy project  ",
          "bench-p0",
        ]);
        await c.query("UPDATE kp_project_risks SET payload=@p0 WHERE id=@p1", [
          JSON.stringify({ ...d.risks[0], system: "Old catalog name" }),
          risk.id,
        ]);
        const row = (
          await c.query(
            "SELECT * FROM kp_resource_versions WHERE resource_id=@p0",
            [resource.id],
          )
        ).rows[0];
        await c.upsert("resource_versions", [
          {
            ...row,
            effective_month: "2026-03",
            status: "İşten Ayrıldı",
            end_month: "2026-03",
            end_date: departure,
          },
        ]);
      });
      const current = (await store.read()).data;
      assert.equal(current.projects[0].name, "  Legacy project  ");
      assert.equal(current.resources[0].versions[0].end, "");
      const result = await compare(users.manager, [change(current, key)], {
        expectedMode: undefined,
      });
      assert(!result.error);
      assert.equal(result.view.responseMode, undefined);
      const normalized = result.after.snapshot.data;
      assert.equal(normalized.projects[0].name, "Legacy project");
      assert.equal(
        normalized.teams.find((x) => x.id === team.id).name,
        "Legacy team",
      );
      assert.equal(
        normalized.revisions[DIRECTORY_REVISION_KEY],
        (current.revisions[DIRECTORY_REVISION_KEY] || 0) + 1,
      );

      assert.equal(
        normalized.risks[0].system,
        normalized.riskSystems.find((x) => x.id === risk.systemId).name,
      );
      assert(
        normalized.resources[0].versions.every((v) => v.end === departure),
      );
      assert.deepEqual(result.view, await store.view(users.manager));
    },
  );
}
