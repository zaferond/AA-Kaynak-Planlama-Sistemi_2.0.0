import { orderedLeaderships } from "../shared/leadership-hierarchy.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { directoryTree } from "../shared/directory-tree.ts";
const data = {
  leaders: ["Root", "Other", "Child", "Grandchild"],
  leaderParents: { Child: "Root", Grandchild: "Child" },
  teams: [
    { id: "a", name: "Root Team", lead: "Root" },
    { id: "b", name: "Child Team", lead: "Child" },
    { id: "c", name: "Deep Team", lead: "Grandchild" },
    { id: "unit", name: "Direct", lead: "Root", kind: "leadership" },
  ],
  resources: [],
};
test("directory tree: children follow parent with depth, real teams stay with owning leader", () => {
  const rows = directoryTree(data);
  assert.deepEqual(
    rows.map((r) => [r.lead, r.parent, r.depth, r.teams.map((t) => t.id)]),
    [
      ["Root", "", 0, ["a"]],
      ["Child", "Root", 1, ["b"]],
      ["Grandchild", "Child", 2, ["c"]],
      ["Other", "", 0, []],
    ],
  );
});
test("directory tree: matching descendant preserves the ancestor path and excludes unrelated teams", () => {
  const rows = directoryTree(data, "Deep Team");
  assert.deepEqual(
    rows.map((r) => [r.lead, r.teams.length]),
    [
      ["Root", 0],
      ["Child", 0],
      ["Grandchild", 1],
    ],
  );
  assert.deepEqual(directoryTree(data, "missing"), []);
});
test("directory tree: cycle fallback and missing parents never duplicate or hide leaders", () => {
  const rows = directoryTree({
    ...data,
    leaderParents: { Root: "Child", Child: "Root", Grandchild: "Missing" },
  });
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map((r) => r.lead)).size, 4);
});

test("leadership options: descendants follow parents, scoped catalogs never add missing parents and cycles remain finite", () => {
  const before = structuredClone(data);
  assert.deepEqual(
    orderedLeaderships(data).map(({ id, parentId, depth }) => [
      id,
      parentId,
      depth,
    ]),
    [
      ["Root", "", 0],
      ["Child", "Root", 1],
      ["Grandchild", "Child", 2],
      ["Other", "", 0],
    ],
  );
  assert.deepEqual(orderedLeaderships({ ...data, leaders: ["Grandchild"] }), [
    { id: "Grandchild", name: "Grandchild", parentId: "", depth: 0 },
  ]);
  const cycle = orderedLeaderships({
    ...data,
    leaderParents: { Root: "Child", Child: "Root", Grandchild: "Missing" },
  });
  assert.equal(cycle.length, data.leaders.length);
  assert.equal(new Set(cycle.map((row) => row.id)).size, data.leaders.length);
  assert.deepEqual(data, before);
});
