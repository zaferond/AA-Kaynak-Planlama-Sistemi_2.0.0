import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { hashPassword, publicUser } from "../backend/auth.mjs";
import { seedBenchmarkStore } from "../scripts/benchmark-fixture.mjs";
import { readActualReportData } from "../backend/actual-report-reader.mjs";
import { actualView } from "../backend/actual-view.mjs";
import { activityReport } from "../backend/activity-report.mjs";
import { readCompositeMap } from "../backend/read-records.mjs";
import {
  createPersonMonthHoursIndex,
  DEFAULT_MONTHLY_HOURS,
} from "../shared/actual-units.ts";
import {
  createEmployeeAssignmentIndex,
  employeeAssignment,
} from "../shared/employee-directory.ts";
const date = "2026-10-13";
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-report-reads-"));
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
  await seedBenchmarkStore(store, 1000, {
    resources: 80,
    actuals: 400,
    percentages: 400,
    calendarDays: 80,
  });
  const initial = (await store.read()).data;
  const own = initial.resources[0],
    ownTeam = initial.teams.find((t) => t.id === own.versions[0].team);
  const other = initial.teams.find((t) => t.lead && t.lead !== ownTeam.lead);
  const managerResource = initial.resources.find(
    (r) => r.id !== own.id && r.versions[0].team === ownTeam.id,
  );
  const users = {};
  const password = await hashPassword("Synthetic-read-model-only-284!");
  for (const [id, role, resourceId, leaders] of [
    ["admin", "admin", "", []],
    ["normal", "normal", own.id, [other.lead]],
    ["manager", "manager", managerResource.id, [ownTeam.lead]],
    ["unlinked-manager", "manager", "", [ownTeam.lead]],
    ["unassigned", "manager", "", []],
    ["unlinked-normal", "normal", "", []],
  ]) {
    await store.bootstrapUser({
      _id: id,
      username: "synthetic." + id,
      name: id,
      role,
      resourceId,
      leaders,
      active: true,
      password,
      version: 1,
      revision: 1,
    });
    users[id] = await store.findUser({ id });
  }
  await store.mutate(users.admin, (d) => {
    d.leaderParents[other.lead] = ownTeam.lead;
    d.projects.push({ ...d.projects[0], id: "other-project" });
    d.resources[1].versions.push({
      ...d.resources[1].versions[0],
      team: ownTeam.id,
      lead: ownTeam.lead,
      effective: "2026-05",
    });
    d.resources[2].versions[0].start = "2026-02-10";
    d.resources[3].versions.push({
      ...d.resources[3].versions[0],
      status: "İşten Ayrıldı",
      effective: "2026-09",
      end: "2026-09-20",
    });
    d.actualAllocations[own.id + "|other-project|2026-01"] = 0.02;
    d.actualWorkedHours[own.id + "|2026-01"] = 180;
    d.revisions["actual:" + own.id + "|other-project|2026-01"] = 2;
    d.revisions["actual:" + own.id + "|other-project|2026-02"] = 3; // tombstone
    d.revisions["calendar:shared"] = 2;
    d.revisions["personDay:" + own.id + "|2025-01-02|leave"] = 3;
    d.personCalendar[own.id + "|2026-02-03|training"] = {
      type: "training",
      hours: 1,
      label: "PRIVATE_TRAINING",
    };
    d.personCalendar[own.id + "|2026-02-04|leave"] = {
      type: "leave",
      hours: 2,
      label: "PRIVATE_LEAVE",
    };
    // Manual hours and recorded percentages must agree with the canonical validator.
    delete d.actualPercentEntries[own.id + "|bench-p0|2026-01"];
    const hours = createPersonMonthHoursIndex(d);
    for (const key of Object.keys(d.actualPercentEntries)) {
      const [resourceId, , month] = key.split("|");
      d.actualPercentEntries[key] =
        ((d.actualAllocations[key] * DEFAULT_MONTHLY_HOURS) /
          hours.get(resourceId, month).effectiveHours) *
        100;
    }
  });
  const observations = [];
  const raw = store.db.raw;
  t.mock.method(store.db, "raw", function (sql, values, consume) {
    const result = raw.call(this, sql, values, consume);
    if (/^SELECT\b/.test(sql))
      observations.push({ sql, values, rows: result.rowCount });
    return result;
  });
  const project = (kind, data, user, query) =>
    kind === "actual"
      ? actualView(data, publicUser(user), query, date)
      : activityReport(data, publicUser(user), query, date.slice(0, 7));
  const reference = (kind, user, query) =>
    store.transaction(
      async (c) => project(kind, (await store.read(c)).data, user, query),
      true,
    );
  const scoped = (kind, user, query) =>
    store.transaction(
      async (c) =>
        project(
          kind,
          await readActualReportData(
            c,
            "sqljs",
            publicUser(user),
            query,
            kind,
            date,
          ),
          user,
          query,
        ),
      true,
    );
  return { store, users, own, observations, reference, scoped };
}

test("scoped report SQL reproduces full-read calculations across roles, transfers, departures, filters and future periods", async (t) => {
  const f = await fixture(t);
  const before = await f.store.read();
  for (const user of Object.values(f.users))
    for (const [start, count] of [
      ["2026-01", 3],
      ["2026-09", 12],
      ["2025-11", 6],
      ["2030-01", 12],
    ])
      for (const kind of ["actual", "activity"])
        for (const projects of kind === "activity"
          ? [[], ["bench-p0"], ["unknown' OR 1=1--"]]
          : [[]]) {
          const query = { start, count, projects };
          assert.deepEqual(
            await f.scoped(kind, user, query),
            await f.reference(kind, user, query),
            `${kind}/${user._id}/${start}/${projects}`,
          );
        }
  assert.deepEqual(await f.store.read(), before);
});

test("dedicated Store report reads skip planning/risk tables and preserve required revision tombstones and privacy", async (t) => {
  const f = await fixture(t);
  const query = { start: "2026-01", count: 3, projects: ["bench-p0"] };
  t.mock.method(f.store, "read", () => {
    throw Error("Report must not load a full snapshot");
  });
  for (const kind of ["actual", "activity"]) {
    f.observations.length = 0;
    const result = await (kind === "actual"
      ? f.store.actualView(f.users.normal, query)
      : f.store.activityReport(f.users.normal, query));
    assert(
      !f.observations.some((o) =>
        /FROM \[?kp_(allocations|project_risks)\]?\b/.test(o.sql),
      ),
    );
    assert(
      f.observations
        .filter((o) => /FROM \[kp_actual_/.test(o.sql))
        .every((o) => o.sql.includes("[month]>=@p")),
    );
    assert(
      !f.observations.some((o) => /SELECT \* FROM kp_resources/.test(o.sql)),
    );
    if (kind === "activity") {
      assert(
        !f.observations.some((o) =>
          /kp_(revisions|project_milestones|project_phases|risk_systems|actual_percent_entries)\b/.test(
            o.sql,
          ),
        ),
      );
      assert(!JSON.stringify(result).includes("PRIVATE_"));
      assert(f.observations.some((o) => o.sql.includes("[project_id] IN (@p")));
    } else {
      const r = result.data.revisions;
      assert.equal(r["actual:" + f.own.id + "|other-project|2026-02"], 3);
      assert.equal(r["personDay:" + f.own.id + "|2025-01-02|leave"], 3);
      assert.equal(r["calendar:shared"], 2);
      assert(
        !Object.keys(r).some(
          (k) => k.startsWith("allocation:") || k.startsWith("risk:"),
        ),
      );
      assert(
        Object.keys(result.data.personCalendar).every((k) =>
          k.startsWith(f.own.id + "|"),
        ),
      );
    }
  }
  for (const fn of ["actualView", "activityReport"])
    await assert.rejects(
      f.store[fn]({ ...f.users.normal, version: 0 }, query),
      { status: 401 },
    );
});

test("legacy separator IDs retain complete numeric read semantics rather than silently losing historical values", async (t) => {
  const f = await fixture(t);
  // Emulate historical SQL rows; the current mutation validator rejects
  // ambiguous four-part keys. This database is disposable and synthetic only.
  await f.store.transaction(async (c) => {
    await c.upsert("resources", [
      { id: "legacy|employee", name: "Legacy synthetic", note: "", code: "" },
    ]);
    const row = (
      await c.query(
        "SELECT * FROM kp_resource_versions WHERE resource_id=@p0",
        [f.own.id],
      )
    ).rows[0];
    await c.upsert("resource_versions", [
      { ...row, resource_id: "legacy|employee" },
    ]);
    await c.upsert("actual_allocations", [
      {
        resource_id: "legacy|employee",
        project_id: "bench-p0",
        month: "2026-01",
        amount: 0.01,
      },
    ]);
  });
  for (const kind of ["actual", "activity"]) {
    const query = { start: "2026-01", count: 3, projects: ["bench-p0"] };
    assert.deepEqual(
      await f.scoped(kind, f.users.admin, query),
      await f.reference(kind, f.users.admin, query),
    );
  }
});

test("report month/owner/project values stay bound on SQL.js and MSSQL; large scopes do not truncate", async () => {
  for (const provider of ["sqljs", "mssql"]) {
    const owners = ["__proto__", "x'); DROP TABLE kp_resources;--"];
    const projects = ["constructor", "p' OR 1=1--"];
    const c = {
      scan: async (sql, values, consume) => {
        assert.deepEqual(values, [
          ...owners,
          "2026-01",
          "2026-03",
          ...projects,
        ]);
        assert(!sql.includes(owners[1]) && !sql.includes(projects[1]));
        consume(
          provider === "sqljs"
            ? ["__proto__|constructor|2026-01", 0]
            : ["__proto__", "constructor", "2026-01", 0],
        );
        return { rowCount: 1 };
      },
    };
    assert.deepEqual(
      await readCompositeMap(
        c,
        provider,
        "actual_allocations",
        "amount",
        owners,
        ["2026-01", "2026-03"],
        projects,
      ),
      { "__proto__|constructor|2026-01": 0 },
    );
    const large = Array.from({ length: 901 }, (_, i) => "r" + i);
    await readCompositeMap(
      {
        query: async (sql, values) => {
          assert(!sql.includes("[resource_id] IN"));
          assert.deepEqual(values, ["2026-01", "2026-03"]);
          return { rows: [] };
        },
      },
      provider,
      "actual_worked_hours",
      "hours",
      large,
      ["2026-01", "2026-03"],
    );
  }
});

test("employee assignment indexing preserves the existing status and effective-version policy without mutating data", () => {
  const data = {
    teams: [{ id: "t" }],
    resources: [
      {
        id: "__proto__",
        versions: [
          { effective: "2026-01", team: "t", status: "Aktif Çalışan" },
        ],
      },
      {
        id: "future",
        versions: [{ effective: "2027-01", team: "t", status: "Gear Up" }],
      },
      {
        id: "ad",
        versions: [{ effective: "2026-01", team: "t", status: "Aktif İlan" }],
      },
    ],
  };
  const before = structuredClone(data);
  const index = createEmployeeAssignmentIndex(data, "2026-10");
  for (const resource of data.resources)
    assert.deepEqual(
      index.get(resource.id),
      employeeAssignment(data, resource.id, "2026-10"),
    );
  assert.deepEqual(data, before);
});
