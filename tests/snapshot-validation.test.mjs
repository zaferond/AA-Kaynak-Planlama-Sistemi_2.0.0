import test from "node:test";
import assert from "node:assert/strict";
import {
  validate,
  teamSchema,
  riskSystemSchema,
} from "../shared/server-domain.ts";
import { snapshotSchema } from "../shared/snapshot-schema.ts";
import {
  compareSnapshotValidation,
  validationFixture,
} from "./snapshot-validation-suite.mjs";

const note = () => ({
  id: "m",
  name: "Heading",
  start: "2026-02-01",
  end: "2026-02-10",
  barNotes: [{ text: " Note ", includeInReport: true }],
});
const invalidCases = [
  [
    "work calendar key",
    (d) => {
      d.workCalendar["2026-02-30"] = {
        type: "company",
        label: "Off",
        fraction: 1,
      };
    },
  ],
  [
    "work range membership",
    (d) => {
      d.workCalendar["2026-01-01"] = {
        type: "company",
        label: "Off",
        fraction: 1,
        range: { from: "2026-01-02", to: "2026-01-03" },
      };
    },
  ],
  [
    "duplicate team",
    (d) => {
      d.teams.push({ ...d.teams[0] });
    },
  ],
  [
    "duplicate project",
    (d) => {
      d.projects.push({ ...d.projects[0] });
    },
  ],
  [
    "duplicate resource",
    (d) => {
      d.resources.push(structuredClone(d.resources[0]));
    },
  ],
  [
    "duplicate system ID",
    (d) => {
      d.riskSystems.push({ ...d.riskSystems[0], name: "Other" });
    },
  ],
  [
    "duplicate system name",
    (d) => {
      d.riskSystems.push({ id: "s2", name: "system" });
    },
  ],
  [
    "duplicate rank",
    (d) => {
      d.projects[0].sortOrder = 1;
      d.projects.push({ ...d.projects[0], id: "p2" });
    },
  ],
  [
    "duplicate risk",
    (d) => {
      d.risks.push({ ...d.risks[0] });
    },
  ],
  [
    "unknown risk system",
    (d) => {
      d.risks[0].systemId = "missing";
    },
  ],
  [
    "unknown risk project",
    (d) => {
      d.risks[0].projectId = "missing";
    },
  ],
  [
    "partial residual",
    (d) => {
      d.risks[0].residualImpact = 2;
    },
  ],
  [
    "missing residual date",
    (d) => {
      d.risks[0].residualLikelihood = 2;
      d.risks[0].residualImpact = 2;
    },
  ],
  [
    "personal owner",
    (d) => {
      d.personCalendar["missing|2026-01-01|leave"] = {
        type: "leave",
        hours: 1,
        label: "",
      };
    },
  ],
  [
    "personal key",
    (d) => {
      d.personCalendar["r|2026-01-01|training"] = {
        type: "leave",
        hours: 1,
        label: "",
      };
    },
  ],
  [
    "personal duplicate type",
    (d) => {
      for (const k of ["r|2026-01-01", "r|2026-01-01|leave"])
        d.personCalendar[k] = { type: "leave", hours: 1, label: "" };
    },
  ],
  [
    "personal daily sum",
    (d) => {
      for (const type of ["leave", "training"])
        d.personCalendar["r|2026-01-01|" + type] = {
          type,
          hours: 5,
          label: "",
        };
    },
  ],
  [
    "personal return exclusive",
    (d) => {
      d.personCalendar["r|2026-01-03|leave"] = {
        type: "leave",
        hours: 1,
        label: "",
        range: { from: "2026-01-01", to: "2026-01-03", hours: 1 },
      };
    },
  ],
  [
    "personal range hours",
    (d) => {
      d.personCalendar["r|2026-01-01|leave"] = {
        type: "leave",
        hours: 2,
        label: "",
        range: { from: "2026-01-01", to: "2026-01-03", hours: 1 },
      };
    },
  ],
  [
    "duplicate version",
    (d) => {
      d.resources[0].versions.push({ ...d.resources[0].versions[0] });
    },
  ],
  [
    "unknown team",
    (d) => {
      d.resources[0].versions[0].team = "missing";
    },
  ],
  [
    "missing start",
    (d) => {
      d.resources[0].versions[0].start = "";
    },
  ],
  [
    "invalid employment dates",
    (d) => {
      d.resources[0].versions[0].end = "2025-12-31";
    },
  ],
  [
    "invalid project dates",
    (d) => {
      d.projects[0].end = "2025-12";
    },
  ],
  [
    "duplicate milestone",
    (d) => {
      d.projects[0].milestones = [note(), note()];
    },
  ],
  [
    "disabled critical topics",
    (d) => {
      d.projects[0].milestones = [{ ...note(), hasCriticalTopics: false }];
    },
  ],
  [
    "milestone point range",
    (d) => {
      d.projects[0].milestones = [{ ...note(), displayKind: "milestone" }];
    },
  ],
  [
    "milestone period",
    (d) => {
      d.projects[0].milestones = [{ ...note(), start: "2025-12-01" }];
    },
  ],
  [
    "detail note period",
    (d) => {
      const n = note();
      n.barNotes[0].end = "2027-01-01";
      d.projects[0].milestones = [n];
    },
  ],
  [
    "overlapping bars",
    (d) => {
      d.projects[0].milestones = [
        {
          ...note(),
          additionalRanges: [
            { start: "2026-02-02", end: "2026-02-05", description: "Other" },
          ],
        },
      ];
    },
  ],
  [
    "planned owner",
    (d) => {
      d.allocations["missing|p|2026-01"] = 0;
    },
  ],
  [
    "planned project",
    (d) => {
      d.allocations["t|missing|2026-01"] = 0;
    },
  ],
  [
    "planned period",
    (d) => {
      d.allocations["t|p|2027-01"] = 1;
    },
  ],
  [
    "actual key",
    (d) => {
      d.actualAllocations["r|p|2026-01|extra"] = 0;
    },
  ],
  [
    "actual owner",
    (d) => {
      d.actualAllocations["missing|p|2026-01"] = 0;
    },
  ],
  [
    "actual period",
    (d) => {
      d.actualAllocations["r|p|2027-01"] = 1;
    },
  ],
  [
    "hours key",
    (d) => {
      d.actualWorkedHours["r|2026-00"] = 0;
    },
  ],
  [
    "hours owner",
    (d) => {
      d.actualWorkedHours["missing|2026-01"] = 0;
    },
  ],
  [
    "percent key",
    (d) => {
      d.actualPercentEntries["r|p|2026-01|extra"] = 0;
    },
  ],
  [
    "percent actual link",
    (d) => {
      d.actualPercentEntries["r|p|2026-01"] = 50;
    },
  ],
  [
    "percent hours mismatch",
    (d) => {
      d.actualAllocations["r|p|2026-01"] = 0;
      d.actualPercentEntries["r|p|2026-01"] = 50;
    },
  ],
  [
    "invalid ID",
    (d) => {
      d.teams[0].id = "bad id";
    },
  ],
  [
    "invalid leadership",
    (d) => {
      d.teams[0].lead = "missing";
    },
  ],
  [
    "invalid manager",
    (d) => {
      d.leaderManagers = { missing: "Manager" };
    },
  ],
  [
    "invalid phase month",
    (d) => {
      d.projects[0].phases["2026-13"] = "Phase";
    },
  ],
];

test("snapshot facade preserves defaults, strict shapes, stripping and schema exports", () => {
  const d = validationFixture();
  const result = compareSnapshotValidation(d);
  assert(!result.error, result.error?.message);
  assert.equal(result.data.risks[0].system, "System");
  assert.equal(result.data.teams[0].name, "Team");
  assert.equal(teamSchema, snapshotSchema.shape.teams.element);
  assert.equal(
    riskSystemSchema,
    snapshotSchema.shape.riskSystems._def.innerType.element,
  );
  delete d.riskSystems;
  delete d.risks;
  delete d.actualAllocations;
  delete d.actualWorkedHours;
  delete d.actualPercentEntries;
  delete d.workCalendar;
  delete d.personCalendar;
  delete d.leaderManagers;
  d.users = [
    {
      id: "u",
      username: "synthetic",
      name: "User",
      role: "normal",
      leaders: [],
      active: true,
    },
  ];
  d.extra = "stripped";
  const normalized = compareSnapshotValidation(d).data;
  assert(normalized);
  assert(!("users" in normalized));
  assert(!("extra" in normalized));
  assert.deepEqual(normalized.actualAllocations, {});
});

test("snapshot normalization preserves legacy dates, departure propagation and valid milestone overlap", () => {
  const d = validationFixture(),
    v = d.resources[0].versions[0];
  v.start = "2026-01";
  d.resources[0].versions.push({
    ...v,
    effective: "2026-03",
    status: "İşten Ayrıldı",
    end: "2026-03-15",
  });
  d.projects[0].milestones = [
    {
      ...note(),
      additionalRanges: [
        {
          start: "2026-02-05",
          end: "2026-02-05",
          displayKind: "milestone",
          description: "Point",
        },
      ],
    },
  ];
  const result = compareSnapshotValidation(d);
  assert(!result.error, result.error?.message);
  assert.equal(result.data.resources[0].versions[0].start, "2026-01-01");
  assert.equal(result.data.resources[0].versions[0].end, "2026-03-15");
  const legacy = validationFixture();
  legacy.resources[0].versions[0].start = "";
  assert(compareSnapshotValidation(legacy).error);
  assert(
    compareSnapshotValidation(legacy, {
      previousResources: structuredClone(legacy.resources),
    }).data,
  );
});

test("each full snapshot relationship failure matches the frozen validator", () => {
  for (const [name, change] of invalidCases) {
    const d = validationFixture();
    change(d);
    const result = compareSnapshotValidation(d);
    assert.equal(
      result.error?.status,
      400,
      name + ": " + result.error?.message,
    );
  }
});

test("multiple simultaneous domain faults preserve first-error order across all pairs", () => {
  let comparisons = 0;
  for (const [nameA, a] of invalidCases)
    for (const [nameB, b] of invalidCases) {
      const d = validationFixture();
      a(d);
      b(d);
      const result = compareSnapshotValidation(d);
      assert(result.error, nameA + " + " + nameB);
      comparisons++;
    }
  assert.equal(comparisons, 2025);
});

test("shape issues and numeric bounds precede relationships with unchanged paths and order", () => {
  for (const [field, key, max] of [
    ["allocations", "t|p|2026-01", 10000],
    ["actualAllocations", "r|p|2026-01", 100],
    ["actualWorkedHours", "r|2026-01", 1000],
    ["actualPercentEntries", "r|p|2026-01", 10000],
    ["revisions", "planning", Infinity],
  ])
    for (const value of [-1, "1", null, NaN, Infinity, max + 1]) {
      const d = validationFixture();
      d[field][key] = value;
      d.teams[0].lead = "missing";
      const result = compareSnapshotValidation(d);
      assert.equal(result.error?.name, "ZodError");
    }
  for (const change of [
    (d) => {
      d.risks[0].extra = "unknown";
    },
    (d) => {
      d.riskSystems[0].extra = true;
    },
    (d) => {
      d.resources[0].name = "";
      d.projects[0].start = "invalid";
    },
  ]) {
    const d = validationFixture();
    change(d);
    assert.equal(compareSnapshotValidation(d).error?.name, "ZodError");
  }
});

test("special dictionary keys and pre-schema previous-resource failures retain their behavior", () => {
  const d = validationFixture();
  d.leaders.push("__proto__");
  d.leaderManagers = JSON.parse('{"__proto__":"Manager"}');
  d.allocations = JSON.parse('{"__proto__":0,"constructor":0}');
  const result = compareSnapshotValidation(d);
  assert.equal(result.error?.status, 400);
  d.allocations = {};
  const normalized = compareSnapshotValidation(d).data;
  assert(Object.hasOwn(normalized.leaderManagers, "__proto__"));
  for (const previousResources of [
    null,
    [],
    [{}],
    [{ id: "r", versions: null }],
  ])
    compareSnapshotValidation({ teams: "invalid" }, { previousResources });
  const previous = validationFixture().resources;
  const before = structuredClone(previous);
  compareSnapshotValidation(validationFixture(), {
    previousResources: previous,
  });
  assert.deepEqual(previous, before);
  assert.equal(typeof validate, "function");
});
