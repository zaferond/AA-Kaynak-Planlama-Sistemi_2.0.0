import test from "node:test";
import assert from "node:assert/strict";
import { withWeekHistory } from "../shared/note-week-history.ts";
import { buildProjectInfoReport } from "../shared/project-info-report.ts";
import {
  filterReportGroups,
  topicWeeks,
} from "../frontend/src/project-info-status.ts";

const project = (notes, extra = []) => ({
  id: "p",
  name: "P",
  start: "2026-01",
  end: "2027-12",
  phases: {},
  milestones: [
    {
      id: "m",
      name: "M",
      start: "2026-11-02",
      end: "2026-11-20",
      barColor: "red",
      barText: notes[0]?.text || "",
      barNotes: notes,
      ...(extra.length ? { additionalRanges: extra } : {}),
    },
  ],
});
const note = (text, start, end, more = {}) => ({
  text,
  includeInReport: true,
  start,
  end,
  ...more,
});

test("changed dates keep the weeks a note covered before", () => {
  const before = project([note("A", "2026-11-02", "2026-11-08")]); // W45
  const moved = withWeekHistory(
    before,
    project([note("A", "2026-11-16", "2026-11-22")]), // W47
  );
  assert.deepEqual(moved.milestones[0].barNotes[0].weekHistory, ["2026-W45"]);
  // An editor that drops the field, and a second move, keep the history.
  const again = withWeekHistory(
    moved,
    project([note("A", "2026-11-30", "2026-12-06")]), // W49
  );
  assert.deepEqual(again.milestones[0].barNotes[0].weekHistory, [
    "2026-W45",
    "2026-W47",
  ]);
  // Unchanged dates and no history: the incoming project is returned as is.
  const same = project([note("B", "2026-11-02", "2026-11-08")]);
  assert.equal(withWeekHistory(same, same), same);
});

test("notes match by text first, then by position", () => {
  const before = project([
    note("A", "2026-11-02", "2026-11-08"),
    note("B", "2026-11-09", "2026-11-15"),
  ]);
  // Reordered, B moved; A unchanged.
  const next = withWeekHistory(
    before,
    project([
      note("B", "2026-11-23", "2026-11-29"),
      note("A", "2026-11-02", "2026-11-08"),
    ]),
  );
  assert.deepEqual(next.milestones[0].barNotes[0].weekHistory, ["2026-W46"]);
  assert.equal(next.milestones[0].barNotes[1].weekHistory, undefined);
  // Renamed in place: matched by position.
  const renamed = withWeekHistory(
    before,
    project([
      note("A2", "2026-11-16", "2026-11-22"),
      note("B", "2026-11-09", "2026-11-15"),
    ]),
  );
  assert.deepEqual(renamed.milestones[0].barNotes[0].weekHistory, ["2026-W45"]);
});

test("slipped and unclosed weeks are red; the report filters by them", () => {
  const stored = project([
    note("A", "2026-10-26", "2026-11-01", {
      weekHistory: ["2026-W40"],
    }),
  ]); // now W44, earlier W40
  const [topic] = buildProjectInfoReport([stored])[0].infos[0].topics;
  assert.deepEqual(
    topicWeeks(topic, "2026-10-16").map(({ week, state }) => [
      week.week,
      state,
    ]),
    [
      [40, "missed"],
      [44, "current"],
    ],
  );
  assert.deepEqual(
    topicWeeks(topic, "2026-11-10").map(({ state }) => state),
    ["missed", "missed"],
  );
  // Closed later: only the slipped week stays red.
  assert.deepEqual(
    topicWeeks({ ...topic, completed: true }, "2026-11-10").map(
      ({ state }) => state,
    ),
    ["missed", "current"],
  );
  // A future week from earlier dates is history, not yet missed.
  assert.deepEqual(
    topicWeeks({ ...topic, weekHistory: ["2026-W50"] }, "2026-10-16").map(
      ({ week, state }) => [week.week, state],
    ),
    [
      [44, "current"],
      [50, "history"],
    ],
  );
  const groups = buildProjectInfoReport([stored]);
  const count = (keys) =>
    filterReportGroups(groups, "all", "2026-10-16", new Set(keys)).length;
  assert.equal(count(["2026-W40"]), 1);
  assert.equal(count(["2026-W41", "2026-W44"]), 1);
  assert.equal(count(["2026-W41", "2026-W42"]), 0);
});

test("the server keeps week history across saves and restarts", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { Store } = await import("../backend/store.mjs");
  const { hashPassword } = await import("../backend/auth.mjs");
  const { applyChanges } = await import("../backend/operations.mjs");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-week-history-"));
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
  };
  let store = new Store({ env });
  try {
    await store.connect();
    await store.bootstrapUser({
      _id: "root-admin",
      username: "qa.root-admin",
      name: "QA root-admin",
      role: "admin",
      resourceId: "",
      leaders: [],
      active: true,
      password: await hashPassword("Week-history-test-1!"),
      version: 1,
      revision: 1,
    });
    const admin = await store.findUser({ id: "root-admin" });
    const save = (value) =>
      store.mutate(admin, (d, u) =>
        applyChanges(d, u, [
          {
            kind: "project",
            id: "p",
            value,
            revision: d.revisions["project:p"] || 0,
          },
        ]),
      );
    await save(project([note("A", "2026-11-02", "2026-11-08")]));
    await save(project([note("A", "2026-11-16", "2026-11-22")]));
    await store.close();
    store = new Store({ env });
    await store.connect();
    const stored = (await store.read()).data.projects.find((p) => p.id === "p");
    assert.deepEqual(stored.milestones[0].barNotes[0].weekHistory, [
      "2026-W45",
    ]);
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
