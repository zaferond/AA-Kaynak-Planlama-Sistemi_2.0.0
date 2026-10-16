import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPLOYEE_COLUMNS,
  parseHiddenColumns,
  visibleEmployeeColumns,
} from "../frontend/src/features/access/employee-columns.ts";

test("stored hidden columns keep only known optional ids", () => {
  assert.deepEqual(parseHiddenColumns(null), []);
  assert.deepEqual(parseHiddenColumns("not json"), []);
  assert.deepEqual(parseHiddenColumns('{"email":true}'), []);
  // Fixed columns (Seç, Ad Soyad, İşlemler) can never be hidden.
  assert.deepEqual(
    parseHiddenColumns('["email","name","actions","email","unknown",3,"note"]'),
    ["email", "note"],
  );
});

test("visible columns keep table order and share 100% of the width", () => {
  const all = visibleEmployeeColumns([]);
  assert.equal(all.length, EMPLOYEE_COLUMNS.length);
  const hidden = visibleEmployeeColumns(["email", "note", "scope"]);
  assert.deepEqual(
    hidden.map((c) => c.id),
    EMPLOYEE_COLUMNS.map((c) => c.id).filter(
      (id) => !["email", "note", "scope"].includes(id),
    ),
  );
  for (const columns of [all, hidden])
    assert(
      Math.abs(columns.reduce((sum, c) => sum + c.percent, 0) - 100) < 1e-9,
    );
  // Hiding columns widens the remaining ones proportionally.
  const name = (cols) => cols.find((c) => c.id === "name").percent;
  assert(name(hidden) > name(all));
});
