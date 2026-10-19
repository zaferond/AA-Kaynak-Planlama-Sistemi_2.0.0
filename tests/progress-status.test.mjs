import test from "node:test";
import assert from "node:assert/strict";
import {
  baselineStatus,
  entryStatus,
  entryIsEditable,
} from "../frontend/src/features/project-progress/progress-status.ts";

const approved = {
  baselines: [{ openingMonth: "2026-08" }],
  actuals: {},
};

test("unapproved plans require approval regardless of draft or pending status", () => {
  for (const record of [
    undefined,
    { baselines: [], actuals: {} },
    ...["draft", "pending"].map((status) => ({
      baselines: [],
      actuals: {},
      proposal: { status },
    })),
  ]) {
    assert.equal(entryStatus(record, "2026-09", "2026-10"), "needsPlan");
  }
  assert.equal(baselineStatus(undefined), "new");
  assert.equal(baselineStatus(approved), "approved");
});

test("months before tracking, future months and an absent month are never recorded entries", () => {
  for (const month of ["", "2026-07", "2026-08", "2026-11"]) {
    const status = entryStatus(approved, month, "2026-10");
    assert.equal(status, "closed");
    assert.equal(entryIsEditable(status, false), false);
  }
});

test("current and past tracked months distinguish missing and saved entries", () => {
  assert.equal(entryStatus(approved, "2026-09", "2026-10"), "waiting");
  assert.equal(entryStatus(approved, "2026-10", "2026-10"), "waiting");
  const record = {
    ...approved,
    actuals: { "2026-09": { pct: 0, note: "Henüz tamamlanmadı" } },
  };
  assert.equal(entryStatus(record, "2026-09", "2026-10"), "entered");
});

test("month locking blocks changes to both missing and previously saved entries", () => {
  for (const status of ["waiting", "entered"]) {
    assert.equal(entryIsEditable(status, false), true);
    assert.equal(entryIsEditable(status, true), false);
  }
  for (const status of ["needsPlan", "closed"]) {
    assert.equal(entryIsEditable(status, false), false);
  }
});

test("a draft or pending revision preserves the approved plan's monthly entry status", () => {
  for (const status of ["draft", "pending"]) {
    const record = {
      ...approved,
      proposal: { status },
      actuals: { "2026-09": { pct: 45, note: "Kaydedildi" } },
    };
    assert.equal(baselineStatus(record), status);
    assert.equal(entryStatus(record, "2026-09", "2026-10"), "entered");
    assert.equal(entryStatus(record, "2026-10", "2026-10"), "waiting");
  }
});
