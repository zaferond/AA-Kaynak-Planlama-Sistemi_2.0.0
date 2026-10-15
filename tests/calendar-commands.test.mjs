import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  startCalendarDraft,
  addCalendarDates,
  prepareCalendarChange,
  preparePersonalDayChange,
  preparePersonalDayRemoval,
  preparePersonalRangeChanges,
  preparePersonalRangeSave,
  preparePersonalRangeRemoval,
  startPersonalRangeDraft,
  editCalendarRange,
  removeCalendarRange,
} from "../frontend/src/features/calendar-commands.ts";
import { applyChanges } from "../backend/operations.mjs";
import { Store } from "../backend/store.mjs";
import { hashPassword } from "../backend/auth.mjs";
import {
  sharedCalendarRanges,
  personalCalendarRanges,
} from "../frontend/src/features/work-calendar/calendar-ranges.ts";
import { validate } from "../backend/domain/index.mjs";
import { scopeData } from "../shared/access.ts";
import { absenceRangeRows } from "../frontend/src/features/work-calendar/absence-range-report.ts";
import {
  personCalendarHoursInMonth,
  personHoursInMonth,
  DEFAULT_MONTHLY_HOURS,
} from "../shared/actual-units.ts";

const admin = { role: "admin", _id: "admin", leaders: [] };
const owner = { role: "normal", _id: "owner", resourceId: "r", leaders: [] };
const day = { type: "company", label: "Tatil", fraction: 1 };
const fixture = () => ({
  teams: [{ id: "t", name: "Takım", lead: "A", excelCapacity: 0 }],
  projects: [],
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
  allocations: {},
  workCalendar: { "2026-01-01": { ...day } },
  personCalendar: {},
  revisions: { "calendar:shared": 3 },
  leaders: ["A"],
  leaderParents: {},
  leadershipUnits: {},
  catalogVersion: 2,
});
const range = (from, to = "") => ({
  from,
  to,
  type: "official",
  fraction: 0.5,
  label: "",
});
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test("calendar drafts keep their opening revision after background refresh and prevent lost updates", () => {
  const data = fixture();
  const draft = addCalendarDates(
    startCalendarDraft(freeze(structuredClone(data))),
    range("2026-01-02"),
  );
  applyChanges(data, admin, [
    {
      kind: "calendar",
      id: "shared",
      value: { "2026-01-05": day },
      revision: 3,
    },
  ]);
  const before = structuredClone(data);
  // The previous editor used the latest revision with its old draft, bypassing the conflict.
  const oldBehavior = structuredClone(data);
  applyChanges(oldBehavior, admin, [
    {
      ...prepareCalendarChange(draft),
      revision: data.revisions["calendar:shared"],
    },
  ]);
  assert.equal(oldBehavior.workCalendar["2026-01-05"], undefined);
  assert.throws(
    () => applyChanges(data, admin, [prepareCalendarChange(draft)]),
    (error) => error.status === 409,
  );
  assert.deepEqual(data, before);
  assert.equal(draft.revision, 3);
  assert.equal(draft.calendar["2026-01-01"].label, "Tatil");
  const command = prepareCalendarChange(draft);
  command.value["2026-01-01"].label = "changed";
  assert.equal(draft.calendar["2026-01-01"].label, "Tatil");
});

test("calendar ranges preserve other years, use inclusive dates and support leap days and the 62-day boundary", () => {
  const draft = freeze(startCalendarDraft(fixture()));
  const added = addCalendarDates(draft, range("2023-12-31", "2024-03-01"));
  assert.equal(Object.keys(added.calendar).length, 63);
  assert.deepEqual(added.calendar["2024-02-29"], {
    type: "official",
    label: "Resmî Tatil",
    fraction: 0.5,
    range: { from: "2023-12-31", to: "2024-03-01" },
  });
  assert.deepEqual(added.calendar["2026-01-01"], day);
  assert.equal(Object.keys(draft.calendar).length, 1);
  assert.throws(
    () => addCalendarDates(draft, range("2023-12-31", "2024-03-02")),
    /62 günlük/,
  );
  const single = addCalendarDates(draft, {
    ...range("2026-01-02"),
    label: "  Tek gün  ",
  });
  assert.equal(single.calendar["2026-01-02"].label, "Tek gün");
});

test("invalid calendar ranges fail before changing the draft", () => {
  const draft = freeze(startCalendarDraft(fixture()));
  for (const [input, message] of [
    [range("2026-02-29"), /Geçerli başlangıç/],
    [range("1999-12-31"), /Geçerli başlangıç/],
    [range("2200-01-01"), /Geçerli başlangıç/],
    [range("2026-01-02", "2026-01-01"), /başlangıçtan önce/],
    [{ ...range("2026-01-02"), label: "x".repeat(101) }, /100 karakter/],
  ])
    assert.throws(() => addCalendarDates(draft, input), message);
  assert.deepEqual(draft.calendar, { "2026-01-01": day });
});

test("personal commands preserve legacy keys and add independent same-day training without changing the source", () => {
  const data = fixture();
  data.personCalendar["r|2026-01-05"] = { type: "leave", hours: 2, label: "" };
  data.revisions["personDay:r|2026-01-05"] = 4;
  const before = structuredClone(data);
  const leave = preparePersonalDayChange(freeze(structuredClone(data)), "r", {
    date: "2026-01-05",
    type: "leave",
    hours: "2,5",
    label: "  İzin  ",
  });
  const training = preparePersonalDayChange(data, "r", {
    date: "2026-01-05",
    type: "training",
    hours: "3",
    label: "",
  });
  assert.equal(leave.id, "r|2026-01-05");
  assert.equal(leave.revision, 4);
  assert.equal(leave.value.label, "İzin");
  assert.equal(training.id, "r|2026-01-05|training");
  assert.deepEqual(data, before);
  applyChanges(data, owner, [leave, training]);
  assert.equal(data.personCalendar[leave.id].hours, 2.5);
  assert.equal(data.personCalendar[training.id].hours, 3);
});

test("personal commands validate real dates and half-hour steps while server retains ownership and daily-total checks", () => {
  const data = fixture();
  const input = { date: "2026-01-05", type: "leave", hours: "2", label: "" };
  for (const hours of ["", "NaN", "Infinity", "0", "-1", "0,25", "9,5"])
    assert.throws(
      () => preparePersonalDayChange(data, "r", { ...input, hours }),
      /yarım saatlik/,
    );
  assert.throws(
    () => preparePersonalDayChange(data, "r", { ...input, date: "2026-04-31" }),
    /geçerli tarih/,
  );
  assert.throws(
    () => preparePersonalDayChange(data, "missing", input),
    /Çalışan kaynak bulunamadı/,
  );
  const command = preparePersonalDayChange(data, "r", input);
  assert.throws(
    () =>
      applyChanges(structuredClone(data), { ...owner, resourceId: "other" }, [
        command,
      ]),
    (error) => error.status === 403,
  );
  const training = preparePersonalDayChange(data, "r", {
    ...input,
    type: "training",
    hours: "9",
  });
  assert.throws(
    () => applyChanges(structuredClone(data), owner, [command, training]),
    /9|günlük/i,
  );
});

test("personal removal deletes only the selected type and rejects missing, foreign and stale records", () => {
  const data = fixture();
  const input = { date: "2026-01-05", type: "leave", hours: "2", label: "" };
  applyChanges(data, owner, [
    preparePersonalDayChange(data, "r", input),
    preparePersonalDayChange(data, "r", { ...input, type: "training" }),
  ]);
  const id = "r|2026-01-05|leave";
  const command = preparePersonalDayRemoval(
    freeze(structuredClone(data)),
    "r",
    id,
  );
  assert.equal(command.revision, 1);
  assert.throws(
    () => preparePersonalDayRemoval(data, "other", id),
    /kaydı bulunamadı/,
  );
  assert.throws(
    () => preparePersonalDayRemoval(data, "r", "r|2026-01-06|leave"),
    /kaydı bulunamadı/,
  );
  applyChanges(data, owner, [command]);
  assert.equal(data.personCalendar[id], undefined);
  assert.equal(data.personCalendar["r|2026-01-05|training"].hours, 2);
  assert.throws(
    () => applyChanges(data, owner, [command]),
    (error) => error.status === 409,
  );
});

const personalRange = (from, to, type = "leave", hours = "9") => ({
  from,
  to,
  type,
  hours,
  label: " Sentetik aralık ",
});

test("personal ranges exclude return day, weekends and full holidays and cap half holidays", () => {
  const data = fixture();
  data.workCalendar["2026-01-07"] = day;
  data.workCalendar["2026-01-08"] = { ...day, fraction: 0.5 };
  const before = structuredClone(data);
  const changes = preparePersonalRangeChanges(
    freeze(data),
    "r",
    personalRange("2026-01-05", "2026-01-13"),
  );
  assert.deepEqual(
    changes.map((c) => c.id.split("|")[1]),
    ["2026-01-05", "2026-01-06", "2026-01-08", "2026-01-09", "2026-01-12"],
  );
  assert.deepEqual(
    changes.map((c) => c.value.hours),
    [9, 9, 4.5, 9, 9],
  );
  assert(changes.every((c) => c.value.label === "Sentetik aralık"));
  assert.deepEqual(data, before);
  const saved = structuredClone(data);
  applyChanges(saved, owner, changes);
  assert.equal(
    personCalendarHoursInMonth(
      "2026-01",
      "r",
      saved.workCalendar,
      saved.personCalendar,
    ).leaveHours,
    40.5,
  );
  assert.equal(
    personHoursInMonth(
      "2026-01",
      "r",
      saved.workCalendar,
      saved.personCalendar,
    ),
    personHoursInMonth("2026-01", "r", saved.workCalendar) - 40.5,
  );
});

test("personal ranges split calendar months and years and include leap day without timezone drift", () => {
  for (const [from, to, expected] of [
    ["2026-12-31", "2027-01-05", ["2026-12-31", "2027-01-01", "2027-01-04"]],
    ["2024-02-28", "2024-03-02", ["2024-02-28", "2024-02-29", "2024-03-01"]],
  ]) {
    const data = fixture();
    const changes = preparePersonalRangeChanges(
      data,
      "r",
      personalRange(from, to, "training", "2,5"),
    );
    assert.deepEqual(
      changes.map((c) => c.id.split("|")[1]),
      expected,
    );
    applyChanges(data, owner, changes);
    for (const month of new Set(expected.map((date) => date.slice(0, 7)))) {
      const totals = personCalendarHoursInMonth(
        month,
        "r",
        data.workCalendar,
        data.personCalendar,
      );
      assert.equal(totals.leaveHours, 0);
      assert.equal(
        totals.trainingHours,
        expected.filter((date) => date.startsWith(month)).length * 2.5,
      );
      assert.equal(
        personHoursInMonth(month, "r", data.workCalendar, data.personCalendar),
        totals.baseHours,
      );
    }
  }
});

test("range validation rejects empty, reversed, invalid, oversized and non-working ranges before mutation", () => {
  const data = freeze(fixture());
  for (const input of [
    personalRange("", "2026-01-06"),
    personalRange("2026-01-05", ""),
    personalRange("2026-02-29", "2026-03-02"),
    personalRange("2026-01-05", "2026-01-05"),
    personalRange("2026-01-06", "2026-01-05"),
    personalRange("2026-01-10", "2026-01-12"),
    personalRange("2026-01-01", "2026-01-02"),
    personalRange("2026-01-01", "2027-01-03"),
    personalRange("2026-01-05", "2026-01-06", "leave", "0.25"),
    { ...personalRange("2026-01-05", "2026-01-06"), label: "x".repeat(101) },
  ])
    assert.throws(() => preparePersonalRangeChanges(data, "r", input));
  assert.throws(
    () =>
      preparePersonalRangeChanges(
        data,
        "missing",
        personalRange("2026-01-05", "2026-01-06"),
      ),
    /Çalışan kaynak/,
  );
  assert.doesNotThrow(() =>
    preparePersonalRangeChanges(
      data,
      "r",
      personalRange("2026-01-01", "2027-01-02"),
    ),
  );
});

test("range updates retain legacy revisions and independent types and cannot hide excess daily hours", () => {
  const data = fixture();
  data.personCalendar["r|2026-01-05"] = {
    type: "leave",
    hours: 2,
    label: "Legacy",
  };
  data.revisions["personDay:r|2026-01-05"] = 4;
  const changes = preparePersonalRangeChanges(
    data,
    "r",
    personalRange("2026-01-05", "2026-01-07", "leave", "3"),
  );
  assert.equal(changes[0].id, "r|2026-01-05");
  assert.equal(changes[0].revision, 4);
  applyChanges(data, owner, changes);
  applyChanges(
    data,
    owner,
    preparePersonalRangeChanges(
      data,
      "r",
      personalRange("2026-01-05", "2026-01-07", "training", "2"),
    ),
  );
  assert.equal(data.personCalendar["r|2026-01-05"].hours, 3);
  assert.equal(data.personCalendar["r|2026-01-05|training"].hours, 2);
  assert.throws(
    () =>
      preparePersonalRangeChanges(
        data,
        "r",
        personalRange("2026-01-05", "2026-01-07", "training", "9"),
      ),
    /2026-01-05.*9/,
  );
  data.workCalendar["2026-01-05"] = { ...day, fraction: 0.5 };
  assert.throws(
    () =>
      preparePersonalRangeChanges(
        data,
        "r",
        personalRange("2026-01-05", "2026-01-06", "training", "2"),
      ),
    /4,5/,
  );
});

test("personal range saves are atomic on stale daily revisions and forbidden ownership and survive reopen", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-personal-range-"));
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
  };
  let store = new Store({ env });
  try {
    await store.connect();
    const password = await hashPassword("Synthetic-range-only-982!");
    const provision = (account) =>
      store.bootstrapUser({
        ...account,
        name: "Synthetic",
        username: "synthetic." + account._id,
        active: true,
        password,
        revision: 1,
        version: 1,
      });
    await provision({ ...admin, resourceId: "" });
    const actor = await store.findUser({ id: "admin" });
    await store.mutate(actor, (d) => Object.assign(d, fixture()));
    await provision(owner);
    const employee = await store.findUser({ id: "owner" });
    let snapshot = await store.read();
    const changes = preparePersonalRangeChanges(
      snapshot.data,
      "r",
      personalRange("2026-01-05", "2026-01-08"),
    );
    await store.mutate(employee, (d, u) => applyChanges(d, u, [changes[1]]));
    const before = await store.read();
    await assert.rejects(
      store.mutate(employee, (d, u) => applyChanges(d, u, changes)),
      (error) => error.status === 409,
    );
    assert.deepEqual(await store.read(), before);
    const latest = preparePersonalRangeChanges(
      before.data,
      "r",
      personalRange("2026-01-05", "2026-01-08"),
    );
    await store.mutate(employee, (d, u) => applyChanges(d, u, latest));
    snapshot = await store.read();
    assert.equal(Object.keys(snapshot.data.personCalendar).length, 3);
    assert.equal(
      personCalendarHoursInMonth(
        "2026-01",
        "r",
        snapshot.data.workCalendar,
        snapshot.data.personCalendar,
      ).leaveHours,
      27,
    );
    const originalRange = personalCalendarRanges(
      "r",
      snapshot.data.personCalendar,
      snapshot.data.workCalendar,
    )[0];
    const editDraft = startPersonalRangeDraft(
      snapshot.data,
      "r",
      originalRange,
    );
    const edit = preparePersonalRangeSave(
      snapshot.data,
      "r",
      personalRange("2026-01-06", "2026-01-09", "leave", "2"),
      editDraft,
    );
    await store.mutate(employee, (d, u) => applyChanges(d, u, edit));
    snapshot = await store.read();
    assert.equal(snapshot.data.personCalendar["r|2026-01-05|leave"], undefined);
    const editedRanges = personalCalendarRanges(
      "r",
      snapshot.data.personCalendar,
      snapshot.data.workCalendar,
    );
    assert.equal(editedRanges.length, 1);
    assert.equal(editedRanges[0].from, "2026-01-06");
    assert.equal(editedRanges[0].to, "2026-01-09");
    assert.equal(editedRanges[0].totalHours, 6);
    const foreign = preparePersonalRangeChanges(
      snapshot.data,
      "r",
      personalRange("2026-01-08", "2026-01-10"),
    );
    await assert.rejects(
      store.mutate(employee, (d, u) =>
        applyChanges(d, { ...u, resourceId: "other" }, foreign),
      ),
      (error) => error.status === 403,
    );
    assert.deepEqual(await store.read(), snapshot);
    await store.close();
    store = new Store({ env });
    await store.connect();
    assert.deepEqual(await store.read(), snapshot);
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("stored personal ranges retain non-working boundaries and adjacent identical submissions remain separate", () => {
  const data = fixture();
  data.workCalendar["2026-01-12"] = day;
  applyChanges(
    data,
    owner,
    preparePersonalRangeChanges(
      data,
      "r",
      personalRange("2026-01-09", "2026-01-13"),
    ),
  );
  const groups = personalCalendarRanges(
    "r",
    data.personCalendar,
    data.workCalendar,
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].from, "2026-01-09");
  assert.equal(groups[0].to, "2026-01-13");
  assert.equal(groups[0].keys.length, 1);
  assert.equal(groups[0].totalHours, 9);
  const fresh = fixture();
  for (const [from, to] of [
    ["2026-01-05", "2026-01-06"],
    ["2026-01-06", "2026-01-07"],
  ])
    applyChanges(
      fresh,
      owner,
      preparePersonalRangeChanges(fresh, "r", personalRange(from, to)),
    );
  assert.equal(
    personalCalendarRanges("r", fresh.personCalendar, fresh.workCalendar)
      .length,
    2,
  );
  assert.deepEqual(
    validate(structuredClone(data)).personCalendar,
    data.personCalendar,
  );
});

test("legacy personal records group compatible days across non-working gaps without mutating or joining foreign records", () => {
  const data = fixture();
  data.workCalendar["2026-01-08"] = { ...day, fraction: 0.5 };
  data.personCalendar = {
    "r|2026-01-08": { type: "leave", hours: 4.5, label: "Legacy" },
    "r|2026-01-09|leave": { type: "leave", hours: 9, label: "Legacy" },
    "r|2026-01-12|leave": { type: "leave", hours: 9, label: "Legacy" },
    "other|2026-01-12|leave": { type: "leave", hours: 9, label: "Legacy" },
    "r|2026-01-13|training": { type: "training", hours: 2, label: "Legacy" },
  };
  const before = structuredClone(data);
  const groups = personalCalendarRanges(
    "r",
    data.personCalendar,
    data.workCalendar,
  );
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].keys, [
    "r|2026-01-08",
    "r|2026-01-09|leave",
    "r|2026-01-12|leave",
  ]);
  assert.equal(groups[0].hours, 9);
  assert.equal(groups[0].totalHours, 22.5);
  assert.equal(groups[0].to, "2026-01-13");
  assert.deepEqual(data, before);
});

test("personal range edits replace only captured records, preserve other types and reject overlaps and stale opening revisions", () => {
  const data = fixture();
  applyChanges(
    data,
    owner,
    preparePersonalRangeChanges(
      data,
      "r",
      personalRange("2026-01-05", "2026-01-08", "leave", "2"),
    ),
  );
  applyChanges(
    data,
    owner,
    preparePersonalRangeChanges(
      data,
      "r",
      personalRange("2026-01-06", "2026-01-07", "training", "1"),
    ),
  );
  const group = personalCalendarRanges(
    "r",
    data.personCalendar,
    data.workCalendar,
  ).find((g) => g.entry.type === "leave");
  const draft = startPersonalRangeDraft(data, "r", group);
  assert.throws(
    () =>
      preparePersonalRangeSave(
        data,
        "r",
        personalRange("2026-01-05", "2026-01-06", "leave", "1"),
      ),
    /çakışıyor/,
  );
  const shifted = preparePersonalRangeSave(
    data,
    "r",
    personalRange("2026-01-06", "2026-01-09", "leave", "3"),
    draft,
  );
  applyChanges(data, owner, shifted);
  assert.equal(data.personCalendar["r|2026-01-05|leave"], undefined);
  assert.equal(data.personCalendar["r|2026-01-06|training"].hours, 1);
  assert.equal(data.personCalendar["r|2026-01-08|leave"].hours, 3);
  const refreshed = preparePersonalRangeSave(
    data,
    "r",
    personalRange("2026-01-05", "2026-01-08", "leave", "4"),
    draft,
  );
  assert.equal(
    refreshed.find((c) => c.id === "r|2026-01-06|leave").revision,
    1,
  );
  assert.throws(
    () => applyChanges(structuredClone(data), owner, refreshed),
    (error) => error.status === 409,
  );
  const leave = personalCalendarRanges(
    "r",
    data.personCalendar,
    data.workCalendar,
  ).find((g) => g.entry.type === "leave");
  applyChanges(data, owner, preparePersonalRangeRemoval(data, "r", leave));
  assert.deepEqual(Object.keys(data.personCalendar), ["r|2026-01-06|training"]);
  assert.throws(
    () => preparePersonalRangeRemoval(data, "other", leave),
    /kaydı bulunamadı/,
  );
});

test("shared ranges keep inclusive bounds across years; edit/delete preserve unrelated dates and opening revision", () => {
  let draft = editCalendarRange(
    startCalendarDraft(fixture()),
    range("2026-12-31", "2027-01-02"),
  );
  let groups = sharedCalendarRanges(draft.calendar);
  const original = groups.find((g) => g.from === "2026-12-31");
  assert.equal(original.keys.length, 3);
  assert.equal(original.to, "2027-01-02");
  draft = editCalendarRange(
    draft,
    { ...range("2026-12-30", "2027-01-01"), label: "Changed" },
    original,
  );
  assert.equal(draft.calendar["2027-01-02"], undefined);
  assert.equal(draft.calendar["2026-12-30"].label, "Changed");
  assert.equal(draft.revision, 3);
  assert.deepEqual(draft.calendar["2026-01-01"], day);
  assert.throws(
    () => editCalendarRange(draft, range("2026-01-01")),
    /çakışıyor/,
  );
  groups = sharedCalendarRanges(draft.calendar);
  draft = removeCalendarRange(
    draft,
    groups.find((g) => g.from === "2026-12-30"),
  );
  assert.deepEqual(draft.calendar, { "2026-01-01": day });
});

test("server rejects forged range bounds, excessive nominal hours and range dates outside supported limits", () => {
  for (const metadata of [
    { from: "2026-01-06", to: "2026-01-08", hours: 9 },
    { from: "2026-01-04", to: "2026-01-05", hours: 9 },
    { from: "2026-01-05", to: "2026-01-08", hours: 1 },
    { from: "2026-01-05", to: "2027-01-09", hours: 9 },
    { from: "1999-01-01", to: "2026-01-08", hours: 9 },
  ]) {
    const command = preparePersonalDayChange(fixture(), "r", {
      date: "2026-01-05",
      type: "leave",
      hours: "2",
      label: "",
    });
    command.value.range = metadata;
    assert.throws(() => applyChanges(fixture(), owner, [command]));
    const data = fixture();
    data.personCalendar[command.id] = command.value;
    assert.throws(() => validate(data));
  }
  const invalid = {
    "2026-01-05": { ...day, range: { from: "2026-01-06", to: "2026-01-07" } },
  };
  assert.throws(() =>
    applyChanges(fixture(), admin, [
      { kind: "calendar", id: "shared", value: invalid, revision: 3 },
    ]),
  );
  assert.throws(() => validate({ ...fixture(), workCalendar: invalid }));
});

test("absence range reports show one row and filter hours by month and historical team without truncating edit targets", () => {
  const data = fixture();
  data.teams.push({
    id: "t2",
    name: "İkinci Takım",
    lead: "B",
    excelCapacity: 0,
  });
  data.leaders.push("B");
  data.resources[0].versions.push({
    ...data.resources[0].versions[0],
    effective: "2026-02",
    team: "t2",
    lead: "B",
  });
  applyChanges(
    data,
    owner,
    preparePersonalRangeChanges(
      data,
      "r",
      personalRange("2026-01-29", "2026-02-03", "leave", "4"),
    ),
  );
  applyChanges(
    data,
    owner,
    preparePersonalRangeChanges(
      data,
      "r",
      personalRange("2026-01-29", "2026-02-03", "training", "2"),
    ),
  );
  data.workCalendar["2026-01-30"] = { ...day, fraction: 0.5 };
  let rows = absenceRangeRows(data, ["t", "t2"], ["2026-01", "2026-02"]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.range.entry.type === "leave").hours, 12);
  assert.equal(
    rows.find((row) => row.range.entry.type === "training").hours,
    4.5,
  );
  assert.deepEqual(rows[0].teamNames, ["Takım", "İkinci Takım"]);
  rows = absenceRangeRows(data, ["t"], ["2026-01", "2026-02"]);
  const training = rows.find((row) => row.range.entry.type === "training");
  assert.equal(training.hours, 2.5);
  assert.equal(training.days, 2);
  assert.equal(training.partial, true);
  assert.equal(training.range.keys.length, 3);
  assert.equal(training.range.to, "2026-02-03");
  assert.deepEqual(training.teamNames, ["Takım"]);
  assert.equal(absenceRangeRows(data, ["t2"], ["2026-01"]).length, 0);
  assert.equal(
    absenceRangeRows(data, ["t2"], ["2026-02"]).find(
      (row) => row.range.entry.type === "training",
    ).hours,
    2,
  );
});

test("manager calendar scope hides peer daily records and revisions; owners retain the full range", () => {
  const data = fixture();
  data.teams.push({ id: "t2", name: "Other", lead: "B", excelCapacity: 0 });
  data.leaders.push("B");
  data.resources[0].versions.push({
    ...data.resources[0].versions[0],
    effective: "2026-02",
    team: "t2",
    lead: "B",
  });
  applyChanges(
    data,
    owner,
    preparePersonalRangeChanges(
      data,
      "r",
      personalRange("2026-01-29", "2026-02-03"),
    ),
  );
  const before = structuredClone(data);
  const scoped = scopeData(data, {
    id: "m",
    role: "manager",
    leaders: ["A"],
    active: true,
    name: "Synthetic",
    username: "synthetic",
  });
  assert.deepEqual(scoped.personCalendar, {});
  assert(
    !Object.keys(scoped.revisions).some((key) => key.startsWith("personDay:")),
  );
  const own = scopeData(data, { ...owner, id: owner._id });
  assert.equal(Object.keys(own.personCalendar).length, 3);
  assert(
    Object.values(own.personCalendar).every(
      (entry) => entry.range.to === "2026-02-03",
    ),
  );
  assert.deepEqual(data, before);
});

test("range leave recalculates project percent without changing project hours; range training uses working capacity", () => {
  const data = fixture();
  data.projects.push({
    id: "p",
    name: "Synthetic project",
    start: "2026-01",
    end: "2026-12",
    phases: {},
  });
  const key = "r|p|2026-01";
  applyChanges(data, admin, [
    {
      kind: "actual",
      id: key,
      value: { unit: "percent", value: 10 },
      revision: 0,
    },
  ]);
  const allocation = data.actualAllocations[key];
  const beforeHours = personHoursInMonth("2026-01", "r", data.workCalendar);
  applyChanges(
    data,
    owner,
    preparePersonalRangeChanges(
      data,
      "r",
      personalRange("2026-01-05", "2026-01-07"),
    ),
  );
  assert.equal(data.actualAllocations[key], allocation);
  assert.equal(
    data.actualPercentEntries[key],
    ((allocation * DEFAULT_MONTHLY_HOURS) / (beforeHours - 18)) * 100,
  );
  applyChanges(
    data,
    owner,
    preparePersonalRangeChanges(
      data,
      "r",
      personalRange("2026-01-08", "2026-01-10", "training", "2"),
    ),
  );
  const totals = personCalendarHoursInMonth(
    "2026-01",
    "r",
    data.workCalendar,
    data.personCalendar,
  );
  assert.equal(totals.trainingHours, 4);
  assert.equal(
    personHoursInMonth("2026-01", "r", data.workCalendar, data.personCalendar),
    beforeHours - 18,
  );
  assert.equal(data.actualAllocations[key], allocation);
});
