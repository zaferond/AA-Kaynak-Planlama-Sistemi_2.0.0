import { schemaVersion } from "../backend/migration-catalog.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  currentPlanningDate,
  currentYearStartDate,
  resourceMonthFraction,
  todayMonthProgress,
} from "../frontend/src/resource-dates.ts";
import { buildHeadcountTrend } from "../frontend/src/headcount-trend.ts";
import { Store } from "../backend/store.mjs";
import { SqlJsAdapter } from "../backend/adapters/sqljs.mjs";
import {
  activeTeamMembers,
  buildCapacityIndex,
  prepareImport,
  importColumns,
  sourceRows,
} from "../backend/domain/index.mjs";

const version = (status, start, end, amount = 1) => ({
  effective: "2026-01",
  team: "t",
  lead: "L",
  status,
  included: true,
  start,
  end,
  amount,
});

test("partial join and departure months use inclusive calendar days", () => {
  const employee = version("Aktif Çalışan", "2026-09-16", "2026-10-10");
  assert.equal(resourceMonthFraction(employee, "2026-08"), 0);
  assert.equal(resourceMonthFraction(employee, "2026-09"), 15 / 30);
  assert.equal(resourceMonthFraction(employee, "2026-10"), 10 / 31);
  assert.equal(resourceMonthFraction(employee, "2026-11"), 0);
  assert.equal(
    resourceMonthFraction(
      version("Aktif Çalışan", "2028-02-29", "2028-02-29"),
      "2028-02",
    ),
    1 / 29,
  );
  const data = {
    teams: [{ id: "t", lead: "L" }],
    resources: [
      { id: "e", name: "Çalışan", versions: [employee] },
      {
        id: "p",
        name: "İlan",
        versions: [version("Aktif İlan", "2026-09-21", "", 2)],
      },
    ],
    allocations: {},
  };
  const index = buildCapacityIndex(data, ["2026-09", "2026-10"]);
  assert.equal(index["t|2026-09"].current, 0.5 + (2 * 10) / 30);
  assert.equal(index["t|2026-10"].current, 10 / 31 + 2);
  assert.equal("expected" in index["t|2026-09"], false);
  const excluded = structuredClone(data);
  excluded.resources[1].versions[0].included = false;
  assert.equal(
    buildCapacityIndex(excluded, ["2026-09"])["t|2026-09"].current,
    0.5,
  );
  assert.deepEqual(activeTeamMembers(data, "2026-09"), { t: ["Çalışan"] });
  const trend = buildHeadcountTrend(
    data,
    ["t"],
    ["L"],
    ["2026-09", "2026-10"],
    "2026-08",
  );
  assert.equal(trend[0].active, 0.5);
  assert.equal(trend[0].postings, 10 / 30);
  assert.equal(trend[1].active, 10 / 31);
  assert.equal(trend[1].postings, 1);
});

test("the employee default is the first Istanbul day of the year", () => {
  assert.equal(
    currentYearStartDate(new Date("2026-12-31T22:30:00Z")),
    "2027-01-01",
  );
});

test("the today marker uses Istanbul date and the actual length of each month", () => {
  assert.equal(
    currentPlanningDate(new Date("2026-09-26T21:30:00Z")),
    "2026-09-27",
  );
  assert.equal(todayMonthProgress("2026-09-27"), 26.5 / 30);
  assert.equal(todayMonthProgress("2028-02-29"), 28.5 / 29);
});

test("resource month dates migrate to first and last calendar day", async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "aa-resource-date-upgrade-"),
  );
  const file = path.join(dir, "plan.sqlite");
  const adapter = new SqlJsAdapter(file);
  try {
    await adapter.open();
    await adapter.transaction(async (c) => {
      for (const migration of ["001", "004", "005"])
        await c.batch(
          await fs.readFile(
            `backend/migrations/${migration}_sqljs.sql`,
            "utf8",
          ),
        );
      await c.batch(
        "INSERT INTO kp_settings VALUES(1,0,NULL); INSERT INTO kp_teams VALUES('t','Takım',NULL,0,1); INSERT INTO kp_resources VALUES('r','Ayşe','',NULL); INSERT INTO kp_resource_versions VALUES('r','2026-01','t',NULL,'Aktif Çalışan',1,'2026-02','2026-03',1);",
      );
    });
    await adapter.close();
    const store = new Store({
      env: { DB_PROVIDER: "sqljs", SQLJS_FILE: file },
    });
    try {
      await store.connect();
      assert.equal(
        (
          await store.db.query(
            "SELECT MAX(version) AS v FROM kp_schema_migrations",
          )
        ).rows[0].v,
        schemaVersion,
      );
      await store.db.transaction((c) =>
        c.query(
          "UPDATE kp_resource_versions SET status='İşten Ayrıldı' WHERE resource_id='r'",
        ),
      );
      const resource = (await store.read()).data.resources.find(
        (r) => r.id === "r",
      );
      assert.equal(resource.versions[0].status, "İşten Ayrıldı");
      assert.equal(resource.versions[0].start, "2026-02-01");
      assert.equal(resource.versions[0].end, "2026-03-31");
    } finally {
      await store.close();
    }
  } finally {
    if (adapter.db) await adapter.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("one start date determines the first record month and preserves day precision", () => {
  const data = {
    leaders: ["L"],
    teams: [{ id: "t", name: "Takım", lead: "L" }],
    resources: [],
  };
  assert.equal(
    importColumns.filter(([, label]) => label === "İşbaşı Tarihi").length,
    1,
  );
  assert.equal(
    importColumns.some(([, label]) => label === "Geçerlilik Ayı"),
    false,
  );
  const source = {
    row: 2,
    date1904: false,
    problems: [],
    values: {
      name: "Ayşe Yılmaz",
      lead: "L",
      team: "Takım",
      status: "Aktif Çalışan",
      included: "Evet",
      amount: "1",
      start: "16.09.2026",
      end: "2026-10-10",
      note: "",
    },
  };
  const [preview] = prepareImport(data, [source]);
  assert.equal(preview.state, "ready");
  assert.equal(preview.resource.versions[0].effective, "2026-09");
  assert.equal(preview.resource.versions[0].start, "2026-09-16");
  assert.equal(preview.resource.versions[0].end, "2026-10-10");
  assert.equal(preview.resource.code, undefined);
  const [oldMonth] = prepareImport(data, [
    {
      ...source,
      values: { ...source.values, start: "2026-09", end: "2026-10" },
    },
  ]);
  assert.equal(oldMonth.resource.versions[0].start, "2026-09-01");
  assert.equal(oldMonth.resource.versions[0].end, "2026-10-31");
  const [defaultStart] = prepareImport(data, [
    { ...source, values: { ...source.values, start: "", end: "" } },
  ]);
  assert.equal(defaultStart.state, "ready");
  assert.equal(defaultStart.resource.versions[0].start, currentYearStartDate());
  const [legacy] = prepareImport(data, [
    { ...source, values: { ...source.values, effective: "2026-08" } },
  ]);
  assert.equal(legacy.resource.versions[0].effective, "2026-08");
  const headers = [
    "Ad Soyad",
    "Liderlik",
    "Takım",
    "Statü",
    "Dahil",
    "Kişi Eşdeğeri",
    "İşbaşı Tarihi",
    "İşten Ayrılış Tarihi",
    "İK Notu",
  ];
  const values = [
    "Ayşe Yılmaz",
    "L",
    "Takım",
    "Aktif Çalışan",
    "Evet",
    "1",
    "16.09.2026",
    "2026-10-10",
    "",
  ];
  const parsed = sourceRows([
    { number: 1, cells: headers.map((value) => ({ value })) },
    { number: 2, cells: values.map((value) => ({ value })) },
  ]);
  assert.equal(parsed[0].values.start, "16.09.2026");
});
