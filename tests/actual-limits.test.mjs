import test from "node:test";
import assert from "node:assert/strict";
import { assertActualMonthlyLimits } from "../shared/actual-limits.ts";
import { restore } from "../backend/operations.mjs";
const fixture = () => ({
  teams: [
    { id: "t", name: "Takım", lead: "A", excelCapacity: 0, catalog: true },
  ],
  resources: [
    {
      id: "r",
      name: "Çalışan",
      note: "",
      versions: [
        {
          effective: "2026-01",
          team: "t",
          lead: "A",
          status: "Aktif Çalışan",
          included: true,
          start: "2026-01-01",
          end: "",
          amount: 1,
        },
      ],
    },
  ],
  projects: ["p", "q"].map((id) => ({
    id,
    name: id,
    start: "2026-01",
    end: "2026-12",
    phases: {},
  })),
  allocations: {},
  actualAllocations: {},
  actualWorkedHours: {},
  workCalendar: {},
  personCalendar: {},
  revisions: {},
  leaders: ["A"],
  catalogVersion: 2,
});
test("restored project totals cannot exceed the person's monthly hours", () => {
  const backup = fixture();
  backup.actualWorkedHours["r|2026-02"] = 180;
  backup.actualAllocations = { "r|p|2026-02": 0.6, "r|q|2026-02": 0.6 };
  const current = fixture(),
    before = structuredClone(current);
  assert.throws(
    () => restore(current, { role: "admin" }, backup),
    (error) => error.status === 400 && error.message.includes("%100"),
  );
  assert.deepEqual(current, before);
});
test("restored training counts toward totals even without any project entries", () => {
  const backup = fixture();
  backup.actualWorkedHours["r|2026-02"] = 2;
  backup.personCalendar["r|2026-02-02|training"] = {
    type: "training",
    hours: 3,
    label: "",
  };
  assert.throws(() => assertActualMonthlyLimits(backup), /%100/);
  assert.throws(() => restore(fixture(), { role: "admin" }, backup), /%100/);
  backup.actualWorkedHours["r|2026-02"] = 3;
  assert.doesNotThrow(() => restore(fixture(), { role: "admin" }, backup));
});
test("manual overtime, half holidays, leave and training share the same boundary", () => {
  const d = fixture();
  d.actualWorkedHours["r|2026-02"] = 250;
  d.workCalendar["2026-02-02"] = {
    type: "company",
    label: "Yarım gün",
    fraction: 0.5,
  };
  d.personCalendar["r|2026-02-03|leave"] = {
    type: "leave",
    hours: 2,
    label: "",
  };
  d.personCalendar["r|2026-02-04|training"] = {
    type: "training",
    hours: 3,
    label: "",
  };
  d.actualAllocations["r|p|2026-02"] = (250 - 4.5 - 2 - 3) / 180;
  assert.doesNotThrow(() => assertActualMonthlyLimits(d));
  d.actualAllocations["r|q|2026-02"] = 0.5 / 180;
  assert.throws(() => assertActualMonthlyLimits(d), /%100/);
});
test("weekends and full holidays cannot count a second time as training", () => {
  const d = fixture();
  d.workCalendar["2026-02-02"] = {
    type: "official",
    label: "Tatil",
    fraction: 1,
  };
  for (const date of ["2026-02-02", "2026-02-07"])
    d.personCalendar["r|" + date + "|training"] = {
      type: "training",
      hours: 9,
      label: "",
    };
  d.actualAllocations["r|p|2026-02"] = 171 / 180;
  assert.doesNotThrow(() => assertActualMonthlyLimits(d));
});
test("API checks selected months; restore checks all months without mutating the data", () => {
  const d = fixture();
  d.actualAllocations["r|p|2026-02"] = 2;
  d.actualAllocations["r|p|2026-03"] = 0.5;
  const before = structuredClone(d);
  assert.doesNotThrow(() =>
    assertActualMonthlyLimits(d, new Set(["r|2026-03"])),
  );
  assert.throws(() => assertActualMonthlyLimits(d), /2026-02.*%100/);
  assert.deepEqual(d, before);
});

test("an explicit empty monthly scope does not scan historical allocations, while omitted scope still checks all totals", () => {
  const untouched = new Proxy(
    {},
    {
      get() {
        throw Error("Unrelated historical data read");
      },
    },
  );
  assert.doesNotThrow(() => assertActualMonthlyLimits(untouched, []));
  assert.doesNotThrow(() => assertActualMonthlyLimits(untouched, new Set()));
  const empty = function* () {};
  assert.doesNotThrow(() => assertActualMonthlyLimits(untouched, empty()));
  const all = fixture();
  all.actualWorkedHours["r|2026-09"] = 180;
  all.actualAllocations = { "r|p|2026-09": 1.1 };
  assert.throws(() => assertActualMonthlyLimits(all), /%100/);
  assert.throws(() => assertActualMonthlyLimits(all, ["r|2026-09"]), /%100/);
});
