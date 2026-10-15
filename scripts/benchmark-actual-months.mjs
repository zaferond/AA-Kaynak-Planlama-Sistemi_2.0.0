import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import {
  personMonthHours,
  DEFAULT_MONTHLY_HOURS,
} from "../shared/actual-units.ts";
import { stageChanges } from "../backend/operations.mjs";
import { validate } from "../shared/server-domain.ts";

// Pure synthetic models only: no .env, database, HTTP or user data.
const options = new Map(
  process.argv.slice(2).map((arg) => {
    const match = /^--(resources|projects|months|samples|output)=(.+)$/.exec(
      arg,
    );
    if (!match)
      throw Error(
        "Use --resources=400 --projects=20 --months=6 --samples=7 --output=/tmp/result.json",
      );
    return [match[1], match[2]];
  }),
);
const integer = (key, fallback, max) => {
  const value = Number(options.get(key) || fallback);
  if (!Number.isInteger(value) || value < 1 || value > max)
    throw Error("Invalid " + key);
  return value;
};
const resources = integer("resources", 400, 2000),
  projects = integer("projects", 20, 100);
const monthCount = integer("months", 6, 9),
  samples = integer("samples", 7, 20);
if (resources * projects * monthCount > 100000)
  throw Error("At most 100000 percent records.");
const months = Array.from(
  { length: monthCount },
  (_, i) => "2026-" + String(i + 1).padStart(2, "0"),
);
const base = {
  teams: [{ id: "t", name: "Synthetic team", lead: "L", excelCapacity: 0 }],
  projects: Array.from({ length: projects }, (_, i) => ({
    id: "p" + i,
    name: "Synthetic project " + i,
    start: "2026-01",
    end: "2026-12",
    phases: {},
  })),
  resources: Array.from({ length: resources }, (_, i) => ({
    id: "r" + i,
    name: "Synthetic person " + i,
    note: "",
    versions: [
      {
        effective: "2026-01",
        team: "t",
        lead: "L",
        status: "Aktif Çalışan",
        included: true,
        start: "2026-01-01",
        end: "",
        amount: 1,
      },
    ],
  })),
  leaders: ["L"],
  allocations: {},
  actualAllocations: {},
  actualPercentEntries: {},
  actualWorkedHours: {},
  revisions: { "calendar:shared": 1 },
  workCalendar: {
    "2026-01-01": { type: "official", label: "Holiday", fraction: 1 },
    "2026-01-02": { type: "company", label: "Half day", fraction: 0.5 },
    "2026-01-03": { type: "religious", label: "Weekend", fraction: 1 },
  },
  personCalendar: {},
};
for (const [i, person] of base.resources.entries()) {
  base.personCalendar[person.id + "|2026-01-02"] = {
    type: "leave",
    hours: 1,
    label: "",
  };
  base.personCalendar[person.id + "|2026-01-02|training"] = {
    type: "training",
    hours: 2,
    label: "",
  };
  base.personCalendar[person.id + "|2026-01-05|leave"] = {
    type: "leave",
    hours: 1.5,
    label: "",
  };
  for (const month of months) {
    const key = person.id + "|" + month;
    if (i % 2 === 0) base.actualWorkedHours[key] = 230;
    if (i % 17 === 0 && month === "2026-02") base.actualWorkedHours[key] = 0;
    const hours = personMonthHours(
      month,
      person.id,
      base.actualWorkedHours[key],
      base.workCalendar,
      base.personCalendar,
    );
    for (const project of base.projects) {
      const actualKey = person.id + "|" + project.id + "|" + month;
      const percent = hours.effectiveHours ? 40 / projects : 0;
      base.actualAllocations[actualKey] =
        ((percent / 100) * hours.effectiveHours) / DEFAULT_MONTHLY_HOURS;
      base.actualPercentEntries[actualKey] = percent;
      base.revisions["actual:" + actualKey] = 1;
    }
  }
}
const state = validate(base);
const change = {
  kind: "calendar",
  id: "shared",
  revision: 1,
  value: {
    ...state.workCalendar,
    "2026-01-01": { ...state.workCalendar["2026-01-01"], fraction: 0.5 },
  },
};
const actor = { _id: "synthetic-admin", role: "admin", leaders: [] };
const observations = [];
let finalHash;
for (let i = -1; i < samples; i++) {
  const draft = structuredClone(state);
  const start = performance.now();
  stageChanges(draft, actor, [change]);
  const staged = performance.now();
  const validated = validate(draft);
  const completed = performance.now();
  assert.deepEqual(validated.actualAllocations, state.actualAllocations);
  assert.equal(validated.revisions["calendar:shared"], 2);
  for (const [j, person] of validated.resources.entries()) {
    const month = "2026-01";
    const hours = personMonthHours(
      month,
      person.id,
      validated.actualWorkedHours[person.id + "|" + month],
      validated.workCalendar,
      validated.personCalendar,
    );
    for (const project of validated.projects) {
      const key = person.id + "|" + project.id + "|" + month;
      const expected =
        ((validated.actualAllocations[key] * DEFAULT_MONTHLY_HOURS) /
          hours.effectiveHours) *
        100;
      assert(Math.abs(validated.actualPercentEntries[key] - expected) < 1e-10);
      assert.equal(validated.revisions["actual:" + key], 2);
    }
  }
  const hash = createHash("sha256")
    .update(JSON.stringify(validated))
    .digest("hex");
  if (finalHash) assert.equal(hash, finalHash);
  finalHash = hash;
  if (i >= 0)
    observations.push({
      stageMs: staged - start,
      validationMs: completed - staged,
      totalMs: completed - start,
    });
}
const median = (name) => {
  const sorted = observations.map((x) => x[name]).sort((a, b) => a - b);
  return Math.round(sorted[Math.ceil(sorted.length / 2) - 1] * 100) / 100;
};
const report = {
  measuredAt: new Date().toISOString(),
  node: process.version,
  resources,
  projects,
  months: monthCount,
  percentages: resources * projects * monthCount,
  personMonths: resources * monthCount,
  affectedPersonMonths: resources,
  samples,
  finalHash,
  scope:
    "Pure synthetic calendar edit and full validation. Excludes copy, SQL, HTTP, JSON response, browser and concurrency; no production speed guarantee.",
  medians: Object.fromEntries(
    ["stageMs", "validationMs", "totalMs"].map((name) => [name, median(name)]),
  ),
  observations,
  sourceHashes: {},
};
for (const name of [
  "shared/actual-units.ts",
  "shared/actual-months.ts",
  "shared/server-domain.ts",
  "backend/operations.mjs",
  "scripts/benchmark-actual-months.mjs",
])
  report.sourceHashes[name] = createHash("sha256")
    .update(await fs.readFile(new URL("../" + name, import.meta.url)))
    .digest("hex");
console.log(JSON.stringify({ ...report, observations: undefined }));
if (options.has("output"))
  await fs.writeFile(
    path.resolve(options.get("output")),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
