import test from "node:test";
import assert from "node:assert/strict";
import {
  validPlanningMonth,
  validPlanningDate,
  clampFilterStart,
  MAX_FILTER_START,
  PLANNING_PERIODS,
} from "../shared/planning-dates.ts";
import { monthsFrom } from "../shared/model.ts";
test("planning date limits preserve valid historical dates and reject invalid dates", () => {
  for (const value of ["2000-01-01", "2020-02-29", "2199-12-31"])
    assert(validPlanningDate(value));
  for (const value of [
    "1999-12-31",
    "2200-01-01",
    "2026-02-29",
    "2026-04-31",
    "2026-00-01",
    "2026-01-00",
    "2026-1-1",
  ])
    assert(!validPlanningDate(value), value);
  assert(validPlanningMonth("2000-01"));
  assert(validPlanningMonth("2199-12"));
  assert(!validPlanningMonth("2200-01"));
  assert(!validPlanningMonth("2026-13"));
});
test("the longest visible window cannot exceed the domain date limit, including URL filters", () => {
  assert.equal(clampFilterStart("2199-12"), MAX_FILTER_START);
  assert.equal(clampFilterStart("1999-12"), "2000-01");
  assert.equal(clampFilterStart("2020-03"), "2020-03");
  assert.equal(
    monthsFrom(MAX_FILTER_START, Math.max(...PLANNING_PERIODS)).at(-1),
    "2199-12",
  );
});
