import test from "node:test";
import assert from "node:assert/strict";
import {
  rectangleKeys,
  mergePlanSelection,
  topLeftPlanCell,
  copyPlanCells,
  pastePlanCells,
} from "../frontend/src/plan-cell-grid.ts";

const rows = ["team-a|project-a", "team-b|project-a", "team-a|project-b"];
const months = ["2026-01", "2026-02", "2026-03"];
const key = (row, month) => rows[row] + "|" + months[month];

test("dragging in either direction selects a rectangular set of editable cells", () => {
  const editable = (value) => value !== key(1, 1);
  assert.deepEqual(
    rectangleKeys(rows, months, key(1, 2), key(0, 0), editable),
    [key(0, 0), key(0, 1), key(0, 2), key(1, 0), key(1, 2)],
  );
});

test("Ctrl selection adds another range without dropping the original cells or duplicating overlaps", () => {
  const first = rectangleKeys(rows, months, key(0, 0), key(0, 1), () => true);
  const second = rectangleKeys(rows, months, key(0, 1), key(1, 2), () => true);
  assert.deepEqual(mergePlanSelection(first, second, true), [
    key(0, 0),
    key(0, 1),
    key(0, 2),
    key(1, 1),
    key(1, 2),
  ]);
  assert.deepEqual(mergePlanSelection(first, second, false), second);
});

test("the active cell is the visible top-left selection regardless of drag or Ctrl selection order", () => {
  assert.equal(
    topLeftPlanCell(rows, months, [key(2, 2), key(1, 1), key(0, 2)]),
    key(0, 2),
  );
  assert.equal(
    topLeftPlanCell(rows, months, [key(2, 0), key(1, 2), key(1, 0)]),
    key(1, 0),
  );
  assert.equal(topLeftPlanCell(rows.slice(0, 1), months, [key(2, 2)]), null);
});

test("copy keeps zero values and paste preserves row and month offsets", () => {
  const selected = [key(0, 0), key(0, 1), key(1, 0), key(1, 1)];
  const copied = copyPlanCells(rows, months, selected, {
    [key(0, 0)]: 0.5,
    [key(1, 1)]: 2,
  });
  assert.deepEqual(copied.values, [
    [0.5, 0],
    [0, 2],
  ]);
  assert.deepEqual(
    pastePlanCells(rows, months, key(1, 1), [], copied, () => true),
    [
      { key: key(1, 1), value: 0.5 },
      { key: key(1, 2), value: 0 },
      { key: key(2, 1), value: 0 },
      { key: key(2, 2), value: 2 },
    ],
  );
});

test("single copied value fills a selected destination range", () => {
  const copied = copyPlanCells(rows, months, [key(0, 0)], {
    [key(0, 0)]: 1.25,
  });
  assert.deepEqual(
    pastePlanCells(
      rows,
      months,
      key(1, 1),
      [key(1, 1), key(1, 2)],
      copied,
      () => true,
    ),
    [
      { key: key(1, 1), value: 1.25 },
      { key: key(1, 2), value: 1.25 },
    ],
  );
});

test("a matching destination block pastes from its top-left even when right-clicked inside", () => {
  const copied = copyPlanCells(rows, months, [key(0, 0), key(0, 1)], {
    [key(0, 0)]: 3,
    [key(0, 1)]: 4,
  });
  assert.deepEqual(
    pastePlanCells(
      rows,
      months,
      key(1, 2),
      [key(1, 1), key(1, 2)],
      copied,
      () => true,
    ),
    [
      { key: key(1, 1), value: 3 },
      { key: key(1, 2), value: 4 },
    ],
  );
});

test("paste rejects a blocked target and an overflowing copied range before writing", () => {
  const copied = copyPlanCells(rows, months, [key(0, 0), key(0, 1)], {});
  assert.throws(
    () =>
      pastePlanCells(
        rows,
        months,
        key(1, 1),
        [],
        copied,
        (value) => value !== key(1, 2),
      ),
    /proje dönemi dışında/,
  );
  assert.throws(
    () => pastePlanCells(rows, months, key(2, 2), [], copied, () => true),
    /tablonun dışına/,
  );
  assert.throws(
    () => copyPlanCells(rows, months, [key(0, 0), key(0, 2)], {}),
    /kesintisiz dikdörtgen/,
  );
  assert.throws(
    () => copyPlanCells(rows.slice(0, 1), months, [key(0, 0), key(1, 0)], {}),
    /aynı sayfada/,
  );
});
