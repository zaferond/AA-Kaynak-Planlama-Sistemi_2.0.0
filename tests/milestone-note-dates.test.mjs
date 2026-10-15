import test from "node:test";
import assert from "node:assert/strict";
import {
  assertMilestoneDateRanges,
  changeMilestoneNoteDates,
  cleanMilestoneRanges,
  CRITICAL_DATE_OVERLAP_MESSAGE,
  datedNotes,
  expandRangeToNoteDates,
  milestoneRanges,
  noteDates,
  rangeWithNoteDates,
  resizeMilestoneRange,
  shiftMilestoneRange,
  withMilestoneRanges,
} from "../frontend/src/milestone-ranges.ts";
import {
  buildProjectInfoReport,
  updateReportedTopic,
} from "../frontend/src/project-info-report.ts";
import { projectInfoReportSheet } from "../frontend/src/project-info-report-export.ts";
import {
  calendarDayDifference,
  dateAtTrackPosition,
  milestoneBars,
} from "../frontend/src/milestone-bars.ts";
import { validate } from "../backend/domain/index.mjs";

const project = {
  id: "p",
  name: "Proje",
  start: "2026-01",
  end: "2026-12",
  phases: {},
  milestones: [],
};
const dataWith = (milestone) => ({
  teams: [{ id: "t", name: "Takım", lead: "L", excelCapacity: 1 }],
  leaders: ["L"],
  projects: [{ ...project, milestones: [milestone] }],
  resources: [],
  allocations: {},
  revisions: {},
});

test("subtask dates set the enclosing bar from the earliest start to latest end", () => {
  const milestone = {
    id: "i",
    name: "Analizler",
    start: "2026-03-01",
    end: "2026-03-31",
    barColor: "blue",
    barNotes: [],
  };
  const notes = [
    {
      text: "İlk analiz",
      includeInReport: true,
      start: "2026-03-08",
      end: "2026-03-12",
    },
    {
      text: "Son analiz",
      includeInReport: true,
      start: "2026-03-18",
      end: "2026-04-02",
    },
  ];
  const range = rangeWithNoteDates(milestoneRanges(milestone)[0], notes);
  assert.deepEqual([range.start, range.end], ["2026-03-08", "2026-04-02"]);
  assert.deepEqual(cleanMilestoneRanges([range])[0].notes, notes);
  const saved = withMilestoneRanges(milestone, cleanMilestoneRanges([range]));
  assert.deepEqual([saved.start, saved.end], ["2026-03-08", "2026-04-02"]);
  assert.equal(
    milestoneBars(milestoneRanges(saved), ["2026-03", "2026-04"]).length,
    1,
  );
  const topics = buildProjectInfoReport([
    { ...project, milestones: [saved] },
  ])[0].infos[0].topics;
  assert.deepEqual(
    topics.map((topic) => [topic.text, topic.start, topic.end]),
    [
      ["İlk analiz", "2026-03-08", "2026-03-12"],
      ["Son analiz", "2026-03-18", "2026-04-02"],
    ],
  );
  const sheet = projectInfoReportSheet(
    buildProjectInfoReport([{ ...project, milestones: [saved] }]),
  );
  assert.match(sheet, /08\.03\.2026/);
  assert.match(sheet, /12\.03\.2026/);
  assert.match(sheet, /18\.03\.2026/);
  assert.match(sheet, /02\.04\.2026/);
});

test("blank detail text still contributes dates to the enclosing bar and its saved range", () => {
  const milestone = {
    id: "blank-dates",
    name: "Başlık",
    start: "2026-03-01",
    end: "2026-03-20",
  };
  const original = milestoneRanges(milestone)[0];
  for (const notes of [
    [
      {
        text: "",
        includeInReport: false,
        start: "2026-02-20",
        end: "2026-04-15",
      },
    ],
    [
      {
        text: "Named",
        includeInReport: true,
        start: "2026-03-01",
        end: "2026-03-20",
      },
      {
        text: "   ",
        includeInReport: false,
        start: "2026-02-20",
        end: "2026-04-15",
      },
    ],
  ]) {
    const range = rangeWithNoteDates(original, notes);
    assert.deepEqual([range.start, range.end], ["2026-02-20", "2026-04-15"]);
    const saved = withMilestoneRanges(milestone, cleanMilestoneRanges([range]));
    assert.deepEqual([saved.start, saved.end], ["2026-02-20", "2026-04-15"]);
    assert.doesNotThrow(() => validate(dataWith(saved)));
    const narrowed = rangeWithNoteDates(
      range,
      notes.map((n) => ({ ...n, start: "2026-03-08", end: "2026-03-12" })),
    );
    assert.deepEqual(
      [narrowed.start, narrowed.end],
      ["2026-03-08", "2026-03-12"],
    );
  }
  for (const dates of [
    { start: "", end: "2026-03-20" },
    { start: "2026-03-20", end: "2026-03-01" },
  ]) {
    const incomplete = rangeWithNoteDates(original, [
      { text: "", includeInReport: false, ...dates },
    ]);
    assert.deepEqual(
      [incomplete.start, incomplete.end],
      [original.start, original.end],
    );
  }
});

test("manual parent dates preserve subtask dates, including old notes", () => {
  const milestone = {
    id: "i",
    name: "Bilgi",
    start: "2026-05-01",
    end: "2026-05-31",
    barNotes: [{ text: "Eski açıklama", includeInReport: true }],
  };
  const original = milestoneRanges(milestone)[0];
  assert.deepEqual(noteDates(original.notes[0], original), {
    start: "2026-05-01",
    end: "2026-05-31",
  });
  const manual = {
    ...original,
    start: "2026-04-25",
    end: "2026-06-05",
    notes: datedNotes(original),
  };
  const saved = withMilestoneRanges(milestone, [manual]);
  assert.deepEqual([saved.start, saved.end], ["2026-04-25", "2026-06-05"]);
  assert.deepEqual(
    buildProjectInfoReport([
      { ...project, milestones: [saved] },
    ])[0].infos[0].topics.map((topic) => [topic.start, topic.end]),
    [["2026-05-01", "2026-05-31"]],
  );
});

test("editing detail dates extends the parent in either direction and keeps wider manual bounds", () => {
  const range = {
    start: "2026-04-10",
    end: "2026-04-20",
    color: "blue",
    notes: [
      {
        text: "",
        includeInReport: false,
        start: "2026-04-10",
        end: "2026-04-20",
      },
    ],
  };
  const earlier = expandRangeToNoteDates(range, [
    { ...range.notes[0], start: "2026-04-05" },
  ]);
  assert.deepEqual([earlier.start, earlier.end], ["2026-04-05", "2026-04-20"]);
  const later = expandRangeToNoteDates(earlier, [
    { ...earlier.notes[0], end: "2026-04-25" },
  ]);
  assert.deepEqual([later.start, later.end], ["2026-04-05", "2026-04-25"]);
  const inside = expandRangeToNoteDates(later, [
    { ...later.notes[0], start: "2026-04-12", end: "2026-04-18" },
  ]);
  assert.deepEqual([inside.start, inside.end], ["2026-04-05", "2026-04-25"]);
});

test("separate ranges recalculate independently and invalid subtask dates are rejected", () => {
  const milestone = {
    id: "i",
    name: "Bilgi",
    start: "2026-02-01",
    end: "2026-02-28",
    barNotes: [
      {
        text: "İlk",
        includeInReport: true,
        start: "2026-02-04",
        end: "2026-02-06",
      },
    ],
    additionalRanges: [
      {
        start: "2026-06-01",
        end: "2026-06-30",
        notes: [
          {
            text: "İkinci",
            includeInReport: true,
            start: "2026-06-10",
            end: "2026-06-20",
          },
        ],
      },
    ],
  };
  const ranges = milestoneRanges(milestone).map((range) =>
    rangeWithNoteDates(range, range.notes),
  );
  const saved = withMilestoneRanges(milestone, ranges);
  assert.deepEqual([saved.start, saved.end], ["2026-02-04", "2026-02-06"]);
  assert.deepEqual(
    [saved.additionalRanges[0].start, saved.additionalRanges[0].end],
    ["2026-06-10", "2026-06-20"],
  );
  assert.doesNotThrow(() => validate(dataWith(saved)));
  const bad = {
    ...saved,
    barNotes: [
      {
        text: "Bozuk",
        includeInReport: true,
        start: "2026-02-15",
        end: "2026-02-01",
      },
    ],
  };
  assert.throws(() => validate(dataWith(bad)), /Açıklama tarihleri/);
  const outside = {
    ...saved,
    barNotes: [
      {
        text: "Dışarıda",
        includeInReport: true,
        start: "2025-12-30",
        end: "2026-01-02",
      },
    ],
  };
  assert.throws(() => validate(dataWith(outside)), /Açıklama tarihleri/);
});

test("overlapping bars show the requested warning and report edits use the same check", () => {
  const milestone = {
    id: "i",
    name: "Kritik tarihler",
    start: "2026-03-01",
    end: "2026-03-10",
    barNotes: [
      {
        text: "İlk",
        includeInReport: true,
        start: "2026-03-01",
        end: "2026-03-10",
      },
    ],
    additionalRanges: [
      {
        start: "2026-03-20",
        end: "2026-03-25",
        notes: [
          {
            text: "İkinci",
            includeInReport: true,
            start: "2026-03-20",
            end: "2026-03-25",
          },
        ],
      },
    ],
  };
  const ranges = milestoneRanges(milestone);
  assert.throws(
    () =>
      assertMilestoneDateRanges(project, [
        ranges[0],
        { ...ranges[1], start: "2026-03-08" },
      ]),
    (error) => error.message === CRITICAL_DATE_OVERLAP_MESSAGE,
  );
  const overlapping = {
    ...milestone,
    additionalRanges: [
      { ...milestone.additionalRanges[0], start: "2026-03-08" },
    ],
  };
  assert.throws(
    () => validate(dataWith(overlapping)),
    (error) => error.message === CRITICAL_DATE_OVERLAP_MESSAGE,
  );
  const current = { ...project, milestones: [milestone] };
  const topic = buildProjectInfoReport([current])[0].infos[0].topics[1];
  assert.throws(
    () =>
      updateReportedTopic(current, "i", topic, {
        text: "İkinci",
        start: "2026-03-08",
        end: "2026-03-25",
      }),
    (error) => error.message === CRITICAL_DATE_OVERLAP_MESSAGE,
  );
  const updated = updateReportedTopic(current, "i", topic, {
    text: "İkinci güncellendi",
    start: "2026-03-26",
    end: "2026-03-28",
  });
  assert.deepEqual(
    [
      updated.milestones[0].additionalRanges[0].start,
      updated.milestones[0].additionalRanges[0].end,
    ],
    ["2026-03-20", "2026-03-28"],
  );
  assert.deepEqual(buildProjectInfoReport([updated])[0].infos[0].topics[1], {
    text: "İkinci güncellendi",
    start: "2026-03-26",
    end: "2026-03-28",
    rangeIndex: 1,
    noteIndex: 0,
  });
});

test("dragging one information bar shifts its dated notes and report dates without changing other bars", () => {
  const info = {
    id: "i",
    name: "Bilgi",
    start: "2026-02-25",
    end: "2026-03-05",
    barColor: "blue",
    barNotes: [
      {
        text: "Tarihli",
        includeInReport: true,
        start: "2026-02-26",
        end: "2026-03-02",
      },
      { text: "Barı izleyen", includeInReport: true },
    ],
    additionalRanges: [
      {
        start: "2026-04-10",
        end: "2026-04-12",
        notes: [{ text: "Diğer", includeInReport: true }],
      },
    ],
  };
  const moved = shiftMilestoneRange(project, info, 0, 7);
  assert.deepEqual([moved.start, moved.end], ["2026-03-04", "2026-03-12"]);
  assert.deepEqual(
    [moved.barNotes[0].start, moved.barNotes[0].end],
    ["2026-03-05", "2026-03-09"],
  );
  assert.deepEqual(
    [moved.barNotes[1].start, moved.barNotes[1].end],
    [undefined, undefined],
  );
  assert.deepEqual(
    [
      moved.additionalRanges[0].start,
      moved.additionalRanges[0].end,
      moved.additionalRanges[0].notes[0].text,
    ],
    ["2026-04-10", "2026-04-12", "Diğer"],
  );
  assert.deepEqual(
    buildProjectInfoReport([
      { ...project, milestones: [moved] },
    ])[0].infos[0].topics.map((topic) => [topic.start, topic.end]),
    [
      ["2026-03-04", "2026-03-12"],
      ["2026-03-05", "2026-03-09"],
      ["2026-04-10", "2026-04-12"],
    ],
  );
  assert.doesNotThrow(() => validate(dataWith(moved)));
  assert.throws(
    () => shiftMilestoneRange(project, info, 0, 39),
    (error) => error.message === CRITICAL_DATE_OVERLAP_MESSAGE,
  );
  assert.throws(
    () => shiftMilestoneRange(project, info, 0, -60),
    /proje dönemi/,
  );
});

test("drag position maps month widths to calendar days including leap February and track edges", () => {
  const months = ["2028-02", "2028-03"];
  assert.equal(dateAtTrackPosition(0, 0, 200, months), "2028-02-01");
  assert.equal(dateAtTrackPosition(50, 0, 200, months), "2028-02-15");
  assert.equal(dateAtTrackPosition(100, 0, 200, months), "2028-03-01");
  assert.equal(dateAtTrackPosition(200, 0, 200, months), "2028-03-31");
  assert.equal(calendarDayDifference("2028-02-28", "2028-03-01"), 2);
});

test("resizing either end updates the selected bar and every detail date by the same number of days", () => {
  const info = {
    id: "i",
    name: "Bilgi",
    start: "2026-03-10",
    end: "2026-03-20",
    barNotes: [
      {
        text: "Görev",
        includeInReport: true,
        start: "2026-03-12",
        end: "2026-03-18",
      },
      { text: "Eski not", includeInReport: true },
    ],
    additionalRanges: [
      {
        start: "2026-04-10",
        end: "2026-04-15",
        notes: [{ text: "Başka aralık", includeInReport: true }],
      },
    ],
  };
  const narrowed = resizeMilestoneRange(project, info, 0, "start", 5);
  assert.deepEqual(
    [narrowed.start, narrowed.end],
    ["2026-03-15", "2026-03-20"],
  );
  assert.deepEqual(
    [narrowed.barNotes[0].start, narrowed.barNotes[0].end],
    ["2026-03-17", "2026-03-18"],
  );
  assert.deepEqual(
    [narrowed.barNotes[1].start, narrowed.barNotes[1].end],
    ["2026-03-15", "2026-03-20"],
  );
  const expanded = resizeMilestoneRange(project, narrowed, 0, "end", 7);
  assert.deepEqual(
    [expanded.start, expanded.end],
    ["2026-03-15", "2026-03-27"],
  );
  assert.deepEqual(
    buildProjectInfoReport([
      { ...project, milestones: [expanded] },
    ])[0].infos[0].topics.map((topic) => [topic.text, topic.start, topic.end]),
    [
      ["Eski not", "2026-03-15", "2026-03-27"],
      ["Görev", "2026-03-17", "2026-03-25"],
      ["Başka aralık", "2026-04-10", "2026-04-15"],
    ],
  );
  assert.deepEqual(
    [expanded.additionalRanges[0].start, expanded.additionalRanges[0].end],
    ["2026-04-10", "2026-04-15"],
  );
  assert.doesNotThrow(() => validate(dataWith(expanded)));
  assert.throws(
    () => resizeMilestoneRange(project, info, 0, "start", 11),
    /Bar daraltılamıyor/,
  );
  assert.throws(
    () => resizeMilestoneRange(project, info, 0, "end", 25),
    (error) => error.message === CRITICAL_DATE_OVERLAP_MESSAGE,
  );
  assert.throws(
    () => resizeMilestoneRange(project, info, 0, "start", -80),
    /proje dönemi/,
  );
});

test("moving and resizing a weekly detail updates its enclosing range and report without moving siblings", () => {
  const info = {
    id: "i",
    name: "Bilgi",
    start: "2026-03-10",
    end: "2026-03-25",
    barNotes: [
      {
        text: "İlk",
        includeInReport: true,
        start: "2026-03-10",
        end: "2026-03-12",
      },
      {
        text: "İkinci",
        includeInReport: true,
        start: "2026-03-23",
        end: "2026-03-25",
      },
    ],
  };
  const moved = changeMilestoneNoteDates(project, info, 0, 0, "move", 7);
  assert.deepEqual([moved.start, moved.end], ["2026-03-10", "2026-03-25"]);
  assert.deepEqual(
    [moved.barNotes[0].start, moved.barNotes[0].end],
    ["2026-03-17", "2026-03-19"],
  );
  assert.deepEqual(
    [moved.barNotes[1].start, moved.barNotes[1].end],
    ["2026-03-23", "2026-03-25"],
  );
  const movedOneDay = changeMilestoneNoteDates(project, moved, 0, 0, "move", 1);
  assert.deepEqual(
    [
      movedOneDay.barNotes[0].start,
      movedOneDay.barNotes[0].end,
      movedOneDay.start,
    ],
    ["2026-03-18", "2026-03-20", "2026-03-10"],
  );
  const expanded = changeMilestoneNoteDates(project, moved, 0, 1, "end", 7);
  assert.deepEqual(
    [expanded.start, expanded.end],
    ["2026-03-10", "2026-04-01"],
  );
  assert.doesNotThrow(() => validate(dataWith(expanded)));
  assert.deepEqual(
    buildProjectInfoReport([
      { ...project, milestones: [expanded] },
    ])[0].infos[0].topics.map((topic) => [topic.start, topic.end]),
    [
      ["2026-03-17", "2026-03-19"],
      ["2026-03-23", "2026-04-01"],
    ],
  );
  const lengthened = changeMilestoneNoteDates(
    project,
    expanded,
    0,
    0,
    "end",
    7,
  );
  const narrowed = changeMilestoneNoteDates(
    project,
    lengthened,
    0,
    0,
    "start",
    7,
  );
  assert.deepEqual(
    [narrowed.start, narrowed.end],
    ["2026-03-10", "2026-04-01"],
  );
});

test("weekly detail changes reject reversed dates, project bounds and conflicting critical ranges", () => {
  const info = {
    id: "i",
    name: "Bilgi",
    start: "2026-03-01",
    end: "2026-03-05",
    barNotes: [
      {
        text: "İlk",
        includeInReport: false,
        start: "2026-03-01",
        end: "2026-03-05",
      },
    ],
    additionalRanges: [
      {
        start: "2026-03-20",
        end: "2026-03-25",
        notes: [
          {
            text: "İkinci",
            includeInReport: false,
            start: "2026-03-20",
            end: "2026-03-25",
          },
        ],
      },
    ],
  };
  assert.throws(
    () => changeMilestoneNoteDates(project, info, 0, 0, "start", 7),
    /bitiş tarihi/,
  );
  assert.throws(
    () => changeMilestoneNoteDates(project, info, 0, 0, "move", 21),
    (error) => error.message === CRITICAL_DATE_OVERLAP_MESSAGE,
  );
  assert.throws(
    () => changeMilestoneNoteDates(project, info, 0, 0, "move", -70),
    /proje dönemi/,
  );
  assert.deepEqual([info.start, info.end], ["2026-03-01", "2026-03-05"]);
});

test("form, report and weekly dragging preserve the same manually widened parent dates", () => {
  const info = {
    id: "i",
    name: "Konu",
    start: "2026-09-10",
    end: "2026-09-20",
    barNotes: [
      {
        text: "Not",
        includeInReport: true,
        start: "2026-09-12",
        end: "2026-09-18",
      },
    ],
  };
  const current = { ...project, milestones: [info] },
    range = milestoneRanges(info)[0];
  for (const end of ["2026-09-19", "2026-09-25"]) {
    const form = expandRangeToNoteDates(range, [{ ...range.notes[0], end }]);
    const report = updateReportedTopic(
      current,
      "i",
      buildProjectInfoReport([current])[0].infos[0].topics[0],
      { text: "Not", end },
    ).milestones[0];
    const dragged = changeMilestoneNoteDates(
      project,
      info,
      0,
      0,
      "end",
      Number(end.slice(-2)) - 18,
    );
    assert.deepEqual([report.start, report.end], [form.start, form.end]);
    assert.deepEqual([dragged.start, dragged.end], [form.start, form.end]);
    assert.deepEqual(
      [form.start, form.end],
      ["2026-09-10", end === "2026-09-19" ? "2026-09-20" : end],
    );
  }
});
