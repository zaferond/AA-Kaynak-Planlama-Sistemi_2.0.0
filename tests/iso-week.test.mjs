import test from "node:test";
import assert from "node:assert/strict";
import {
  isoWeek,
  shiftWeek,
  weekLabel,
  weeksInRange,
} from "../frontend/src/iso-week.ts";
import {
  filterReportGroups,
  reportWeeks,
  topicFilterCounts,
} from "../frontend/src/project-info-status.ts";

test("ISO weeks follow the Thursday rule across year boundaries", () => {
  assert.equal(isoWeek("2026-10-16").key, "2026-W42");
  assert.equal(isoWeek("2026-01-01").key, "2026-W01");
  assert.equal(isoWeek("2027-01-01").key, "2026-W53");
  assert.equal(isoWeek("2024-12-30").key, "2025-W01");
  assert.deepEqual(
    [isoWeek("2026-08-12").start, isoWeek("2026-08-12").end],
    ["2026-08-10", "2026-08-16"],
  );
  assert.equal(shiftWeek(isoWeek("2026-12-31"), 1).key, "2027-W01");
  assert.equal(weekLabel(isoWeek("2026-08-12"), 2026), "W33");
  assert.equal(weekLabel(isoWeek("2027-01-20"), 2026), "W03 '27");
});

test("a date range lists every week it touches", () => {
  assert.deepEqual(
    weeksInRange("2026-08-10", "2026-08-23").map((w) => w.week),
    [33, 34],
  );
  assert.deepEqual(
    weeksInRange("2026-08-16", "2026-08-17").map((w) => w.week),
    [33, 34],
  );
  assert.deepEqual(
    weeksInRange("2026-08-12", "2026-08-12").map((w) => w.week),
    [33],
  );
  assert.deepEqual(weeksInRange("", ""), []);
});

test("critical topics filter by the weeks their dates touch", () => {
  const topic = (text, start, end) => ({
    text,
    start,
    end,
    rangeIndex: 0,
    noteIndex: 0,
  });
  const groups = [
    {
      id: "p",
      name: "P",
      responsibleName: "",
      infos: [
        {
          id: "i",
          name: "I",
          topics: [
            topic("a", "2026-08-10", "2026-08-23"),
            topic("b", "2026-08-20", "2026-08-20"),
            topic("c", "2026-09-01", "2026-09-02"),
          ],
        },
      ],
    },
  ];
  const w33 = isoWeek("2026-08-12");
  const w34 = isoWeek("2026-08-20");
  const names = (week) =>
    filterReportGroups(
      groups,
      "all",
      "2026-10-16",
      new Set([week.key]),
    )[0].infos[0].topics.map((t) => t.text);
  assert.deepEqual(names(w33), ["a"]);
  assert.deepEqual(names(w34), ["a", "b"]);
  assert.equal(
    topicFilterCounts(groups, "2026-10-16", new Set([w34.key])).all,
    2,
  );
  assert.deepEqual(
    reportWeeks(groups).map(({ week, count }) => [week.week, count]),
    [
      [33, 1],
      [34, 2],
      [36, 1],
    ],
  );
});
