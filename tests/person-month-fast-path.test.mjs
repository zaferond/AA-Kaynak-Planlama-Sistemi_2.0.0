import test from "node:test";
import assert from "node:assert/strict";
import { createPersonMonthHoursIndex } from "../shared/actual-units.ts";
import { createActualMonthIndex } from "../shared/actual-months.ts";
import { referencePersonMonthHours } from "./person-month-reference.mjs";

// Deterministic pseudo-random data; the indexed fast path must equal the
// frozen day-by-day reference exactly, not approximately.
let seed = 7;
const rand = () =>
  (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (items) => items[Math.floor(rand() * items.length)];

test("indexed person-month hours equal the day-by-day reference for random calendars", () => {
  const people = ["r1", "r2", "a|b", "r4", "r5"];
  const months = [
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-05",
    "2026-10",
    "2027-02",
  ];
  for (let round = 0; round < 40; round++) {
    const workCalendar = {};
    const personCalendar = {};
    const actualWorkedHours = {};
    for (let i = 0; i < 12; i++) {
      const month = pick(months);
      const day =
        month + "-" + String(1 + Math.floor(rand() * 28)).padStart(2, "0");
      workCalendar[day] = {
        type: "official",
        label: "Tatil",
        fraction: pick([1, 0.5]),
      };
    }
    for (let i = 0; i < 60; i++) {
      const person = pick(people);
      const month = pick(months);
      const dayNumber = 1 + Math.floor(rand() * 31); // includes invalid days such as 02-30
      const date = month + "-" + String(dayNumber).padStart(2, "0");
      const suffix = pick(["", "|leave", "|training"]);
      const type = suffix ? suffix.slice(1) : pick(["leave", "training"]);
      personCalendar[person + "|" + date + suffix] = {
        type,
        hours: pick([2, 4.5, 9, 12]),
        label: "x",
      };
    }
    for (const person of people)
      if (rand() < 0.3)
        actualWorkedHours[person + "|" + pick(months)] = pick([150, 190, 201]);
    const index = createPersonMonthHoursIndex({
      workCalendar,
      personCalendar,
      actualWorkedHours,
    });
    const monthIndex = createActualMonthIndex({
      workCalendar,
      personCalendar,
      actualWorkedHours,
      actualAllocations: {},
    });
    for (const person of [...people, "nobody"])
      for (const month of months) {
        const expected = referencePersonMonthHours(
          month,
          person,
          actualWorkedHours[person + "|" + month],
          workCalendar,
          personCalendar,
        );
        const actual = index.get(person, month);
        for (const field of Object.keys(expected))
          assert.equal(
            actual[field],
            expected[field],
            `${round} ${person} ${month} ${field}`,
          );
        assert.equal(
          monthIndex.get(person, month).effectiveHours,
          expected.effectiveHours,
        );
      }
  }
});
