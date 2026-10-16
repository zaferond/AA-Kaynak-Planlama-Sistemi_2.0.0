import test from "node:test";
import assert from "node:assert/strict";
import { personMonthBalance } from "../frontend/src/features/actual-allocation/person-month-balance.ts";

const month = (effectiveHours, totalFte) => ({
  effectiveHours,
  totalFte,
  capacityFte: effectiveHours / 180,
});

test("remaining share and hours of a person-month", () => {
  const open = personMonthBalance(month(180, 0.4));
  assert.equal(open.state, "open");
  assert(Math.abs(open.percent - 40) < 1e-9);
  assert(Math.abs(open.remainingPercent - 60) < 1e-9);
  assert(Math.abs(open.remainingHours - 108) < 1e-9);

  // Fewer working hours (leave): the same entry uses a larger share.
  const leave = personMonthBalance(month(90, 0.4));
  assert(Math.abs(leave.percent - 80) < 1e-9);
  assert(Math.abs(leave.remainingPercent - 20) < 1e-9);
});

test("complete, over and no-capacity months", () => {
  assert.equal(personMonthBalance(month(180, 1)).state, "done");
  // Floating point noise below the tolerance still counts as complete.
  assert.equal(personMonthBalance(month(180, 1 - 1e-12)).state, "done");
  const over = personMonthBalance(month(90, 0.6));
  assert.equal(over.state, "over");
  assert(over.remainingHours < 0);
  assert.equal(personMonthBalance(month(0, 0)).state, "none");
});
