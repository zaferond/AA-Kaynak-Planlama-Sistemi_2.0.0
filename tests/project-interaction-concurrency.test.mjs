import test from "node:test";
import assert from "node:assert/strict";
import { captureProjectSnapshot } from "../frontend/src/features/project-snapshot.ts";
import { prepareTimelineChange } from "../frontend/src/features/project-timeline-commands.ts";
import {
  milestoneClipboardColor,
  prepareMilestoneColorPaste,
} from "../frontend/src/features/project-clipboard.ts";
import { milestoneRanges } from "../shared/milestone-ranges.ts";
import { applyChanges } from "../backend/operations.mjs";
import { validate } from "../shared/server-domain.ts";

const admin = { _id: "root-admin", role: "admin", leaders: [] };
const target = { projectId: "p", milestoneId: "m", rangeIndex: 1 };
function fixture() {
  return {
    teams: [{ id: "t", name: "Synthetic team", lead: "L", excelCapacity: 0 }],
    leaders: ["L"],
    resources: [],
    allocations: {},
    revisions: { "project:p": 3 },
    projects: [
      {
        id: "p",
        name: "Synthetic project",
        start: "2026-01",
        end: "2026-12",
        phases: {},
        milestones: [
          {
            id: "m",
            name: "Synthetic heading",
            hasCriticalTopics: true,
            start: "2026-03-01",
            end: "2026-03-05",
            barColor: "blue",
            barStyle: "outline",
            barNotes: [
              {
                text: "First bar",
                includeInReport: true,
                start: "2026-03-01",
                end: "2026-03-05",
              },
            ],
            additionalRanges: [
              {
                start: "2026-04-01",
                end: "2026-04-05",
                color: "red",
                notes: [
                  {
                    text: "Target bar",
                    includeInReport: true,
                    completed: true,
                    start: "2026-04-02",
                    end: "2026-04-04",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
function insertRemoteRange(data) {
  const project = structuredClone(data.projects[0]);
  project.milestones[0].additionalRanges.unshift({
    start: "2026-03-12",
    end: "2026-03-20",
    color: "green",
    notes: [
      {
        text: "Remote inserted bar",
        includeInReport: false,
        start: "2026-03-12",
        end: "2026-03-20",
      },
    ],
  });
  applyChanges(data, admin, [
    { kind: "project", id: project.id, revision: 3, value: project },
  ]);
  validate(data);
}

test("color copy and paste keep the opening target and revision after a remote range insertion", () => {
  const data = fixture();
  const opening = captureProjectSnapshot(data.projects[0], 3);
  const before = structuredClone(opening);
  insertRemoteRange(data);
  assert.equal(milestoneClipboardColor(opening.project, target), "red");
  const command = prepareMilestoneColorPaste(opening, target, "blue");
  assert.equal(command.revision, 3);
  assert.equal(
    milestoneRanges(command.value.milestones[0])[1].start,
    "2026-04-01",
  );
  assert.equal(milestoneRanges(command.value.milestones[0])[1].color, "blue");
  const remote = structuredClone(data);
  assert.throws(
    () => applyChanges(data, admin, [command]),
    (error) => error.status === 409,
  );
  assert.deepEqual(data, remote);
  assert.deepEqual(opening, before);
});

test("bar and weekly note move/start/end commands cannot rebase old indices onto a newer project", () => {
  for (const kind of ["range", "note"]) {
    for (const mode of ["move", "start", "end"]) {
      const data = fixture();
      const opening = captureProjectSnapshot(data.projects[0], 3);
      insertRemoteRange(data);
      const remote = structuredClone(data);
      const command = prepareTimelineChange(opening, "m", {
        target: kind,
        rangeIndex: 1,
        ...(kind === "note" ? { noteIndex: 0 } : {}),
        mode,
        days: mode === "start" ? -1 : 1,
      });
      assert.equal(command.revision, 3);
      assert.equal(milestoneRanges(command.value.milestones[0]).length, 2);
      assert.throws(
        () => applyChanges(data, admin, [command]),
        (error) => error.status === 409,
      );
      assert.deepEqual(data, remote);
      assert.deepEqual(opening.project, fixture().projects[0]);
    }
  }
});

test("removed projects cannot be resurrected by a captured timeline command", () => {
  const data = fixture();
  const opening = captureProjectSnapshot(data.projects[0], 3);
  applyChanges(data, admin, [
    { kind: "project", id: "p", revision: 3, value: null, operation: "delete" },
  ]);
  const deleted = structuredClone(data);
  const command = prepareTimelineChange(opening, "m", {
    target: "range",
    rangeIndex: 1,
    mode: "move",
    days: 1,
  });
  assert.throws(
    () => applyChanges(data, admin, [command]),
    (error) => error.status === 409,
  );
  assert.deepEqual(data, deleted);
});
