import test from "node:test";
import assert from "node:assert/strict";
import {
  checkActualEntry,
  parseWorkedHoursInput,
  prepareActualAllocationChange,
  prepareWorkedHoursChange,
} from "../frontend/src/features/actual-allocation-commands.ts";
import { createActualMonthIndex } from "../shared/actual-months.ts";
import { assertActualMonthlyLimits } from "../shared/actual-limits.ts";
import {
  effectivePersonHoursInMonth,
  trainingHoursInMonth,
  workdaysInMonth,
} from "../shared/actual-units.ts";
import { applyChanges } from "../backend/operations.mjs";

const admin = { _id: "admin", role: "admin", leaders: [] };
const owner = { _id: "owner", role: "normal", resourceId: "r", leaders: [] };
const month = "2026-09";
const fixture = () => ({
  teams: [{ id: "t", name: "Takım", lead: "A", excelCapacity: 0 }],
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
    end: "2030-12",
    phases: {},
  })),
  allocations: {},
  actualAllocations: {},
  actualWorkedHours: {},
  actualPercentEntries: {},
  workCalendar: {},
  personCalendar: {},
  revisions: {},
  leaders: ["A"],
  catalogVersion: 2,
});
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function addAbsences(data) {
  data.workCalendar["2026-09-01"] = {
    type: "official",
    label: "Tatil",
    fraction: 1,
  };
  data.workCalendar["2026-09-02"] = {
    type: "company",
    label: "Yarım gün",
    fraction: 0.5,
  };
  data.personCalendar["r|2026-09-03|leave"] = {
    type: "leave",
    hours: 2.5,
    label: "",
  };
}

test("actual decimal inputs preserve zero/reset, commas and capacity boundaries and reject non-finite values", () => {
  assert.deepEqual(checkActualEntry("", "hours", month, 180, 0), {
    kind: "valid",
    entry: { unit: "hours", value: 0 },
  });
  assert.equal(
    checkActualEntry(" 2,5 ", "hours", month, 180, 0).entry.value,
    2.5,
  );
  for (const text of ["NaN", "Infinity", "-1", "1,2,3", "abc"])
    assert.equal(
      checkActualEntry(text, "hours", month, 180, 0).kind,
      "invalid",
    );
  assert.equal(checkActualEntry("100", "percent", month, 180, 0).kind, "valid");
  assert.equal(
    checkActualEntry("100.01", "percent", month, 180, 0).kind,
    "limit",
  );
  assert.equal(checkActualEntry("180", "hours", month, 180, 0).kind, "valid");
  assert.equal(checkActualEntry("180.5", "hours", month, 180, 0).kind, "limit");
  assert.equal(parseWorkedHoursInput(""), null);
  assert.equal(parseWorkedHoursInput("0"), 0);
  assert.equal(parseWorkedHoursInput("180,5"), 180.5);
});

test("percent, day and hour commands produce identical stored work across holidays and leave", () => {
  for (const entry of [
    { unit: "percent", value: 50 },
    { unit: "days", value: 102 / 9 },
    { unit: "hours", value: 102 },
  ]) {
    const data = fixture();
    addAbsences(data);
    data.actualWorkedHours["r|" + month] = 220;
    data.revisions["actual:r|p|" + month] = 7;
    const before = structuredClone(data);
    const command = prepareActualAllocationChange(
      freeze(structuredClone(data)),
      "r",
      "p",
      month,
      entry,
    );
    assert.equal(command.revision, 7);
    assert.deepEqual(data, before);
    applyChanges(data, owner, [command]);
    assert(Math.abs(data.actualAllocations[command.id] * 180 - 102) < 1e-9);
    assert.equal(
      data.actualPercentEntries[command.id],
      entry.unit === "percent" ? 50 : undefined,
    );
    assert.equal(data.revisions["actual:" + command.id], 8);
  }
});

test("all projects and training count toward capacity while replacement excludes only the edited cell", () => {
  const data = fixture();
  data.actualWorkedHours["r|" + month] = 180;
  data.actualAllocations = { ["r|p|" + month]: 0.5, ["r|q|" + month]: 0.4 };
  data.personCalendar["r|2026-09-03|training"] = {
    type: "training",
    hours: 9,
    label: "",
  };
  const summary = createActualMonthIndex(data).get("r", month);
  assert(Math.abs(summary.totalFte - 0.95) < 1e-9);
  const valid = prepareActualAllocationChange(data, "r", "p", month, {
    unit: "percent",
    value: 55,
  });
  applyChanges(data, owner, [valid]);
  assert.doesNotThrow(() => assertActualMonthlyLimits(data));
  assert.throws(
    () =>
      prepareActualAllocationChange(data, "r", "p", month, {
        unit: "percent",
        value: 55.5,
      }),
    /%100/,
  );
  assert.throws(
    () => prepareWorkedHoursChange(data, "r", month, 179.5),
    /%100/,
  );
});

test("net hour upper bound accounts for stored holidays and leave before sending a command", () => {
  const data = fixture();
  addAbsences(data);
  const summary = createActualMonthIndex(data).get("r", month);
  assert.equal(summary.nonWorkingHours, 16);
  assert.equal(summary.maxEffectiveHours, 984);
  // Previous UI accepted 1000 net hours and generated an out-of-range 1016-hour record.
  assert.throws(() =>
    applyChanges(structuredClone(data), owner, [
      {
        kind: "workedHours",
        id: "r|" + month,
        value: 1000 + summary.nonWorkingHours,
        revision: 0,
      },
    ]),
  );
  assert.throws(
    () => parseWorkedHoursInput("1000", summary.maxEffectiveHours),
    /984 saat/,
  );
  assert.throws(
    () => prepareWorkedHoursChange(data, "r", month, 1000),
    /984 saat/,
  );
  const before = structuredClone(data);
  const command = prepareWorkedHoursChange(
    freeze(structuredClone(data)),
    "r",
    month,
    984,
  );
  assert.equal(command.value, 1000);
  assert.deepEqual(data, before);
  applyChanges(data, owner, [command]);
  assert.equal(
    createActualMonthIndex(data).get("r", month).effectiveHours,
    984,
  );
});

test("clearing manual hours restores the calendar calculation and rejects an overbooked reset", () => {
  const data = fixture();
  addAbsences(data);
  data.actualWorkedHours["r|" + month] = 250;
  data.actualAllocations["r|p|" + month] = 200 / 180;
  const before = structuredClone(data);
  assert.throws(() => prepareWorkedHoursChange(data, "r", month, null), /%100/);
  assert.deepEqual(data, before);
  data.actualAllocations["r|p|" + month] = 90 / 180;
  const command = prepareWorkedHoursChange(data, "r", month, null);
  assert.equal(command.value, null);
  applyChanges(data, owner, [command]);
  assert.equal(data.actualWorkedHours[command.id], undefined);
  assert.equal(
    createActualMonthIndex(data).get("r", month).effectiveHours,
    182,
  );
});

test("commands preserve server ownership and revision checks without applying visibility status to historical data", () => {
  const data = fixture();
  Object.assign(data.resources[0].versions[0], {
    status: "İşten Ayrıldı",
    end: "2026-01-31",
  });
  const command = prepareActualAllocationChange(data, "r", "p", month, {
    unit: "hours",
    value: 9,
  });
  assert.throws(
    () =>
      applyChanges(structuredClone(data), { ...owner, resourceId: "other" }, [
        command,
      ]),
    (error) => error.status === 403,
  );
  applyChanges(data, owner, [command]);
  assert.equal(data.actualAllocations[command.id], 9 / 180);
  assert.throws(
    () => applyChanges(data, owner, [command]),
    (error) => error.status === 409,
  );
  const future = prepareActualAllocationChange(data, "r", "p", "2030-01", {
    unit: "hours",
    value: 9,
  });
  assert.throws(
    () => applyChanges(structuredClone(data), admin, [future]),
    /Gelecek aylara/,
  );
});

test("removed records and invalid months fail before preparing a write", () => {
  const data = freeze(fixture());
  const entry = { unit: "hours", value: 9 };
  assert.throws(
    () => prepareActualAllocationChange(data, "missing", "p", month, entry),
    /Çalışan kaynak bulunamadı/,
  );
  assert.throws(
    () => prepareActualAllocationChange(data, "r", "missing", month, entry),
    /Proje bulunamadı/,
  );
  assert.throws(
    () => prepareActualAllocationChange(data, "r", "p", "1999-12", entry),
    /Geçerli bir ay/,
  );
  assert.throws(
    () => prepareWorkedHoursChange(data, "r", "2026-13", 180),
    /Geçerli bir ay/,
  );
  assert.throws(
    () => prepareActualAllocationChange(data, "r", "p", "2025-12", entry),
    /Proje tarihleri dışında/,
  );
});

test("month index matches existing calendar rules across automatic/manual hours and multiple snapshots", () => {
  const data = fixture();
  addAbsences(data);
  data.personCalendar["r|2026-09-02|training"] = {
    type: "training",
    hours: 9,
    label: "",
  };
  data.personCalendar["r|2026-09-05|training"] = {
    type: "training",
    hours: 9,
    label: "",
  };
  for (let index = 1; index <= 12; index++) {
    const current = "2026-" + String(index).padStart(2, "0");
    if (index % 2) data.actualWorkedHours["r|" + current] = 220;
    data.actualAllocations["r|p|" + current] = 0.25;
    data.actualAllocations["r|q|" + current] = 0.5;
  }
  const before = structuredClone(data),
    index = createActualMonthIndex(freeze(structuredClone(data)));
  for (let number = 1; number <= 12; number++) {
    const current = "2026-" + String(number).padStart(2, "0"),
      summary = index.get("r", current);
    assert.equal(summary.projectFte, 0.75);
    assert.equal(
      summary.effectiveHours,
      effectivePersonHoursInMonth(
        current,
        "r",
        data.actualWorkedHours["r|" + current],
        data.workCalendar,
        data.personCalendar,
      ),
    );
    assert.equal(
      summary.trainingHours,
      trainingHoursInMonth(
        current,
        "r",
        data.workCalendar,
        data.personCalendar,
      ),
    );
    assert.equal(
      index.get("other", current).autoHours,
      workdaysInMonth(current) * 9 - (current === month ? 13.5 : 0),
    );
  }
  assert.equal(index.get("r", month).trainingHours, 4.5);
  assert.deepEqual(data, before);
  const changed = structuredClone(data);
  changed.actualAllocations["r|p|" + month] = 0;
  assert.equal(createActualMonthIndex(changed).get("r", month).projectFte, 0.5);
  assert.equal(index.get("r", month).projectFte, 0.75);
});

test("private-calendar monthly summaries preserve peer entry limits and net-hour conversion", () => {
  const complete = fixture();
  addAbsences(complete);
  complete.personCalendar["r|2026-09-04|training"] = {
    type: "training",
    hours: 4.5,
    label: "PRIVATE_TRAINING",
  };
  complete.actualAllocations["r|q|" + month] = 0.5;
  complete.revisions["actual:r|p|" + month] = 4;
  const summary = createActualMonthIndex(complete).get("r", month);
  const scoped = freeze({ ...structuredClone(complete), personCalendar: {} });
  const before = structuredClone(complete);
  for (const entry of [
    { unit: "hours", value: 45 },
    { unit: "percent", value: 25 },
  ]) {
    const expected = prepareActualAllocationChange(
      complete,
      "r",
      "p",
      month,
      entry,
    );
    const command = prepareActualAllocationChange(
      scoped,
      "r",
      "p",
      month,
      entry,
      summary,
    );
    assert.deepEqual(command, expected);
    const saved = structuredClone(complete);
    applyChanges(saved, admin, [command]);
    assert(
      Math.abs(
        saved.actualAllocations[command.id] -
          (entry.unit === "hours" ? 45 : summary.effectiveHours / 4) / 180,
      ) < 1e-9,
    );
  }
  assert.throws(
    () =>
      prepareActualAllocationChange(
        scoped,
        "r",
        "p",
        month,
        { unit: "hours", value: summary.effectiveHours - 90 },
        summary,
      ),
    /%100/,
  );
  for (const hours of [null, 200]) {
    const command = prepareWorkedHoursChange(
      scoped,
      "r",
      month,
      hours,
      summary,
    );
    assert.deepEqual(
      command,
      prepareWorkedHoursChange(complete, "r", month, hours),
    );
    const saved = structuredClone(complete);
    applyChanges(saved, admin, [command]);
    assert.equal(
      createActualMonthIndex(saved).get("r", month).effectiveHours,
      hours ?? summary.autoHours,
    );
  }
  assert.throws(
    () => prepareWorkedHoursChange(scoped, "r", month, 94, summary),
    /%100/,
  );
  assert.deepEqual(complete, before);
  assert.deepEqual(scoped.personCalendar, {});
});
