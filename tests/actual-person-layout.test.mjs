import test from "node:test";
import assert from "node:assert/strict";
import {
  addableProjects,
  personGroups,
} from "../frontend/src/features/actual-allocation/person-layout.ts";

const person = (id, name) => ({ id, name, note: "", versions: [] });
const project = (id) => ({ id, name: id, start: "2026-01", end: "2026-12" });
const people = [person("a", "Ahmet Coşkun"), person("b", "Bora Kaya")];
const projects = [project("p1"), project("p2"), project("p3")];
const base = {
  people,
  projects,
  months: ["2026-01", "2026-02"],
  actualAllocations: { "a|p2|2026-02": 0.5, "a|p3|2026-05": 0.25 },
  added: new Set(),
  query: "",
  onlyDataRows: false,
};

test("each person lists only projects with entries in the visible months", () => {
  const groups = personGroups(base);
  assert.deepEqual(
    groups.map((g) => [g.person.id, g.projects.map((p) => p.id), g.hasData]),
    [
      ["a", ["p2"], true],
      ["b", [], false],
    ],
  );
  assert.deepEqual(
    addableProjects(groups[0], projects).map((p) => p.id),
    ["p1", "p3"],
  );
});

test("added rows, search and the data-only switch", () => {
  const added = personGroups({ ...base, added: new Set(["b|p1", "a|p1"]) });
  // Report order is kept; an added project joins without data.
  assert.deepEqual(
    added.map((g) => g.projects.map((p) => p.id)),
    [["p1", "p2"], ["p1"]],
  );
  assert.equal(added[1].hasData, false);
  assert.deepEqual(
    personGroups({ ...base, query: "  AHMET " }).map((g) => g.person.id),
    ["a"],
  );
  assert.deepEqual(
    personGroups({ ...base, query: "coş" }).map((g) => g.person.id),
    ["a"],
  );
  assert.deepEqual(
    personGroups({ ...base, onlyDataRows: true }).map((g) => g.person.id),
    ["a"],
  );
});
