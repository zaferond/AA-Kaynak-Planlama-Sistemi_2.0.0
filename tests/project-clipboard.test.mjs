import test from "node:test";
import { captureProjectSnapshot } from "../frontend/src/features/project-snapshot.ts";
const snapshot = (data) =>
  captureProjectSnapshot(
    data.projects[1],
    data.revisions["project:" + data.projects[1].id] || 0,
  );
import assert from "node:assert/strict";
import {
  phaseClipboard,
  milestoneClipboardColor,
  preparePhasePaste,
  prepareMilestoneColorPaste,
} from "../frontend/src/features/project-clipboard.ts";
import { phaseColor, phaseStyle } from "../shared/model.ts";
import { milestoneRanges } from "../shared/milestone-ranges.ts";
import { applyChanges } from "../backend/operations.mjs";
import { validate } from "../shared/server-domain.ts";
const admin = { _id: "root-admin", role: "admin", leaders: [] };
const target = { projectId: "target", month: "2026-10" };
const barTarget = { projectId: "target", milestoneId: "m", rangeIndex: 1 };
const fixture = () => ({
  teams: [{ id: "t", name: "Takım", lead: "L", excelCapacity: 0 }],
  leaders: ["L"],
  resources: [],
  allocations: {},
  revisions: { "project:target": 3 },
  projects: [
    {
      id: "source",
      name: "Kaynak",
      start: "2026-01",
      end: "2026-12",
      phases: { "2026-10": "Analiz" },
      phaseColors: { "2026-10": "green" },
    },
    {
      id: "target",
      name: "Hedef",
      responsibleName: "Sorumlu",
      start: "2026-01",
      end: "2026-12",
      phases: { "2026-10": "Eski metin", "2026-11": "Diğer ay" },
      phaseColors: { "2026-10": "amber", "2026-11": "blue" },
      milestones: [
        {
          id: "m",
          name: "Kritik konu",
          start: "2026-10-01",
          end: "2026-10-05",
          barColor: "red",
          barStyle: "outline",
          barNotes: [
            {
              text: "Birinci",
              includeInReport: true,
              completed: true,
              start: "2026-10-02",
              end: "2026-10-04",
            },
          ],
          additionalRanges: [
            {
              start: "2026-10-15",
              end: "2026-10-20",
              color: "amber",
              notes: [
                {
                  text: "İkinci",
                  includeInReport: true,
                  start: "2026-10-16",
                  end: "2026-10-19",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});
function savePhase(data, content) {
  const before = structuredClone(data);
  const command = preparePhasePaste(data, target, content);
  assert.deepEqual(data, before);
  applyChanges(data, admin, [command]);
  validate(data);
  assert.deepEqual(data.projects[0], before.projects[0]);
  assert.deepEqual(data.projects[1].milestones, before.projects[1].milestones);
  assert.equal(data.projects[1].responsibleName, "Sorumlu");
  assert.equal(data.projects[1].phases["2026-11"], "Diğer ay");
  assert.equal(data.projects[1].phaseColors["2026-11"], "blue");
  return command;
}
test("text-only paste retains target color and unrelated current project data", () => {
  const data = fixture();
  savePhase(data, {
    kind: "text",
    text: phaseClipboard(data.projects[0], target.month).text,
  });
  assert.equal(data.projects[1].phases[target.month], "Analiz");
  assert.equal(data.projects[1].phaseColors[target.month], "amber");
});
test("color-only paste retains target text", () => {
  const data = fixture();
  savePhase(data, {
    kind: "color",
    color: phaseClipboard(data.projects[0], target.month).color,
  });
  assert.equal(data.projects[1].phases[target.month], "Eski metin");
  assert.equal(data.projects[1].phaseColors[target.month], "green");
});
test("combined paste copies text and color, including a deliberately empty phase", () => {
  const data = fixture();
  savePhase(data, {
    kind: "bundle",
    ...phaseClipboard(data.projects[0], target.month),
  });
  assert.equal(data.projects[1].phases[target.month], "Analiz");
  assert.equal(data.projects[1].phaseColors[target.month], "green");
  savePhase(data, {
    kind: "bundle",
    ...phaseClipboard(data.projects[0], "2026-09"),
  });
  assert.equal(data.projects[1].phases[target.month], "");
  assert.equal(data.projects[1].phaseColors[target.month], "gray");
});
test("copied default phase colors match the color rendered in the table", () => {
  for (const [text, explicit, expected] of [
    ["", undefined, "gray"],
    ["   ", undefined, "gray"],
    ["ÇALIŞMA YOK", undefined, "gray"],
    ["Analiz", undefined, "blue"],
    ["", "purple", "purple"],
  ]) {
    const project = {
      ...fixture().projects[0],
      phases: { "2026-10": text },
      phaseColors: explicit ? { "2026-10": explicit } : {},
    };
    assert.equal(phaseClipboard(project, target.month).color, expected);
    assert.equal(
      phaseStyle(project, target.month).background,
      phaseColor(project, target.month).bg,
    );
  }
});
test("bar color paste updates only the selected date range and preserves note dates and flags", () => {
  const data = fixture();
  const before = structuredClone(data);
  const ranges = milestoneRanges(data.projects[1].milestones[0]);
  assert.equal(milestoneClipboardColor(data.projects[1], barTarget), "amber");
  const command = prepareMilestoneColorPaste(
    snapshot(data),
    barTarget,
    "green",
  );
  assert.deepEqual(data, before);
  applyChanges(data, admin, [command]);
  validate(data);
  const changed = milestoneRanges(data.projects[1].milestones[0]);
  const visibleRange = ({ start, end, notes, color }) => ({
    start,
    end,
    notes,
    color,
  });
  assert.deepEqual(visibleRange(changed[0]), visibleRange(ranges[0]));
  assert.deepEqual(visibleRange(changed[1]), {
    ...visibleRange(ranges[1]),
    color: "green",
  });
  assert.equal(data.projects[1].milestones[0].barStyle, "outline");
});
test("invalid paste targets and colors fail explicitly without modifying source data", () => {
  const data = fixture();
  const before = structuredClone(data);
  for (const patch of [
    { month: "2025-12" },
    { month: "2026-13" },
    { projectId: "missing" },
  ])
    assert.throws(() =>
      preparePhasePaste(
        data,
        { ...target, ...patch },
        { kind: "text", text: "Yeni" },
      ),
    );
  assert.throws(
    () => preparePhasePaste(data, target, { kind: "color", color: "missing" }),
    /Geçersiz renk/,
  );
  for (const rangeIndex of [-1, 4, 0.5]) {
    assert.throws(
      () =>
        prepareMilestoneColorPaste(
          snapshot(data),
          { ...barTarget, rangeIndex },
          "green",
        ),
      /tarih aralığı bulunamadı/,
    );
    assert.throws(
      () =>
        milestoneClipboardColor(data.projects[1], { ...barTarget, rangeIndex }),
      /tarih aralığı bulunamadı/,
    );
  }
  assert.throws(
    () =>
      prepareMilestoneColorPaste(
        snapshot(data),
        { ...barTarget, milestoneId: "missing" },
        "green",
      ),
    /Kritik konu bulunamadı/,
  );
  assert.deepEqual(data, before);
});
test("clipboard commands retain server permission and revision protections", () => {
  const data = fixture();
  const command = preparePhasePaste(data, target, {
    kind: "text",
    text: "Yeni",
  });
  assert.equal(command.revision, 3);
  assert.throws(
    () =>
      applyChanges(
        structuredClone(data),
        { _id: "reader", role: "normal", leaders: [] },
        [command],
      ),
    (error) => error.status === 403,
  );
  applyChanges(data, admin, [command]);
  assert.throws(
    () => applyChanges(data, admin, [command]),
    (error) => error.status === 409,
  );
});
