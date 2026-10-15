import test from "node:test";
import assert from "node:assert/strict";
import {
  copyPhaseCells,
  preparePhaseCellsPaste,
  phaseCellKey,
} from "../frontend/src/features/project-clipboard.ts";
import { applyChanges } from "../backend/operations.mjs";
import { validate } from "../shared/server-domain.ts";
const months = Array.from(
  { length: 12 },
  (_, i) => `2026-${String(i + 1).padStart(2, "0")}`,
);
const rows = ["p", "q"];
const fixture = () => ({
  teams: [{ id: "t", name: "Team", lead: "L", excelCapacity: 0 }],
  leaders: ["L"],
  resources: [],
  allocations: {},
  revisions: { "project:p": 3, "project:q": 7 },
  projects: rows.map((id) => ({
    id,
    name: id,
    start: months[0],
    end: months[11],
    phases: {
      [months[2]]: "Analiz",
      [months[3]]: "Tasarım",
      [months[4]]: "Test",
      [months[5]]: "Eski",
    },
    phaseColors: {
      [months[2]]: "green",
      [months[3]]: "amber",
      [months[4]]: "red",
      [months[5]]: "purple",
    },
    milestones: [
      { id: "m", name: "Topic", start: "2026-01-01", end: "2026-01-01" },
    ],
  })),
});
const selection = (id, start, end) =>
  months.slice(start, end).map((month) => phaseCellKey(id, month));
for (const kind of ["text", "color", "bundle"])
  test(`March–May paste to June–August (${kind}) preserves other fields and source`, () => {
    const data = fixture(),
      before = structuredClone(data),
      source = selection("p", 2, 5),
      clip = copyPhaseCells(data, rows, months, source);
    const changes = preparePhaseCellsPaste(
      data,
      rows,
      months,
      "p|2026-06",
      ["p|2026-06"],
      clip,
      kind,
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].revision, 3);
    const p = changes[0].value;
    for (let i = 0; i < 3; i++) {
      const from = months[i + 2],
        to = months[i + 5];
      if (kind !== "color")
        assert.equal(p.phases[to], data.projects[0].phases[from]);
      if (kind !== "text")
        assert.equal(p.phaseColors[to], data.projects[0].phaseColors[from]);
    }
    if (kind === "text")
      assert.deepEqual(p.phaseColors, data.projects[0].phaseColors);
    if (kind === "color") assert.deepEqual(p.phases, data.projects[0].phases);
    assert.deepEqual(p.milestones, data.projects[0].milestones);
    assert.deepEqual(data, before);
    applyChanges(
      data,
      { _id: "admin", role: "admin", leaders: ["L"] },
      changes,
    );
    validate(data);
  });
test("cell paste groups commands by project with independent revisions", () => {
  const data = fixture();
  const source = [...selection("p", 2, 5), ...selection("q", 2, 5)];
  const clip = copyPhaseCells(data, rows, months, source.reverse());
  const changes = preparePhaseCellsPaste(
    data,
    rows,
    months,
    "p|2026-06",
    ["p|2026-06"],
    clip,
    "bundle",
  );
  assert.deepEqual(
    changes.map((c) => [c.id, c.revision]),
    [
      ["p", 3],
      ["q", 7],
    ],
  );
  assert.equal(changes[1].value.phases["2026-08"], "Test");
});
test("one copied color fills selected cells without changing their texts", () => {
  const data = fixture(),
    clip = copyPhaseCells(data, rows, months, ["p|2026-03"]);
  const selected = ["p|2026-06", "p|2026-08"];
  const [change] = preparePhaseCellsPaste(
    data,
    rows,
    months,
    selected[0],
    selected,
    clip,
    "color",
  );
  assert.equal(change.value.phaseColors["2026-06"], "green");
  assert.equal(change.value.phaseColors["2026-08"], "green");
  assert.deepEqual(change.value.phases, data.projects[0].phases);
});
test("holes, invisible cells, and project/table overflow reject without partial changes", () => {
  const data = fixture(),
    before = structuredClone(data);
  assert.throws(
    () => copyPhaseCells(data, rows, months, ["p|2026-03", "p|2026-05"]),
    /dikdörtgen/,
  );
  assert.throws(
    () => copyPhaseCells(data, rows, months, ["missing|2026-03"]),
    /görünen/,
  );
  const clip = copyPhaseCells(data, rows, months, selection("p", 2, 5));
  assert.throws(
    () =>
      preparePhaseCellsPaste(
        data,
        rows,
        months,
        "p|2026-11",
        ["p|2026-11"],
        clip,
        "bundle",
      ),
    /dışına/,
  );
  data.projects[0].end = "2026-07";
  assert.throws(
    () =>
      preparePhaseCellsPaste(
        data,
        rows,
        months,
        "p|2026-06",
        ["p|2026-06"],
        clip,
        "bundle",
      ),
    /proje dönemi/,
  );
  data.projects[0].end = before.projects[0].end;
  assert.deepEqual(data, before);
});
test("text-only paste preserves absent explicit color map", () => {
  const data = fixture();
  delete data.projects[1].phaseColors;
  const clip = copyPhaseCells(data, rows, months, selection("p", 2, 5));
  const [c] = preparePhaseCellsPaste(
    data,
    rows,
    months,
    "q|2026-06",
    ["q|2026-06"],
    clip,
    "text",
  );
  assert.equal(c.value.phaseColors, undefined);
});
