import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareTimelineChange,
  prepareMilestoneReorder,
  prepareMilestoneReportChange,
} from "../frontend/src/features/project-timeline-commands.ts";
import { milestoneRanges } from "../shared/milestone-ranges.ts";
import { applyChanges } from "../backend/operations.mjs";
import { validate } from "../shared/server-domain.ts";
import { captureProjectSnapshot } from "../frontend/src/features/project-snapshot.ts";
const snapshot = (data) =>
  captureProjectSnapshot(data.projects[0], data.revisions["project:p"] || 0);
const admin = { _id: "root-admin", role: "admin", leaders: [] };

test("topic ordering preserves dates, nested notes and project metadata with revision and access checks", () => {
  const data = fixture(),
    original = structuredClone(data);
  const ids = data.projects[0].milestones.map((m) => m.id);
  const command = prepareMilestoneReorder(
    data,
    "p",
    ids[1],
    ids[0],
    false,
    ids,
  );
  assert.deepEqual(
    command.value.milestones.map((m) => m.id),
    [...ids].reverse(),
  );
  assert.deepEqual(data, original);
  assert.deepEqual(
    command.value.milestones[1],
    original.projects[0].milestones[0],
  );
  assert.equal(command.revision, 3);
  assert.throws(
    () =>
      applyChanges(
        structuredClone(data),
        { role: "normal", _id: "n", leaders: [] },
        [command],
      ),
    (e) => e.status === 403,
  );
  applyChanges(data, admin, [command]);
  assert.deepEqual(
    validate(data).projects[0].milestones,
    command.value.milestones,
  );
  assert.throws(
    () => applyChanges(data, admin, [command]),
    (e) => e.status === 409,
  );
  assert.throws(
    () => prepareMilestoneReorder(data, "p", ids[0], ids[1], false, ids),
    /sıralaması değişmiş/,
  );
  assert.throws(
    () =>
      prepareMilestoneReorder(
        data,
        "p",
        "missing",
        ids[0],
        false,
        [...ids].reverse(),
      ),
    /bulunamadı/,
  );
});

test("report menu changes only the chosen bullet flag and retains dates, colors, completion, order and revision checks", () => {
  const data = fixture();
  const project = data.projects[0];
  project.milestones[0].barNotes.push({
    text: "Second bullet",
    includeInReport: false,
  });
  project.milestones[0].additionalRanges = [
    {
      displayKind: "milestone",
      diamondStyle: "outline",
      color: "green",
      start: "2026-10-15",
      end: "2026-10-15",
      notes: [
        { text: "Point inside bar", completed: true, includeInReport: true },
      ],
    },
  ];
  const snapshot = structuredClone(project);
  for (const [rangeIndex, noteIndex, included] of [
    [0, 1, true],
    [1, 0, false],
  ]) {
    const command = prepareMilestoneReportChange(
      snapshot,
      3,
      "m",
      rangeIndex,
      noteIndex,
      included,
    );
    const expected = structuredClone(snapshot);
    const notes =
      rangeIndex === 0
        ? expected.milestones[0].barNotes
        : expected.milestones[0].additionalRanges[rangeIndex - 1].notes;
    notes[noteIndex].includeInReport = included;
    assert.deepEqual(command.value, expected);
    assert.deepEqual(project, snapshot);
    assert.equal(command.revision, 3);
    assert.throws(
      () =>
        applyChanges(
          structuredClone(data),
          { _id: "n", role: "normal", leaders: [] },
          [command],
        ),
      (e) => e.status === 403,
    );
    const next = structuredClone(data);
    applyChanges(next, admin, [command]);
    validate(next);
    assert.throws(
      () => applyChanges(next, admin, [command]),
      (e) => e.status === 409,
    );
  }
});

test("report menu supports legacy descriptions and rejects absent or invalid targets without mutation", () => {
  const project = fixture().projects[0];
  const milestone = project.milestones[0];
  delete milestone.barNotes;
  milestone.barText = "Legacy note";
  milestone.additionalRanges = [
    { start: "2026-11-01", end: "2026-11-02", description: "Legacy extra" },
  ];
  for (const index of [0, 1]) {
    const command = prepareMilestoneReportChange(
      project,
      3,
      "m",
      index,
      0,
      true,
    );
    assert.equal(
      milestoneRanges(command.value.milestones[0])[index].notes[0]
        .includeInReport,
      true,
    );
    assert.equal(
      milestoneRanges(project.milestones[0])[index].notes[0].includeInReport,
      false,
    );
  }
  for (const [id, range, note] of [
    ["missing", 0, 0],
    ["m", -1, 0],
    ["m", 0, -1],
    ["m", 9, 0],
    ["m", 0, 1],
    ["m", 0.5, 0],
  ])
    assert.throws(
      () => prepareMilestoneReportChange(project, 3, id, range, note, true),
      /bulunamadı/,
    );
});

test("topic moves support both insertion sides and skip no-op saves", () => {
  const data = fixture();
  const first = data.projects[0].milestones[0];
  data.projects[0].milestones.push({ ...structuredClone(first), id: "third" });
  const ids = data.projects[0].milestones.map((m) => m.id);
  assert.equal(
    prepareMilestoneReorder(data, "p", ids[0], ids[0], true, ids),
    null,
  );
  assert.equal(
    prepareMilestoneReorder(data, "p", ids[0], ids[1], false, ids),
    null,
  );
  assert.deepEqual(
    prepareMilestoneReorder(
      data,
      "p",
      ids[0],
      ids[2],
      true,
      ids,
    ).value.milestones.map((m) => m.id),
    [ids[1], ids[2], ids[0]],
  );
  assert.deepEqual(
    prepareMilestoneReorder(
      data,
      "p",
      ids[2],
      ids[0],
      false,
      ids,
    ).value.milestones.map((m) => m.id),
    [ids[2], ids[0], ids[1]],
  );
});
const fixture = () => ({
  teams: [{ id: "t", name: "Takım", lead: "L", excelCapacity: 0 }],
  resources: [],
  leaders: ["L"],
  allocations: {},
  revisions: { "project:p": 3 },
  projects: [
    {
      id: "p",
      name: "Proje",
      responsibleName: "Güncel sorumlu",
      phases: { "2026-10": "Güncel aşama" },
      start: "2026-01",
      end: "2026-12",
      milestones: [
        {
          id: "m",
          name: "Kritik konu",
          start: "2026-10-10",
          end: "2026-10-20",
          barStyle: "outline",
          barColor: "blue",
          hasCriticalTopics: true,
          barNotes: [
            {
              text: "Detay",
              start: "2026-10-12",
              end: "2026-10-18",
              completed: true,
              includeInReport: true,
            },
          ],
        },
        {
          id: "other",
          name: "Diğer konu",
          start: "2026-12-01",
          end: "2026-12-03",
          hasCriticalTopics: true,
          barNotes: [{ text: "Diğer detay", includeInReport: false }],
        },
      ],
    },
  ],
});
function save(data, adjustment) {
  const before = structuredClone(data);
  const command = prepareTimelineChange(snapshot(data), "m", adjustment);
  assert.deepEqual(data, before, "command preparation must not mutate source");
  applyChanges(data, admin, [command]);
  validate(data);
  return { command, range: milestoneRanges(data.projects[0].milestones[0])[0] };
}

test("moving a bar shifts its notes and preserves project fields, flags and other topics", () => {
  const data = fixture();
  const other = structuredClone(data.projects[0].milestones[1]);
  const { command, range } = save(data, {
    target: "range",
    rangeIndex: 0,
    mode: "move",
    days: -2,
  });
  assert.equal(command.revision, 3);
  assert.deepEqual([range.start, range.end], ["2026-10-08", "2026-10-18"]);
  assert.deepEqual(
    [range.notes[0].start, range.notes[0].end],
    ["2026-10-10", "2026-10-16"],
  );
  assert.equal(range.notes[0].completed, true);
  assert.equal(range.notes[0].includeInReport, true);
  assert.deepEqual(data.projects[0].milestones[1], other);
  assert.equal(data.projects[0].responsibleName, "Güncel sorumlu");
  assert.equal(data.projects[0].phases["2026-10"], "Güncel aşama");
});
test("resizing either end adjusts the same end of the parent and detail by calendar days", () => {
  for (const [mode, days, dates] of [
    ["start", -3, ["2026-10-07", "2026-10-20", "2026-10-09", "2026-10-18"]],
    ["end", 3, ["2026-10-10", "2026-10-23", "2026-10-12", "2026-10-21"]],
  ]) {
    const { range } = save(fixture(), {
      target: "range",
      rangeIndex: 0,
      mode,
      days,
    });
    assert.deepEqual(
      [range.start, range.end, range.notes[0].start, range.notes[0].end],
      dates,
    );
  }
});
test("detail changes expand the parent only when needed and preserve manually wider dates", () => {
  const data = fixture();
  const { range } = save(data, {
    target: "note",
    rangeIndex: 0,
    noteIndex: 0,
    mode: "end",
    days: 1,
  });
  assert.deepEqual([range.start, range.end], ["2026-10-10", "2026-10-20"]);
  const next = save(data, {
    target: "note",
    rangeIndex: 0,
    noteIndex: 0,
    mode: "start",
    days: -5,
  }).range;
  assert.deepEqual(
    [next.start, next.end, next.notes[0].start],
    ["2026-10-07", "2026-10-20", "2026-10-07"],
  );
});
test("timeline edits reject overlaps, invalid narrowing and project boundary violations", () => {
  const data = fixture();
  data.projects[0].milestones[0].additionalRanges = [
    {
      start: "2026-10-25",
      end: "2026-10-28",
      notes: [{ text: "İkinci aralık", includeInReport: true }],
    },
  ];
  const before = structuredClone(data);
  for (const [adjustment, message] of [
    [
      { target: "range", rangeIndex: 0, mode: "move", days: 10 },
      /diğer kritik tarihlerin/,
    ],
    [
      { target: "range", rangeIndex: 0, mode: "end", days: -8 },
      /Bar daraltılamıyor/,
    ],
    [{ target: "range", rangeIndex: 0, mode: "move", days: -365 }, /proje/],
  ])
    assert.throws(
      () => prepareTimelineChange(snapshot(data), "m", adjustment),
      message,
    );
  assert.deepEqual(data, before);
});
test("timeline commands retain conflict checks and explain a missing topic", () => {
  const data = fixture();
  const adjustment = { target: "range", rangeIndex: 0, mode: "move", days: 1 };
  const command = prepareTimelineChange(snapshot(data), "m", adjustment);
  applyChanges(data, admin, [command]);
  assert.throws(
    () => applyChanges(data, admin, [command]),
    (error) => error.status === 409,
  );
  assert.throws(
    () => prepareTimelineChange(snapshot(data), "missing", adjustment),
    /Kritik konu bulunamadı/,
  );
});
