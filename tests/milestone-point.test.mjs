import { schemaVersion } from "../backend/migration-catalog.mjs";
import { captureEditorRevisions } from "../frontend/src/features/editor-revisions.ts";
import test from "node:test";
import { captureProjectSnapshot } from "../frontend/src/features/project-snapshot.ts";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hashPassword } from "../backend/auth.mjs";
import { Store } from "../backend/store.mjs";
import { SqlJsAdapter } from "../backend/adapters/sqljs.mjs";
import { validate } from "../shared/server-domain.ts";
import {
  milestoneRanges,
  shiftMilestoneRange,
  resizeMilestoneRange,
} from "../shared/milestone-ranges.ts";
import {
  milestoneBarsForPeriods,
  dateAtPeriodPosition,
} from "../frontend/src/milestone-bars.ts";
import { projectTimelinePeriods } from "../frontend/src/timeline-periods.ts";
import { prepareEditorChanges } from "../frontend/src/features/editor-commands.ts";
import { prepareMilestoneColorPaste } from "../frontend/src/features/project-clipboard.ts";
const point = () => ({
  id: "m",
  name: "Design Freeze",
  start: "2026-03-20",
  end: "2026-03-20",
  displayKind: "milestone",
  barColor: "green",
  barStyle: "outline",
});
const fixture = () => ({
  teams: [{ id: "t", name: "Team", lead: "L", excelCapacity: 0 }],
  resources: [],
  leaders: ["L"],
  leaderParents: {},
  leadershipUnits: {},
  allocations: {},
  revisions: { "project:p": 3 },
  projects: [
    {
      id: "p",
      name: "Proje",
      start: "2026-01",
      end: "2026-12",
      phases: {},
      milestones: [point()],
    },
  ],
});
test("single-date milestone validates; inconsistent range/detail/date/type rejected", () => {
  const data = fixture();
  validate(data);
  for (const bad of [
    { end: "2026-03-21" },
    { hasCriticalTopics: false },
    { barNotes: [{ text: "note" }] },
    {
      additionalRanges: [
        { displayKind: "milestone", start: "2026-04-01", end: "2026-04-02" },
      ],
    },
    { displayKind: "unknown" },
    { start: "2025-12-31", end: "2025-12-31" },
  ]) {
    const d = fixture();
    Object.assign(d.projects[0].milestones[0], bad);
    assert.throws(() => validate(d));
  }
});
test("point drag shifts one date through month/year edges; resizing and project overflow rejected", () => {
  const data = fixture(),
    p = data.projects[0],
    m = p.milestones[0];
  const moved = shiftMilestoneRange(p, m, 0, 15);
  assert.equal(moved.start, "2026-04-04");
  assert.equal(moved.end, moved.start);
  assert.equal(moved.displayKind, "milestone");
  assert.equal(moved.barColor, "green");
  assert.equal(m.start, "2026-03-20");
  const left = shiftMilestoneRange(p, moved, 0, -15);
  assert.equal(left.start, m.start);
  assert.equal(left.end, m.end);
  assert.throws(() => shiftMilestoneRange(p, m, 0, -100));
  assert.throws(() => resizeMilestoneRange(p, m, 0, "end", 1), /Milestone/);
  assert.throws(() => resizeMilestoneRange(p, m, 0, "start", -1), /Milestone/);
});
test("monthly and weekly diamond center maps back to the exact date; filtered periods omit it", () => {
  const m = point();
  for (const weekly of [false, true]) {
    const periods = projectTimelinePeriods(["2026-03", "2026-04"], weekly);
    const [bar] = milestoneBarsForPeriods(milestoneRanges(m), periods);
    assert(bar);
    const center = bar.left + bar.width / 2;
    assert.equal(dateAtPeriodPosition(center, 0, 100, periods), m.start);
    assert.equal(
      milestoneBarsForPeriods(
        milestoneRanges(m),
        projectTimelinePeriods(["2026-05"], weekly),
      ).length,
      0,
    );
  }
});
test("editor appends point, color paste preserves kind/date, empty or range-shaped point rejects", () => {
  const data = fixture();
  const editor = {
    baseRevisions: captureEditorRevisions(data),
    kind: "milestone",
    projectId: "p",
    isNew: true,
    draftEmpty: false,
    value: { ...point(), id: "new" },
  };
  const [c] = prepareEditorChanges(data, editor, {
    start: "2026-01",
    resourceIds: [],
  });
  assert.deepEqual(
    c.value.milestones.map((m) => m.id),
    ["m", "new"],
  );
  assert.equal(c.value.milestones[1].displayKind, "milestone");
  const colored = prepareMilestoneColorPaste(
    captureProjectSnapshot(data.projects[0], data.revisions["project:p"] || 0),
    { projectId: "p", milestoneId: "m", rangeIndex: 0 },
    "purple",
  ).value.milestones[0];
  assert.equal(colored.barColor, "purple");
  assert.equal(colored.displayKind, "milestone");
  assert.equal(colored.start, colored.end);
  const empty = prepareEditorChanges(
    data,
    { ...editor, draftEmpty: true },
    { start: "2026-01", resourceIds: [] },
  )[0].value.milestones.at(-1);
  assert.equal(empty.hasCriticalTopics, false);
  assert.equal(empty.displayKind, undefined);
  assert.throws(() =>
    prepareEditorChanges(
      data,
      { ...editor, value: { ...editor.value, end: "2026-03-21" } },
      { start: "2026-01", resourceIds: [] },
    ),
  );
});
test("versions 27/28 preserve bars and persist point styles inside overlapping bars across reopen", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-point-"));
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "db.sqlite"),
  };
  let store = new Store({ env });
  try {
    await store.connect();
    await store.bootstrapUser({
      _id: "test",
      username: "point.test",
      name: "Test",
      role: "admin",
      leaders: [],
      active: true,
      password: await hashPassword("Point-test-only-284!"),
      version: 1,
      revision: 1,
    });
    const user = await store.findUser({ id: "test" });
    await store.mutate(user, (data) => {
      Object.assign(data, fixture());
      delete data.projects[0].milestones[0].displayKind;
    });
    const before = await store.read();
    await store.close();
    const adapter = new SqlJsAdapter(env.SQLJS_FILE);
    await adapter.open();
    await adapter.transaction(async (c) => {
      await c.query(
        "ALTER TABLE kp_project_milestones DROP COLUMN display_kind",
      );
      await c.query(
        "ALTER TABLE kp_project_milestones DROP COLUMN diamond_style",
      );
      await c.query(
        "DELETE FROM kp_schema_migrations WHERE version IN (27,28)",
      );
    });
    await adapter.close();
    store = new Store({ env });
    await store.connect();
    assert.deepEqual(await store.read(), before);
    assert.equal(
      (await store.db.query("SELECT display_kind FROM kp_project_milestones"))
        .rows[0].display_kind,
      "range",
    );
    assert.equal(
      (await store.db.query("SELECT diamond_style FROM kp_project_milestones"))
        .rows[0].diamond_style,
      "solid",
    );
    await store.mutate(user, (data) => {
      data.projects[0].milestones.push({
        ...point(),
        diamondStyle: "outline",
        id: "new",
        additionalRanges: [
          {
            displayKind: "milestone",
            start: "2026-05-01",
            end: "2026-05-01",
            color: "purple",
            diamondStyle: "solid",
            notes: [
              {
                text: "Independent approval",
                includeInReport: true,
                start: "2026-05-01",
                end: "2026-05-01",
              },
            ],
          },
          {
            start: "2026-03-01",
            end: "2026-05-31",
            color: "blue",
            notes: [
              {
                text: "Bar containing both milestones",
                includeInReport: false,
              },
            ],
          },
        ],
      });
    });
    await store.close();
    store = new Store({ env });
    await store.connect();
    const saved = (await store.read()).data.projects[0].milestones[1];
    assert.equal(saved.displayKind, "milestone");
    assert.equal(saved.diamondStyle, "outline");
    assert.equal(saved.additionalRanges[0].diamondStyle, "solid");
    assert.equal(saved.start, saved.end);
    assert.equal(saved.barColor, "green");
    assert.equal(saved.additionalRanges[0].displayKind, "milestone");
    assert.equal(
      saved.additionalRanges[0].notes[0].text,
      "Independent approval",
    );
    assert.equal(saved.additionalRanges[0].color, "purple");
    assert.deepEqual(
      [saved.additionalRanges[1].start, saved.additionalRanges[1].end],
      ["2026-03-01", "2026-05-31"],
    );
    assert.equal(
      (
        await store.db.query(
          "SELECT MAX(version) AS v FROM kp_schema_migrations",
        )
      ).rows[0].v,
      schemaVersion,
    );
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
