import test from "node:test";
import assert from "node:assert/strict";
import {
  PERSONAL_DAYS_PER_REQUEST,
  PERSONAL_DAYS_PER_YEAR,
  validateSnapshotCalendarKeys,
  validateSnapshotPersonalCalendar,
} from "../shared/snapshot-calendar-validation.ts";
import { stageChanges } from "../backend/operations.mjs";

const DAY = 86400000;
const day = (year, index) =>
  new Date(Date.UTC(year, 0, 1) + index * DAY).toISOString().slice(0, 10);
const entry = { type: "leave", hours: 4, label: "" };
// Leave and training on the same day count as two records.
function calendar(resourceId, year, count) {
  const out = {};
  for (let i = 0; Object.keys(out).length < count; i++) {
    const date = day(year, Math.floor(i / 2));
    const type = i % 2 ? "training" : "leave";
    out[`${resourceId}|${date}|${type}`] = { ...entry, type };
  }
  return out;
}
const people = new Map([
  ["a", { id: "a", name: "Ayşe" }],
  ["b", { id: "b", name: "Bora" }],
]);

test("each person may hold PERSONAL_DAYS_PER_YEAR records per calendar year", () => {
  const full = {
    ...calendar("a", 2026, PERSONAL_DAYS_PER_YEAR),
    ...calendar("a", 2027, PERSONAL_DAYS_PER_YEAR),
    ...calendar("b", 2026, PERSONAL_DAYS_PER_YEAR),
  };
  // The old company-wide count is gone: totals above it are fine.
  validateSnapshotCalendarKeys({ personCalendar: full });
  validateSnapshotPersonalCalendar({ personCalendar: full }, people);
  const over = { ...full, ...calendar("a", 2026, PERSONAL_DAYS_PER_YEAR + 1) };
  assert.throws(
    () => validateSnapshotPersonalCalendar({ personCalendar: over }, people),
    /Ayşe: 2026 yılında en fazla 400/,
  );
});

test("one request may add or edit at most PERSONAL_DAYS_PER_REQUEST days; deletions are not counted", () => {
  const admin = { _id: "root", role: "admin" };
  const change = (i, operation) => ({
    kind: "personDay",
    id: `a|${day(2026, i)}|leave`,
    value: operation ? null : entry,
    revision: 0,
    ...(operation ? { operation } : {}),
  });
  const adds = Array.from({ length: PERSONAL_DAYS_PER_REQUEST + 1 }, (_, i) =>
    change(i),
  );
  assert.throws(
    () => stageChanges({ revisions: {} }, admin, adds),
    (e) => e.status === 413,
  );
  // Over the cap only through deletions: the limit check lets it through
  // (staging may still fail later for unrelated reasons of this bare draft).
  const moves = [
    ...Array.from({ length: 300 }, (_, i) => change(i, "delete")),
    ...Array.from({ length: 300 }, (_, i) => change(300 + i)),
  ];
  assert.throws(
    () => stageChanges({ revisions: {} }, admin, moves),
    (e) => e.status !== 413,
  );
});
