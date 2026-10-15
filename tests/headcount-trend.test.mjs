import test from "node:test";
import assert from "node:assert/strict";
import { buildHeadcountTrend } from "../frontend/src/headcount-trend.ts";

const version = (status, effective, start = "", end = "", extras = {}) => ({
  status,
  effective,
  start,
  end,
  team: "t1",
  lead: "L1",
  included: true,
  amount: 1,
  ...extras,
});
const resource = (id, ...versions) => ({ id, name: id, versions });
const data = {
  teams: [
    { id: "t1", lead: "L1" },
    { id: "t2", lead: "L2" },
  ],
  resources: [
    resource(
      "employee",
      version("Aktif Çalışan", "2026-01", "", "", { amount: 0.5 }),
    ),
    resource(
      "gear",
      version("Pasif İlan", "2026-01"),
      version("Gear Up", "2026-02"),
    ),
    resource(
      "hourly",
      version("SAAT Ücretli Ofis Ç.", "2026-01", "2026-02", "2026-03"),
    ),
    resource(
      "posting",
      version("Aktif İlan", "2026-01", "2026-03", "2026-04", { amount: 2 }),
      version("Aktif Çalışan", "2026-04", "2026-03"),
    ),
    resource(
      "other-team",
      version("Aktif Çalışan", "2026-01", "", "", { team: "t2", lead: "L2" }),
    ),
    resource(
      "excluded",
      version("Aktif Çalışan", "2026-01", "", "", { included: false }),
    ),
  ],
};
const months = ["2026-01", "2026-02", "2026-03", "2026-04"];

test("headcount trend uses a running average and adds active postings only in future months", () => {
  const points = buildHeadcountTrend(data, ["t1"], ["L1"], months, "2026-02");
  assert.deepEqual(
    points.map((p) => p.actualCount),
    [1, 3, 3, 3],
  );
  assert.deepEqual(
    points.map((p) => p.postings),
    [0, 0, 1, 0],
  );
  assert.deepEqual(
    points.map((p) => p.actualAverage),
    [1, 2, null, null],
  );
  assert.equal(points[2].projectedAverage, 8 / 3);
  assert.equal(points[3].projectedAverage, 11 / 4);
  assert.deepEqual(
    points.map((p) => p.future),
    [false, false, true, true],
  );
});

test("headcount trend respects teams and leaders and counts records rather than FTE amounts", () => {
  const all = buildHeadcountTrend(data, ["t1", "t2"], [], months, "2026-02");
  assert.deepEqual(
    all.map((p) => p.actualCount),
    [2, 4, 4, 4],
  );
  const leadOnly = buildHeadcountTrend(
    data,
    ["t1", "t2"],
    ["L2"],
    months,
    "2026-02",
  );
  assert.deepEqual(
    leadOnly.map((p) => p.actualCount),
    [1, 1, 1, 1],
  );
  assert.deepEqual(
    leadOnly.map((p) => p.postings),
    [0, 0, 0, 0],
  );
});

test("departed staff remain in historical headcount only through the exit date", () => {
  const departed = {
    teams: [{ id: "t1", lead: "L1" }],
    resources: [
      resource(
        "former",
        version("İşten Ayrıldı", "2026-01", "2026-01-16", "2026-01-31"),
      ),
    ],
  };
  const points = buildHeadcountTrend(
    departed,
    ["t1"],
    [],
    ["2026-01", "2026-02"],
    "2026-02",
  );
  assert.equal(points[0].active, 16 / 31);
  assert.equal(points[1].active, 0);
});

test("dated active postings contribute to forecasts independently of inclusion, with partial start and end months", () => {
  const forecast = {
    teams: data.teams,
    resources: [
      resource(
        "excluded-posting",
        version("Aktif İlan", "2026-01", "2026-03-16", "2026-04-10", {
          included: false,
          amount: 2,
        }),
      ),
      resource(
        "undated",
        version("Aktif İlan", "2026-01", "", "", {
          included: false,
        }),
      ),
      resource("passive", version("Pasif İlan", "2026-01", "2026-01-01")),
      resource(
        "excluded-worker",
        version("Aktif Çalışan", "2026-01", "2026-01-01", "", {
          included: false,
        }),
      ),
    ],
  };
  const period = ["2026-02", "2026-03", "2026-04", "2026-05"];
  const points = buildHeadcountTrend(
    forecast,
    ["t1"],
    ["L1"],
    period,
    "2026-03",
  );
  assert.deepEqual(
    points.map((p) => p.postings),
    [0, 16 / 31, 10 / 30, 0],
  );
  assert.deepEqual(
    points.map((p) => p.actualCount),
    [0, 0, 0, 0],
  );
  assert.deepEqual(
    points.map((p) => p.actualAverage),
    [0, 0, null, null],
  );
  assert.equal(points[2].projectedAverage, 10 / 30 / 3);
  assert.equal(points[3].projectedAverage, 10 / 30 / 4);
  const included = structuredClone(forecast);
  included.resources[0].versions[0].included = true;
  assert.deepEqual(
    buildHeadcountTrend(included, ["t1"], ["L1"], period, "2026-03"),
    points,
  );
});

test("forecast postings retain effective status, team and leadership filters", () => {
  const forecast = {
    teams: data.teams,
    resources: [
      resource(
        "posting",
        version("Aktif İlan", "2026-03", "2026-02-01", "", {
          included: false,
          lead: "",
        }),
        version("Pasif İlan", "2026-04", "2026-02-01", "", {
          included: true,
        }),
        version("Aktif Çalışan", "2026-05", "2026-05-16"),
        version("Aktif Çalışan", "2026-06", "2026-05-16", "", {
          included: false,
        }),
      ),
      resource(
        "other-team",
        version("Aktif İlan", "2026-01", "2026-01-01", "", {
          included: false,
          team: "t2",
          lead: "L2",
        }),
      ),
    ],
  };
  const period = ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  const points = buildHeadcountTrend(
    forecast,
    ["t1"],
    ["L1"],
    period,
    "2026-01",
  );
  assert.deepEqual(
    points.map((p) => p.postings),
    [0, 1, 0, 0, 0],
  );
  assert.deepEqual(
    points.map((p) => p.actualCount),
    [0, 0, 0, 16 / 31, 0],
  );
  const otherLead = buildHeadcountTrend(
    forecast,
    ["t1", "t2"],
    ["L2"],
    period,
    "2026-01",
  );
  assert.deepEqual(
    otherLead.map((p) => p.postings),
    [1, 1, 1, 1, 1],
  );
  assert.deepEqual(
    otherLead.map((p) => p.actualCount),
    [0, 0, 0, 0, 0],
  );
  assert.deepEqual(
    buildHeadcountTrend(forecast, [], [], period, "2026-01").map(
      (p) => p.projectedCount,
    ),
    [0, 0, 0, 0, 0],
  );
});

test("forecast leadership scope includes child teams but never teams absent from the authorized selection", () => {
  const resource = (id, team, lead) => ({
    id,
    versions: [
      {
        effective: "2026-01",
        start: "2026-01-01",
        end: "",
        team,
        lead,
        status: "Aktif Çalışan",
        included: true,
        amount: 1,
      },
    ],
  });
  const d = {
    leaders: ["Root", "Child", "Other"],
    leaderParents: { Child: "Root" },
    teams: [
      { id: "child", lead: "Child" },
      { id: "other", lead: "Other" },
    ],
    resources: [
      resource("a", "child", "Child"),
      resource("b", "other", "Other"),
    ],
  };
  assert.equal(
    buildHeadcountTrend(
      d,
      ["child", "other"],
      ["Root"],
      ["2026-01"],
      "2026-01",
    )[0].actualCount,
    1,
  );
  assert.equal(
    buildHeadcountTrend(d, ["other"], ["Root"], ["2026-01"], "2026-01")[0]
      .actualCount,
    0,
  );
});
