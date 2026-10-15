import test from "node:test";
import assert from "node:assert/strict";
import {
  periodOverlapsProject,
  phaseMonthForPeriod,
  projectTimelinePeriods,
} from "../frontend/src/timeline-periods.ts";
import {
  dateAtPeriodPosition,
  dateAtTrackPosition,
  milestoneBars,
  milestoneBarsForPeriods,
} from "../frontend/src/milestone-bars.ts";

test("weekly columns cover filtered months without gaps and keep ISO week years", () => {
  const weeks = projectTimelinePeriods(["2026-12", "2027-01"], true);
  assert.deepEqual(
    [weeks[0].start, weeks[0].end],
    ["2026-12-01", "2026-12-06"],
  );
  const boundary = weeks.find((week) => week.start === "2026-12-28");
  assert.deepEqual(
    [boundary?.end, boundary?.year, boundary?.weekNumber],
    ["2027-01-03", "2026", 53],
  );
  assert.deepEqual(
    [weeks.at(-1).start, weeks.at(-1).end],
    ["2027-01-25", "2027-01-31"],
  );
  for (let index = 1; index < weeks.length; index++) {
    const nextDay = new Date(
      Date.parse(weeks[index - 1].end + "T00:00:00Z") + 86400000,
    )
      .toISOString()
      .slice(0, 10);
    assert.equal(weeks[index].start, nextDay);
  }
});

test("weekly bars and drag positions respect partial weeks and exact dates", () => {
  const weeks = projectTimelinePeriods(["2026-01", "2026-02"], true);
  assert.deepEqual(
    [weeks[0].start, weeks[0].end],
    ["2026-01-01", "2026-01-04"],
  );
  assert.equal(
    weeks.find((week) => week.start === "2026-01-26")?.end,
    "2026-02-01",
  );
  const februaryProject = { start: "2026-02", end: "2026-02" };
  const crossingWeek = weeks.find((week) => week.start === "2026-01-26");
  assert.equal(periodOverlapsProject(crossingWeek, februaryProject), true);
  assert.equal(phaseMonthForPeriod(crossingWeek, februaryProject), "2026-02");
  const [bar] = milestoneBarsForPeriods(
    [{ start: "2026-01-03", end: "2026-01-06" }],
    weeks,
  );
  assert.ok(Math.abs(bar.left - (2 / 4 / weeks.length) * 100) < 1e-10);
  assert.ok(
    Math.abs(bar.width - ((1 + 2 / 7 - 2 / 4) / weeks.length) * 100) < 1e-10,
  );
  const width = weeks.length * 70;
  assert.equal(dateAtPeriodPosition(0, 0, width, weeks), "2026-01-01");
  assert.equal(dateAtPeriodPosition(69, 0, width, weeks), "2026-01-04");
  assert.equal(dateAtPeriodPosition(70, 0, width, weeks), "2026-01-05");
  assert.equal(dateAtPeriodPosition(width, 0, width, weeks), "2026-02-28");
});

test("monthly bars and drag positions stay aligned after period refactor", () => {
  const months = ["2028-02", "2028-03"];
  const periods = projectTimelinePeriods(months, false);
  const ranges = [{ start: "2028-02-15", end: "2028-03-04" }];
  assert.deepEqual(
    milestoneBarsForPeriods(ranges, periods),
    milestoneBars(ranges, months),
  );
  for (const x of [0, 50, 100, 200])
    assert.equal(
      dateAtPeriodPosition(x, 0, 200, periods),
      dateAtTrackPosition(x, 0, 200, months),
    );
});
