import { schemaVersion } from "../backend/migration-catalog.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { SqlJsAdapter } from "../backend/adapters/sqljs.mjs";
import { migrate, validate } from "../backend/domain/index.mjs";
import {
  addDraftMilestoneRange,
  addMilestoneNote,
  cleanMilestoneRanges,
  CRITICAL_DATE_OVERLAP_MESSAGE,
  milestoneRanges,
  rangeNotes,
  removeDraftMilestoneRange,
  removeMilestoneNote,
  removeMilestoneRange,
  visibleMilestoneBarStyle,
  withMilestoneRanges,
  withoutCriticalTopics,
} from "../frontend/src/milestone-ranges.ts";
import { milestoneBars } from "../frontend/src/milestone-bars.ts";
import { buildProjectInfoReport } from "../frontend/src/project-info-report.ts";

test("project milestones survive add, edit, delete and restart", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-milestones-"));
  const env = {
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "plan.sqlite"),
  };
  const store = new Store({ env });
  try {
    await store.connect();
    const project = {
      id: "milestone_project",
      name: "Test Projesi",
      start: "2026-09",
      end: "2027-08",
      phases: {},
      phaseColors: {},
      milestones: [],
    };
    async function saveProject(next) {
      await store.transaction(async (c) => {
        const { data } = await store.read(c);
        const updated = {
          ...data,
          projects: [...data.projects.filter((p) => p.id !== next.id), next],
        };
        await store.persist(data, validate(updated), c);
      });
    }
    await saveProject(project);
    const milestone = {
      id: "m1",
      name: "Tasarım Onayı",
      start: "2026-11-12",
      end: "2027-02-18",
      barColor: "purple",
      barStyle: "striped",
      barText: "PDR · Onay Bekleniyor",
    };
    await saveProject({ ...project, milestones: [milestone] });
    assert.deepEqual(
      (await store.read()).data.projects.find((p) => p.id === project.id)
        .milestones,
      [milestone],
    );
    const cleared = removeMilestoneNote(milestone, 0, 0);
    await saveProject({ ...project, milestones: [cleared] });
    await store.close();
    await store.connect();
    const reloaded = (await store.read()).data.projects.find(
      (p) => p.id === project.id,
    ).milestones[0];
    assert.deepEqual(rangeNotes(milestoneRanges(reloaded)[0]), []);
    assert.equal(reloaded.barText || "", "");
    await saveProject({ ...project, milestones: [milestone] });
    await assert.rejects(
      () =>
        saveProject({
          ...project,
          milestones: [{ ...milestone, end: "2027-09-01" }],
        }),
      /Kilometre taşı proje dönemi içinde olmalı/,
    );
    await assert.rejects(
      () =>
        saveProject({
          ...project,
          milestones: [{ ...milestone, start: "2026-11-31" }],
        }),
      /Invalid input|Geçersiz gün|validation/i,
    );
    await store.close();
    await store.connect();
    assert.deepEqual(
      (await store.read()).data.projects.find((p) => p.id === project.id)
        .milestones,
      [milestone],
    );
    const multi = {
      ...milestone,
      additionalRanges: [
        {
          start: "2027-03-01",
          end: "2027-03-12",
          description: "Prototip onayı",
          color: "green",
        },
        {
          start: "2027-05-20",
          end: "2027-06-01",
          description: "Son değerlendirme",
          color: "amber",
        },
      ],
    };
    await saveProject({ ...project, milestones: [multi] });
    assert.deepEqual(
      (await store.read()).data.projects.find((p) => p.id === project.id)
        .milestones,
      [multi],
    );
    await assert.rejects(
      () =>
        saveProject({
          ...project,
          milestones: [
            {
              ...milestone,
              additionalRanges: [{ start: "2027-01-01", end: "2027-01-05" }],
            },
          ],
        }),
      (error) => error.message === CRITICAL_DATE_OVERLAP_MESSAGE,
    );
    await assert.rejects(
      () =>
        saveProject({
          ...project,
          milestones: [
            {
              ...milestone,
              additionalRanges: [{ start: "2027-09-01", end: "2027-09-05" }],
            },
          ],
        }),
      /proje dönemi içinde/,
    );
    await assert.rejects(
      () =>
        saveProject({
          ...project,
          milestones: [
            {
              ...milestone,
              additionalRanges: [
                { start: "2027-03-01", end: "2027-03-12", color: "invalid" },
              ],
            },
          ],
        }),
      /Invalid enum value|invalid_enum_value/i,
    );
    const fullRanges = Array.from({ length: 19 }, (_, index) => ({
      start: `2027-03-${String(index + 1).padStart(2, "0")}`,
      end: `2027-03-${String(index + 1).padStart(2, "0")}`,
      description: "x".repeat(200),
      color: "green",
    }));
    await saveProject({
      ...project,
      milestones: [{ ...milestone, additionalRanges: fullRanges }],
    });
    assert.equal(
      (await store.read()).data.projects.find((p) => p.id === project.id)
        .milestones[0].additionalRanges.length,
      19,
    );
    await saveProject({ ...project, milestones: [multi] });
    await store.close();
    await store.connect();
    assert.deepEqual(
      (await store.read()).data.projects.find((p) => p.id === project.id)
        .milestones,
      [multi],
    );
    const noted = {
      ...multi,
      barNotes: [
        { text: "Tasarım başladı", includeInReport: true },
        { text: "Onay bekleniyor", includeInReport: false },
      ],
      additionalRanges: [
        {
          ...multi.additionalRanges[0],
          notes: [
            { text: "Prototip tamamlandı", includeInReport: true },
            { text: "Test sürüyor", includeInReport: true },
          ],
        },
        multi.additionalRanges[1],
      ],
    };
    await saveProject({ ...project, milestones: [noted] });
    await store.close();
    await store.connect();
    assert.deepEqual(
      (await store.read()).data.projects.find((p) => p.id === project.id)
        .milestones,
      [noted],
    );
    const withoutExtraNotes = removeMilestoneNote(
      removeMilestoneNote(noted, 1, 0),
      1,
      0,
    );
    await saveProject({ ...project, milestones: [withoutExtraNotes] });
    await store.close();
    await store.connect();
    const reloadedWithoutExtra = (await store.read()).data.projects.find(
      (p) => p.id === project.id,
    ).milestones[0];
    assert.deepEqual(rangeNotes(milestoneRanges(reloadedWithoutExtra)[1]), []);
    assert.equal(reloadedWithoutExtra.additionalRanges[0].description, "");
    await saveProject({ ...project, milestones: [noted] });
    const longText = "Uzun açıklama ".repeat(1000).trim();
    const lengthy = {
      ...noted,
      barText: longText,
      barNotes: [{ text: longText, includeInReport: true }],
      additionalRanges: [
        {
          ...multi.additionalRanges[0],
          description: longText,
          notes: [{ text: longText, includeInReport: true }],
        },
        multi.additionalRanges[1],
      ],
    };
    await saveProject({ ...project, milestones: [lengthy] });
    await store.close();
    await store.connect();
    assert.deepEqual(
      (await store.read()).data.projects.find((p) => p.id === project.id)
        .milestones,
      [lengthy],
    );
    await assert.rejects(
      () =>
        saveProject({
          ...project,
          milestones: [
            { ...noted, barNotes: [{ text: "", includeInReport: true }] },
          ],
        }),
      /too_small|at least 1|Invalid input/i,
    );
    await saveProject({
      ...project,
      milestones: [
        {
          ...milestone,
          name: "Tasarım Tamamlandı",
          end: "2026-12-09",
          barColor: "green",
          barStyle: "outline",
          barText: "Tamamlandı",
        },
      ],
    });
    assert.equal(
      (await store.read()).data.projects.find((p) => p.id === project.id)
        .milestones[0].name,
      "Tasarım Tamamlandı",
    );
    assert.equal(
      (await store.read()).data.projects.find((p) => p.id === project.id)
        .milestones[0].barText,
      "Tamamlandı",
    );
    assert.equal(
      (await store.read()).data.projects.find((p) => p.id === project.id)
        .milestones[0].barColor,
      "green",
    );
    const oldBackup = structuredClone((await store.read()).data);
    oldBackup.projects.find((p) => p.id === project.id).milestones = [
      { id: "old", name: "Yedek kaydı", start: "2026-11", end: "2026-12" },
    ];
    assert.deepEqual(
      validate(migrate(oldBackup)).projects.find((p) => p.id === project.id)
        .milestones,
      [
        {
          id: "old",
          name: "Yedek kaydı",
          start: "2026-11-01",
          end: "2026-12-31",
          barColor: "red",
          barStyle: "solid",
        },
      ],
    );
    await saveProject(project);
    assert.deepEqual(
      (await store.read()).data.projects.find((p) => p.id === project.id)
        .milestones,
      [],
    );
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("legacy striped bars display as solid while outlined bars remain outlined", () => {
  assert.equal(visibleMilestoneBarStyle("striped"), "solid");
  assert.equal(visibleMilestoneBarStyle("solid"), "solid");
  assert.equal(visibleMilestoneBarStyle("outline"), "outline");
});

test("information without critical topics remains editable and can receive topics later", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-empty-information-"));
  const store = new Store({
    env: { DB_PROVIDER: "sqljs", SQLJS_FILE: path.join(dir, "plan.sqlite") },
  });
  const project = {
    id: "empty_info_project",
    name: "Test Projesi",
    start: "2026-01",
    end: "2026-12",
    phases: {},
    phaseColors: {},
    milestones: [],
  };
  const save = async (milestone) =>
    store.transaction(async (c) => {
      const { data } = await store.read(c);
      await store.persist(
        data,
        validate({
          ...data,
          projects: [
            ...data.projects.filter((item) => item.id !== project.id),
            { ...project, milestones: [milestone] },
          ],
        }),
        c,
      );
    });
  try {
    await store.connect();
    const empty = withoutCriticalTopics({
      id: "info",
      name: "Analizler",
      start: "2026-01-01",
      end: "2026-01-01",
      barColor: "blue",
      barStyle: "solid",
      barText: "",
      barNotes: [],
    });
    await save(empty);
    await store.close();
    await store.connect();
    let saved = (await store.read()).data.projects.find(
      (item) => item.id === project.id,
    ).milestones[0];
    assert.equal(saved.name, "Analizler");
    assert.equal(saved.hasCriticalTopics, false);
    assert.deepEqual(milestoneRanges(saved), []);
    assert.deepEqual(milestoneBars(milestoneRanges(saved), ["2026-01"]), []);
    assert.deepEqual(
      buildProjectInfoReport([{ ...project, milestones: [saved] }]),
      [],
    );
    const topicDraft = addDraftMilestoneRange(saved, project.end, true);
    await save(
      withMilestoneRanges(
        topicDraft,
        cleanMilestoneRanges(milestoneRanges(topicDraft)),
      ),
    );
    await store.close();
    await store.connect();
    saved = (await store.read()).data.projects.find(
      (item) => item.id === project.id,
    ).milestones[0];
    assert.equal(saved.hasCriticalTopics, undefined);
    assert.equal(milestoneRanges(saved).length, 1);
    await save(withoutCriticalTopics(saved));
    await store.close();
    await store.connect();
    saved = (await store.read()).data.projects.find(
      (item) => item.id === project.id,
    ).milestones[0];
    assert.equal(saved.hasCriticalTopics, false);
    assert.deepEqual(milestoneRanges(saved), []);
    const { data } = await store.read();
    assert.throws(() =>
      validate({
        ...data,
        projects: [
          ...data.projects.filter((item) => item.id !== project.id),
          {
            ...project,
            milestones: [
              { ...empty, barNotes: [{ text: "Konu", includeInReport: true }] },
            ],
          },
        ],
      }),
    );
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("existing month milestones become full date ranges during migration", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-milestone-upgrade-"));
  const file = path.join(dir, "plan.sqlite");
  const adapter = new SqlJsAdapter(file);
  try {
    await adapter.open();
    await adapter.transaction(async (c) => {
      await c.batch(
        await fs.readFile("backend/migrations/001_sqljs.sql", "utf8"),
      );
      await c.batch(
        await fs.readFile("backend/migrations/004_sqljs.sql", "utf8"),
      );
      await c.batch(
        "INSERT INTO kp_settings VALUES(1,0,NULL); INSERT INTO kp_projects VALUES('p','Eski Proje','2026-01','2026-12'); INSERT INTO kp_project_milestones VALUES('p','m','Eski kilometre taşı','2026-02','2026-03');",
      );
    });
    await adapter.close();
    const store = new Store({
      env: { DB_PROVIDER: "sqljs", SQLJS_FILE: file },
    });
    try {
      await store.connect();
      assert.equal(
        (
          await store.db.query(
            "SELECT MAX(version) AS v FROM kp_schema_migrations",
          )
        ).rows[0].v,
        schemaVersion,
      );
      assert.deepEqual(
        (await store.read()).data.projects.find((p) => p.id === "p").milestones,
        [
          {
            id: "m",
            name: "Eski kilometre taşı",
            start: "2026-02-01",
            end: "2026-03-31",
            barColor: "red",
            barStyle: "solid",
          },
        ],
      );
    } finally {
      await store.close();
    }
  } finally {
    if (adapter.db) await adapter.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("multiple date ranges form separate bars on one monthly track", () => {
  const milestone = {
    start: "2026-01-01",
    end: "2026-01-05",
    barColor: "purple",
    barText: "İlk açıklama",
    additionalRanges: [
      {
        start: "2026-01-20",
        end: "2026-01-22",
        description: "İkinci açıklama",
        color: "green",
      },
    ],
  };
  const ranges = milestoneRanges(milestone);
  const bars = milestoneBars(ranges, ["2026-01", "2026-02"]);
  assert.equal(bars.length, 2);
  assert.equal(bars[0].range.description, "İlk açıklama");
  assert.equal(bars[1].range.description, "İkinci açıklama");
  assert.equal(bars[0].range.color, "purple");
  assert.equal(bars[1].range.color, "green");
  assert.equal(bars[0].left, 0);
  assert.ok(Math.abs(bars[0].width - (5 / 31 / 2) * 100) < 1e-10);
  assert.ok(Math.abs(bars[1].left - (19 / 31 / 2) * 100) < 1e-10);
  assert.ok(Math.abs(bars[1].width - (3 / 31 / 2) * 100) < 1e-10);
  assert.deepEqual(
    milestoneBars(
      [
        { start: "2025-12-20", end: "2026-01-03" },
        { start: "2026-03-01", end: "2026-03-05" },
      ],
      ["2026-01", "2026-02"],
    ).map((bar) => bar.range),
    [{ start: "2025-12-20", end: "2026-01-03" }],
  );
  assert.deepEqual(withMilestoneRanges(milestone, [ranges[1]]), {
    start: ranges[1].start,
    end: ranges[1].end,
    barColor: "green",
    barText: "İkinci açıklama",
    barNotes: [{ text: "İkinci açıklama", includeInReport: false }],
  });
  assert.deepEqual(rangeNotes(ranges[0]), [
    { text: "İlk açıklama", includeInReport: false },
  ]);
  assert.deepEqual(
    cleanMilestoneRanges([
      {
        ...ranges[0],
        notes: [
          { text: "  Hazır  ", includeInReport: true },
          { text: " ", includeInReport: false },
        ],
      },
    ])[0].notes,
    [{ text: "Hazır", includeInReport: true }],
  );
  const legacy = {
    ...milestone,
    additionalRanges: [{ start: "2026-01-20", end: "2026-01-22" }],
  };
  assert.equal(milestoneRanges(legacy)[1].color, "purple");
  assert.equal(
    withMilestoneRanges(
      legacy,
      milestoneRanges(legacy).map((range, index) =>
        index ? range : { ...range, color: "blue" },
      ),
    ).additionalRanges[0].color,
    "purple",
  );
});

test("deleting descriptions and date ranges updates bars and report topics", () => {
  const milestone = {
    id: "info",
    name: "Analizler",
    start: "2026-02-01",
    end: "2026-02-15",
    barColor: "blue",
    barNotes: [
      {
        text: "İlk açıklama",
        includeInReport: true,
        start: "2026-02-01",
        end: "2026-02-05",
      },
      {
        text: "İkinci açıklama",
        includeInReport: true,
        start: "2026-02-10",
        end: "2026-02-15",
      },
    ],
    additionalRanges: [
      {
        start: "2026-03-01",
        end: "2026-03-10",
        color: "green",
        notes: [
          {
            text: "Üçüncü açıklama",
            includeInReport: true,
            start: "2026-03-01",
            end: "2026-03-10",
          },
        ],
      },
    ],
  };
  const project = {
    id: "p",
    name: "Proje",
    start: "2026-01",
    end: "2026-12",
    phases: {},
    milestones: [milestone],
  };
  const firstRemoved = removeMilestoneNote(milestone, 0, 0);
  assert.deepEqual(
    [firstRemoved.start, firstRemoved.end, firstRemoved.barText],
    ["2026-02-10", "2026-02-15", "İkinci açıklama"],
  );
  assert.deepEqual(
    buildProjectInfoReport([
      { ...project, milestones: [firstRemoved] },
    ])[0].infos[0].topics.map((topic) => topic.text),
    ["İkinci açıklama", "Üçüncü açıklama"],
  );
  const lastMainRemoved = removeMilestoneNote(firstRemoved, 0, 0);
  assert.deepEqual(lastMainRemoved.barNotes, []);
  assert.equal(lastMainRemoved.barText, "");
  assert.deepEqual(
    [lastMainRemoved.start, lastMainRemoved.end],
    ["2026-02-10", "2026-02-15"],
  );
  const allRemoved = removeMilestoneNote(lastMainRemoved, 1, 0);
  assert.deepEqual(
    buildProjectInfoReport([{ ...project, milestones: [allRemoved] }]),
    [],
  );
  assert.deepEqual(
    cleanMilestoneRanges(milestoneRanges(allRemoved)).map(
      (range) => range.notes,
    ),
    [[], []],
  );
  const added = addMilestoneNote(allRemoved, 0);
  assert.deepEqual(added.barNotes, [
    {
      text: "",
      includeInReport: false,
      start: "2026-02-10",
      end: "2026-02-15",
    },
  ]);
  assert.equal(added.barNotes.length, 1);
  const promoted = removeMilestoneRange(milestone, 0);
  assert.deepEqual(
    [promoted.start, promoted.end, promoted.barColor],
    ["2026-03-01", "2026-03-10", "green"],
  );
  assert.deepEqual(promoted.barNotes, milestone.additionalRanges[0].notes);
  assert.equal(promoted.additionalRanges, undefined);
  assert.deepEqual(
    removeMilestoneRange(milestone, 1).barNotes,
    milestone.barNotes,
  );
  const threeRanges = {
    ...milestone,
    additionalRanges: [
      ...milestone.additionalRanges,
      {
        start: "2026-04-01",
        end: "2026-04-05",
        color: "amber",
        notes: [{ text: "Son açıklama", includeInReport: true }],
      },
    ],
  };
  const middleRemoved = removeMilestoneRange(threeRanges, 1);
  assert.deepEqual(
    middleRemoved.additionalRanges?.map((range) => [
      range.start,
      range.end,
      range.color,
    ]),
    [["2026-04-01", "2026-04-05", "amber"]],
  );
  assert.deepEqual(
    middleRemoved.additionalRanges?.[0].notes,
    threeRanges.additionalRanges[1].notes,
  );
  assert.throws(() => removeMilestoneRange(promoted, 0), /Son tarih aralığını/);
  assert.throws(
    () => removeMilestoneNote(allRemoved, 0, 0),
    /Açıklama bulunamadı/,
  );
});

test("a new information draft starts without a bar and the final critical topic can be removed", () => {
  const initial = {
    id: "draft",
    name: "Analizler",
    start: "2026-01-01",
    end: "2026-01-01",
    barColor: "blue",
    barText: "",
  };
  const first = addDraftMilestoneRange(initial, "2026-12", true);
  assert.deepEqual([first.start, first.end], ["2026-01-01", "2026-01-01"]);
  assert.deepEqual(first.barNotes, [{ text: "", includeInReport: false }]);
  const second = addDraftMilestoneRange(first, "2026-12", false);
  assert.deepEqual(
    [second.additionalRanges[0].start, second.additionalRanges[0].end],
    ["2026-01-02", "2026-01-02"],
  );
  const afterSecondRemoval = removeDraftMilestoneRange(second, 1);
  assert.equal(afterSecondRemoval.isEmpty, false);
  assert.equal(afterSecondRemoval.value.additionalRanges, undefined);
  const afterLastRemoval = removeDraftMilestoneRange(
    afterSecondRemoval.value,
    0,
  );
  assert.equal(afterLastRemoval.isEmpty, true);
  const previouslyFilled = {
    ...first,
    barText: "Eski açıklama",
    barNotes: [{ text: "Eski açıklama", includeInReport: true }],
  };
  const cleared = removeDraftMilestoneRange(previouslyFilled, 0);
  const readded = addDraftMilestoneRange(
    cleared.value,
    "2026-12",
    cleared.isEmpty,
  );
  assert.deepEqual(readded.barNotes, [{ text: "", includeInReport: false }]);
  assert.throws(
    () => removeDraftMilestoneRange(first, 1),
    /Tarih aralığı bulunamadı/,
  );
});
