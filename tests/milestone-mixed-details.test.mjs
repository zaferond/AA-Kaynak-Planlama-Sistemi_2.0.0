import test from "node:test";
import assert from "node:assert/strict";
import {
  assertMilestoneDateRanges,
  CRITICAL_DATE_OVERLAP_MESSAGE,
  milestoneRanges,
  withMilestoneRanges,
  resizeMilestoneRange,
  changeRangeDisplayKind,
  pointRangeAtDate,
  removeDraftMilestoneRange,
} from "../shared/milestone-ranges.ts";
import { applyChanges } from "../backend/operations.mjs";
import { validate } from "../shared/server-domain.ts";
import { captureProjectSnapshot } from "../frontend/src/features/project-snapshot.ts";
const snapshot = (data) =>
  captureProjectSnapshot(data.projects[0], data.revisions["project:p"] || 0);
import { prepareTimelineChange } from "../frontend/src/features/project-timeline-commands.ts";
import { projectTimelinePeriods } from "../frontend/src/timeline-periods.ts";
import { weeklyNoteLayout } from "../frontend/src/weekly-note-bars.ts";
import {
  buildProjectInfoReport,
  updateReportedTopic,
} from "../shared/project-info-report.ts";
const ranges = () => [
  {
    displayKind: "milestone",
    start: "2026-01-05",
    end: "2026-01-05",
    color: "purple",
    diamondStyle: "outline",
    notes: [
      {
        text: "Review",
        includeInReport: true,
        start: "2026-01-05",
        end: "2026-01-05",
      },
    ],
  },
  {
    start: "2026-01-10",
    end: "2026-01-15",
    color: "green",
    notes: [
      {
        text: "Design",
        includeInReport: true,
        start: "2026-01-10",
        end: "2026-01-15",
      },
    ],
  },
  {
    displayKind: "milestone",
    start: "2026-01-25",
    end: "2026-01-25",
    color: "red",
    diamondStyle: "solid",
    notes: [
      {
        text: "Approval",
        includeInReport: false,
        start: "2026-01-25",
        end: "2026-01-25",
      },
    ],
  },
];
const fixture = () => ({
  teams: [{ id: "t", name: "Team", lead: "L", excelCapacity: 0 }],
  leaders: ["L"],
  resources: [],
  allocations: {},
  revisions: { "project:p": 4 },
  projects: [
    {
      id: "p",
      name: "Project",
      start: "2026-01",
      end: "2026-12",
      phases: {},
      milestones: [
        withMilestoneRanges(
          {
            id: "m",
            name: "Critical Topic",
            start: "2026-01-01",
            end: "2026-01-01",
          },
          ranges(),
        ),
      ],
    },
  ],
});

test("points can share a duration bar's interior, endpoints and another point's date in either storage order", () => {
  for (const date of ["2026-01-10", "2026-01-12", "2026-01-15"]) {
    const point = pointRangeAtDate(ranges()[0], date);
    const secondPoint = {
      ...point,
      notes: [{ ...point.notes[0], text: "Second approval" }],
    };
    for (const details of [
      [point, ranges()[1], secondPoint],
      [ranges()[1], secondPoint, point],
    ]) {
      const data = fixture();
      const project = data.projects[0];
      assert.doesNotThrow(() => assertMilestoneDateRanges(project, details));
      project.milestones[0] = withMilestoneRanges(
        project.milestones[0],
        details,
      );
      assert.doesNotThrow(() => validate(data));
    }
  }
});

test("dragging and report editing move a point inside a sibling bar; extending a bar past a point also saves", () => {
  const data = fixture();
  const originalBar = milestoneRanges(data.projects[0].milestones[0])[1];
  const command = prepareTimelineChange(snapshot(data), "m", {
    target: "range",
    rangeIndex: 0,
    mode: "move",
    days: 7,
  });
  applyChanges(data, { _id: "root-admin", role: "admin", leaders: [] }, [
    command,
  ]);
  validate(data);
  const details = milestoneRanges(data.projects[0].milestones[0]);
  const moved = details.find((range) => range.notes[0].text === "Review");
  assert.equal(moved.start, "2026-01-12");
  assert.equal(moved.end, moved.start);
  assert.equal(moved.displayKind, "milestone");
  assert.equal(moved.color, "purple");
  assert.equal(moved.diamondStyle, "outline");
  assert.deepEqual(
    details.find((range) => range.notes[0].text === "Design"),
    originalBar,
  );

  const original = fixture().projects[0];
  const topic = buildProjectInfoReport([original])[0].infos[0].topics[0];
  const reported = updateReportedTopic(original, "m", topic, {
    text: "Review",
    start: "2026-01-12",
    end: "2026-01-12",
  });
  validate({ ...fixture(), projects: [reported] });
  const reportedPoint = buildProjectInfoReport([
    reported,
  ])[0].infos[0].topics.find((item) => item.text === "Review");
  assert.deepEqual(
    [reportedPoint.start, reportedPoint.end],
    ["2026-01-12", "2026-01-12"],
  );

  const extended = prepareTimelineChange(snapshot(fixture()), "m", {
    target: "range",
    rangeIndex: 1,
    mode: "end",
    days: 12,
  });
  validate({ ...fixture(), projects: [extended.value] });
  assert.equal(
    milestoneRanges(extended.value.milestones[0])[1].end,
    "2026-01-27",
  );
});

test("an interleaved point cannot conceal a collision between two duration bars", () => {
  const data = fixture();
  const project = data.projects[0];
  const details = [
    { ...ranges()[1], start: "2026-01-10", end: "2026-01-20" },
    pointRangeAtDate(ranges()[0], "2026-01-12"),
    { ...ranges()[1], start: "2026-01-15", end: "2026-01-18" },
  ];
  assert.throws(
    () => assertMilestoneDateRanges(project, details),
    (error) => error.message === CRITICAL_DATE_OVERLAP_MESSAGE,
  );
  project.milestones[0] = withMilestoneRanges(project.milestones[0], details);
  assert.throws(
    () => validate(data),
    (error) =>
      error.status === 400 && error.message === CRITICAL_DATE_OVERLAP_MESSAGE,
  );
});

test("one critical topic holds independent point/range/point details; normal sibling resizing is allowed", () => {
  const data = fixture();
  validate(data);
  const p = data.projects[0],
    m = p.milestones[0];
  const details = milestoneRanges(m);
  assert.deepEqual(
    details.map((r) => [r.displayKind, r.notes[0].text, r.color]),
    [
      ["milestone", "Review", "purple"],
      [undefined, "Design", "green"],
      ["milestone", "Approval", "red"],
    ],
  );
  const resized = resizeMilestoneRange(p, m, 1, "end", 2);
  assert.equal(milestoneRanges(resized)[1].end, "2026-01-17");
  assert.equal(milestoneRanges(resized)[0].end, "2026-01-05");
  assert.throws(() => resizeMilestoneRange(p, m, 2, "end", 1), /Milestone/);
  const layout = weeklyNoteLayout(
    details,
    projectTimelinePeriods(["2026-01"], true),
  );
  assert.deepEqual(
    layout.bars.map((b) => [b.rangeIndex, b.noteIndex, b.text]),
    [[1, 0, "Design"]],
  );
});
test("dragging a first point past a range preserves each kind/name/color and moves the column storage kind", () => {
  const data = fixture();
  const c = prepareTimelineChange(snapshot(data), "m", {
    target: "range",
    rangeIndex: 0,
    mode: "move",
    days: 30,
  });
  const m = c.value.milestones[0];
  assert.equal(m.displayKind, undefined);
  assert.equal(m.diamondStyle, undefined);
  const details = milestoneRanges(m);
  assert.equal(details[0].notes[0].text, "Design");
  assert.equal(details[1].notes[0].text, "Approval");
  assert.equal(details[2].displayKind, "milestone");
  assert.equal(details[2].start, "2026-02-04");
  assert.equal(details[2].end, details[2].start);
  assert.equal(details[2].notes[0].start, details[2].start);
  assert.equal(details[2].color, "purple");
  assert.equal(details[2].diamondStyle, "outline");
  assert.equal(details[1].diamondStyle, "solid");
  assert.equal(c.revision, 4);
  validate({ ...data, projects: [c.value] });
});
test("nested point report editing/completion/exclusion retains its single date and independent name", () => {
  const data = fixture(),
    p = data.projects[0],
    topic = buildProjectInfoReport([p])[0].infos[0].topics[0];
  assert.equal(topic.text, "Review");
  assert.equal(topic.start, topic.end);
  const changed = updateReportedTopic(p, "m", topic, {
    text: "Final Review",
    start: "2026-01-06",
    end: "2026-01-06",
  });
  const report = buildProjectInfoReport([changed]);
  const edited = report[0].infos[0].topics[0];
  assert.equal(edited.text, "Final Review");
  assert.equal(edited.start, "2026-01-06");
  assert.equal(milestoneRanges(changed.milestones[0])[0].start, "2026-01-06");
  assert.throws(
    () =>
      updateReportedTopic(p, "m", topic, {
        text: "Review",
        start: "2026-01-05",
        end: "2026-01-06",
      }),
    /Milestone/,
  );
  const done = updateReportedTopic(changed, "m", edited, { completed: true });
  assert.equal(milestoneRanges(done.milestones[0])[0].notes[0].completed, true);
  const removed = updateReportedTopic(
    done,
    "m",
    buildProjectInfoReport([done])[0].infos[0].topics[0],
    { includeInReport: false },
  );
  assert.equal(buildProjectInfoReport([removed])[0].infos[0].topics.length, 1);
  assert.equal(
    milestoneRanges(removed.milestones[0])[0].displayKind,
    "milestone",
  );
});
test("range kind conversion preserves name/flags/color; point dates synchronize; deletion resets first kind", () => {
  const point = changeRangeDisplayKind(ranges()[1], "milestone");
  assert.equal(point.end, point.start);
  assert.equal(point.notes[0].end, point.start);
  assert.equal(point.notes[0].text, "Design");
  assert.equal(point.color, "green");
  const moved = pointRangeAtDate(point, "2026-01-16");
  assert.equal(moved.start, moved.end);
  assert.equal(moved.notes[0].start, moved.start);
  const regular = changeRangeDisplayKind(moved, "range");
  assert.equal(regular.displayKind, "range");
  assert.equal(regular.notes[0].includeInReport, true);
  assert.throws(
    () =>
      changeRangeDisplayKind(
        {
          ...ranges()[1],
          notes: [
            ...ranges()[1].notes,
            { text: "Extra", includeInReport: false },
          ],
        },
        "milestone",
      ),
    /Birden fazla/,
  );
  const m = fixture().projects[0].milestones[0];
  const removed = removeDraftMilestoneRange(m, 0);
  assert.equal(removed.value.displayKind, undefined);
  assert.equal(milestoneRanges(removed.value)[1].displayKind, "milestone");
});

test("invalid diamond styles are rejected for first and additional details; deletion keeps sibling appearance", () => {
  for (const index of [0, 2]) {
    const data = fixture();
    const m = data.projects[0].milestones[0];
    if (index === 0) m.diamondStyle = "striped";
    else m.additionalRanges[1].diamondStyle = "striped";
    assert.throws(() => validate(data));
  }
  const m = fixture().projects[0].milestones[0];
  const removed = removeDraftMilestoneRange(m, 0).value;
  assert.equal(removed.diamondStyle, undefined);
  assert.equal(milestoneRanges(removed)[1].diamondStyle, "solid");
  const last = removeDraftMilestoneRange(removed, 0).value;
  assert.equal(last.diamondStyle, "solid");
  assert.equal(last.displayKind, "milestone");
});
