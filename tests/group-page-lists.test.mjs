import test from "node:test";
import assert from "node:assert/strict";
import { groupPage, groupPageLists } from "../shared/metrics.ts";

const range = (n) => Array.from({ length: n }, (_, i) => i);

test("groupPageLists matches groupPage for full rectangular lists", () => {
  for (const [outer, inner, size] of [
    [3, 4, 5],
    [5, 7, 10],
    [1, 1, 20],
    [4, 3, 12],
  ]) {
    const lists = Array.from({ length: outer }, () => range(inner));
    const pages = Math.ceil((outer * inner) / size);
    for (let page = 0; page < pages; page++) {
      const result = groupPageLists(lists, page, size);
      assert.equal(result.total, outer * inner);
      assert.deepEqual(result.groups, groupPage(outer, inner, page, size));
    }
  }
});

test("groupPageLists skips empty groups and keeps original indexes", () => {
  const lists = [[0, 2], [], [1], [0, 1, 2]];
  assert.equal(groupPageLists(lists, 0, 10).total, 6);
  assert.deepEqual(groupPageLists(lists, 0, 10).groups, [
    { outer: 0, inners: [0, 2] },
    { outer: 2, inners: [1] },
    { outer: 3, inners: [0, 1, 2] },
  ]);
  assert.deepEqual(groupPageLists(lists, 0, 2).groups, [
    { outer: 0, inners: [0, 2] },
  ]);
  assert.deepEqual(groupPageLists(lists, 1, 2).groups, [
    { outer: 2, inners: [1] },
    { outer: 3, inners: [0] },
  ]);
  assert.deepEqual(groupPageLists(lists, 2, 2).groups, [
    { outer: 3, inners: [1, 2] },
  ]);
  assert.deepEqual(groupPageLists([[], []], 0, 5), { groups: [], total: 0 });
});
