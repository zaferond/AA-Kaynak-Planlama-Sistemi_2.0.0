import test from "node:test";
import assert from "node:assert/strict";
import {
  excelCellText,
  splitExcelText,
  excelTextLines,
  assertExcelRowCount,
} from "../frontend/src/xlsx-cells.ts";

test("non-continuation Excel exports refuse impossible cell contents rather than produce a corrupt workbook", () => {
  assert.doesNotThrow(() => assertExcelRowCount(1048576));
  for (const count of [1048577, Infinity, NaN, 1.5, 0])
    assert.throws(() => assertExcelRowCount(count), /satır sınırı/);
  assert.equal(excelCellText("A".repeat(32767)).length, 32767);
  assert.throws(() => excelCellText("A".repeat(32768)), /Excel hücre sınırı/);
  assert.doesNotThrow(() => excelCellText("A\n".repeat(253)));
  assert.throws(() => excelCellText("A\n".repeat(254)), /Excel hücre sınırı/);
  assert.throws(() => excelCellText("A\r".repeat(254)), /Excel hücre sınırı/);
  assert.equal(excelCellText("=1<&\r\n"), "=1&lt;&amp;&#13;\n");
});

test("continuation rows retain text, Unicode and blank lines within Excel's visible row bounds", () => {
  for (const source of [
    "",
    "Short text",
    "😀".repeat(25000),
    "\n".repeat(1000),
    "\r".repeat(1000),
    "Start\n\nEnd".repeat(1000),
  ]) {
    const chunks = splitExcelText(source);
    assert.equal(chunks.join(""), source);
    for (const chunk of chunks) {
      assert(excelTextLines(chunk) * 15 + 12 <= 409);
      assert.doesNotThrow(() => excelCellText(chunk));
    }
  }
});
