import test from "node:test";
import assert from "node:assert/strict";
import {
  HOURS_PER_WORKDAY,
  DEFAULT_MONTHLY_HOURS,
  DEFAULT_MONTHLY_DAYS,
  workdaysInMonth,
  calendarHoursInMonth,
  personHoursInMonth,
  leaveHoursInMonth,
  trainingHoursInMonth,
  effectivePersonHoursInMonth,
  actualInputToFte,
  fteToActualInput,
} from "../frontend/src/actual-units.ts";

test("shared holidays and personal hourly absences reduce only available weekday hours", () => {
  const shared = {
    "2026-09-01": { type: "official", label: "Tatil", fraction: 1 },
    "2026-09-02": { type: "company", label: "Yarım gün", fraction: 0.5 },
    "2026-09-05": { type: "religious", label: "Hafta sonu", fraction: 1 },
  };
  const personal = {
    "a|2026-09-01": { type: "leave", hours: 9, label: "" },
    "a|2026-09-02": { type: "training", hours: 9, label: "" },
    "a|2026-09-03": { type: "leave", hours: 2.5, label: "" },
    "a|2026-09-05": { type: "training", hours: 9, label: "" },
  };
  assert.equal(calendarHoursInMonth("2026-09", shared), 184.5);
  assert.equal(personHoursInMonth("2026-09", "a", shared, personal), 182);
  assert.equal(leaveHoursInMonth("2026-09", "a", shared, personal), 2.5);
  assert.equal(trainingHoursInMonth("2026-09", "a", shared, personal), 4.5);
  assert.equal(
    effectivePersonHoursInMonth("2026-09", "a", 220, shared, personal),
    204,
  );
  assert.equal(personHoursInMonth("2026-09", "b", shared, personal), 184.5);
  assert.equal(calendarHoursInMonth("2028-02"), 189);
});

test("default monthly capacity is four 45-hour weeks", () => {
  assert.equal(HOURS_PER_WORKDAY, 9);
  assert.equal(DEFAULT_MONTHLY_DAYS, 20);
  assert.equal(DEFAULT_MONTHLY_HOURS, 180);
  assert.equal(workdaysInMonth("2026-09"), 22);
  assert.equal(workdaysInMonth("2026-02"), 20);
  assert.equal(workdaysInMonth("2028-02"), 21);
});

test("hours, days and percent use 180 hours as the planned person-month", () => {
  assert.equal(actualInputToFte(100, "percent", "2026-09"), 1);
  assert.equal(actualInputToFte(100, "percent", "2026-02"), 1);
  assert.equal(actualInputToFte(10, "days", "2026-09"), 0.5);
  assert.equal(actualInputToFte(90, "hours", "2026-09"), 0.5);
  assert.equal(actualInputToFte(50, "percent", "2026-09"), 0.5);
  assert.equal(fteToActualInput(0.5, "percent", "2026-09"), 50);
  assert.equal(fteToActualInput(0.5, "days", "2026-09"), 10);
  assert.equal(fteToActualInput(0.5, "hours", "2026-09"), 90);
  assert.equal(actualInputToFte(100, "percent", "2026-09", 200), 200 / 180);
  assert.equal(actualInputToFte(50, "percent", "2026-09", 200), 100 / 180);
  assert(
    Math.abs(fteToActualInput(100 / 180, "percent", "2026-09", 200) - 50) <
      1e-10,
  );
});

test("combined leave and training never double-count a shared half day", () => {
  const shared = {
    "2026-09-02": { type: "company", label: "Yarım gün", fraction: 0.5 },
  };
  const personal = {
    "a|2026-09-02": { type: "leave", hours: 2, label: "" },
    "a|2026-09-02|training": { type: "training", hours: 3, label: "" },
  };
  assert.equal(leaveHoursInMonth("2026-09", "a", shared, personal), 2);
  assert.equal(trainingHoursInMonth("2026-09", "a", shared, personal), 2.5);
  assert.equal(personHoursInMonth("2026-09", "a", shared, personal), 191.5);
});
