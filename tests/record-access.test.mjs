import test from "node:test";
import assert from "node:assert/strict";
import { activeTeamMembers } from "../shared/model.ts";
import { sourceRows, importColumns } from "../shared/resource-import.ts";
import { validate } from "../shared/server-domain.ts";
import { applyLeaderChange } from "../backend/operations.mjs";
import { auditEntries } from "../backend/audit.mjs";
import { ownValue } from "../shared/records.ts";
import { table, validateRows } from "../backend/tables.mjs";

const fixture = () => ({
  teams: [
    { id: "t", name: "Team", lead: "A", excelCapacity: 0, catalog: true },
  ],
  resources: [],
  projects: [],
  allocations: {},
  revisions: {},
  leaders: ["A"],
  leaderManagers: {},
  catalogVersion: 2,
});
const person = (id, team) => ({
  id,
  name: "Person " + id,
  note: "",
  versions: [
    {
      team,
      lead: "A",
      effective: "2026-01",
      status: "Aktif Çalışan",
      included: true,
      start: "2026-01-01",
      end: "",
      amount: 1,
    },
  ],
});

test("active member groups support prototype-like team IDs without altering object prototypes", () => {
  const d = fixture();
  const ids = ["constructor", "toString", "__proto__"];
  d.teams = ids.map((id) => ({ ...d.teams[0], id }));
  d.resources = ids.flatMap((id, index) => [
    person("r" + index, id),
    person("s" + index, id),
  ]);
  const result = activeTeamMembers(validate(d), "2026-09");
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.deepEqual(Object.keys(result).sort(), [...ids].sort());
  for (const [index, id] of ids.entries())
    assert.deepEqual(result[id], ["Person r" + index, "Person s" + index]);
  assert.equal(Object.hasOwn(Object.prototype, "Person r0"), false);
});

test("unrecognised constructor Excel headers are ignored rather than mapped to an inherited function", () => {
  const values = [
    "Person",
    "A",
    "Team",
    "Aktif Çalışan",
    "Evet",
    1,
    "2026-01-01",
    "",
    "",
  ];
  const rows = [
    {
      number: 1,
      cells: [
        ...importColumns.map(([, label]) => ({ value: label })),
        { value: "constructor" },
        { value: "Constructor" },
      ],
    },
    {
      number: 2,
      cells: [
        ...values.map((value) => ({ value })),
        { value: "ignored", formula: true },
        { value: "also ignored" },
      ],
    },
  ];
  const [row] = sourceRows(rows);
  assert.deepEqual(row.problems, []);
  assert.deepEqual(
    Object.keys(row.values),
    importColumns.map(([field]) => field),
  );
  assert.equal(row.values.name, "Person");
});

test("leadership manager records preserve their own __proto__ key through validation and JSON round trips", () => {
  const d = fixture();
  d.leaders.push("constructor", "__proto__");
  d.leaderManagers = JSON.parse(
    '{"__proto__":"  Manager  ","constructor":"Other"}',
  );
  const result = validate(d);
  assert.equal(Object.getPrototypeOf(result.leaderManagers), Object.prototype);
  assert.equal(Object.hasOwn(result.leaderManagers, "__proto__"), true);
  assert.equal(result.leaderManagers.__proto__, "Manager");
  assert.equal(
    validate(JSON.parse(JSON.stringify(result))).leaderManagers.__proto__,
    "Manager",
  );
  for (const invalid of [
    new Date(),
    new Map(),
    new Set(),
    [],
    null,
    "bad",
    4,
    { A: 42 },
    { A: "x".repeat(201) },
  ]) {
    assert.throws(() => validate({ ...d, leaderManagers: invalid }));
  }
  assert.throws(
    () =>
      validate({
        ...d,
        leaderManagers: JSON.parse('{"__proto__":"x","missing":"Manager"}'),
      }),
    /liderlik yöneticisi/,
  );
});

test("renaming a prototype-named leadership with no manager uses an empty string and supports __proto__ manager updates", async () => {
  const d = fixture();
  d.leaders = ["constructor"];
  d.teams[0].lead = "constructor";
  const c = {
    query: async () => ({ rows: [] }),
    upsert: async (name, rows) => validateRows(name, rows),
    remove: async () => {},
  };
  const admin = { role: "admin" };
  await applyLeaderChange(
    d,
    admin,
    {
      action: "rename",
      name: "constructor",
      newName: "__proto__",
      generation: 0,
    },
    c,
    0,
  );
  assert.equal(d.leaders[0], "__proto__");
  await applyLeaderChange(
    d,
    admin,
    {
      action: "update",
      name: "__proto__",
      managerName: "Manager",
      generation: 1,
    },
    c,
    1,
  );
  assert.equal(Object.getPrototypeOf(d.leaderManagers), Object.prototype);
  assert.equal(validate(d).leaderManagers.__proto__, "Manager");
});

test("audit label fallback uses record IDs when prototype-like referenced names are absent", () => {
  const base = fixture();
  const after = { ...base, actualWorkedHours: { "constructor|2026-09": 180 } };
  const [event] = auditEntries(base, after, { _id: "admin" });
  assert.equal(event.record_name, "constructor · 2026-09");
});

test("SQL table whitelist rejects inherited property names before constructing identifiers or row specs", () => {
  for (const name of [
    "constructor",
    "toString",
    "__proto__",
    "unknown",
    "teams]; DELETE",
  ]) {
    assert.throws(() => table(name), /Unknown table/);
    assert.throws(() => validateRows(name, [{}]), /Unknown table/);
  }
  assert.equal(table("teams"), "[kp_teams]");
  assert.equal(table("schema_migrations"), "[kp_schema_migrations]");
  validateRows("teams", [{ id: "constructor", name: "Team" }]);
});

test("own-value lookups retain falsy stored values and ignore inherited entries after JSON round trips", () => {
  const entries = JSON.parse(
    '{"__proto__":"Manager","constructor":0,"toString":"","flag":false}',
  );
  const prototype = Object.getPrototypeOf(entries);
  assert.equal(ownValue(entries, "__proto__"), "Manager");
  assert.equal(ownValue(entries, "constructor"), 0);
  assert.equal(ownValue(entries, "toString"), "");
  assert.equal(ownValue(entries, "flag"), false);
  for (const record of [
    {},
    null,
    undefined,
    Object.create({ constructor: "Inherited" }),
  ])
    assert.equal(ownValue(record, "constructor"), undefined);
  assert.equal(Object.getPrototypeOf(entries), prototype);
  assert.equal(
    ownValue(JSON.parse(JSON.stringify(entries)), "__proto__"),
    "Manager",
  );
});

test("phase color maps validate month keys before persistence and reject prototype-like keys without silently dropping them", () => {
  const d = fixture();
  d.projects = [
    { id: "p", name: "Project", start: "2026-01", end: "2026-12", phases: {} },
  ];
  for (const key of [
    "constructor",
    "toString",
    "__proto__",
    "valueOf",
    "2026-13",
  ]) {
    d.projects[0].phaseColors = Object.fromEntries([[key, "gray"]]);
    assert.throws(() => validate(d));
  }
  d.projects[0].phaseColors = { "2026-09": "gray" };
  assert.deepEqual(validate(d).projects[0].phaseColors, { "2026-09": "gray" });
});
