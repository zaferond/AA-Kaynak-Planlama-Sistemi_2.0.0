import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";
import { milestoneRanges } from "../../shared/milestone-ranges.ts";
import { dateLabel } from "../../frontend/src/features/timeline-labels.ts";

async function pointIsOnTop(point) {
  return point.evaluate((point) => {
    const rect = point.getBoundingClientRect();
    const top = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return top === point || point.contains(top);
  });
}

export async function checkMilestoneOverlap(f) {
  const original = (await f.state()).projects.find((p) => p.id === "p-a");
  async function projectWith(value) {
    const state = await f.state();
    await f.store.mutate(f.actor, (d, u) =>
      applyChanges(d, u, [
        {
          kind: "project",
          id: original.id,
          revision: state.revisions["project:" + original.id],
          value,
        },
      ]),
    );
  }
  try {
    for (const weekly of [false, true]) {
      for (const movePoint of [true, false]) {
        await projectWith({
          ...original,
          milestones: [
            {
              id: "overlap-topic",
              name: "Synthetic overlap topic",
              start: "2026-03-01",
              end: "2026-03-20",
              barStyle: "solid",
              barColor: "blue",
              barNotes: [
                {
                  text: "Synthetic duration bar",
                  includeInReport: true,
                  start: "2026-03-01",
                  end: "2026-03-20",
                },
              ],
              additionalRanges: [
                {
                  displayKind: "milestone",
                  diamondStyle: "solid",
                  start: "2026-04-10",
                  end: "2026-04-10",
                  color: "red",
                  notes: [{ text: "Synthetic point", includeInReport: true }],
                },
              ],
            },
          ],
        });
        const client = await f.client("root-admin");
        const { page } = client;
        async function openTimeline() {
          await page
            .getByRole("tab", { name: /AA Mühendislik.*Projeler/ })
            .click();
          await page
            .getByRole("switch", { name: "Detayları Göster", exact: true })
            .check();
          await page
            .getByRole("switch", {
              name: "Haftalık proje görünümü",
              exact: true,
            })
            .setChecked(weekly);
        }
        try {
          await openTimeline();
          const row = page
            .locator('[data-project-group="p-a"] .milestone-row')
            .first();
          const point = row.locator(".milestone-point");
          const bar = row
            .locator(weekly ? ".weekly-note-box" : ".gantt-bar")
            .first();
          await point.scrollIntoViewIfNeeded();
          await f.check(
            `projects: ${weekly ? "weekly" : "monthly"} ${movePoint ? "point onto bar" : "bar onto point"} saves through HTTP, survives reload and keeps the point on top`,
            async () => {
              const pointBox = await point.boundingBox();
              const barBox = await bar.boundingBox();
              assert(pointBox && barBox);
              const source = movePoint ? pointBox : barBox;
              const target = movePoint ? barBox : pointBox;
              const y = source.y + source.height / 2;
              await page.mouse.move(source.x + source.width / 2, y);
              await page.mouse.down();
              await page.waitForTimeout(420);
              await page.mouse.move(target.x + target.width / 2, y, {
                steps: 10,
              });
              await page.locator(".gantt-drag-status:not(.invalid)").waitFor();
              const previewPointOnTop = await pointIsOnTop(point);
              const saved = page.waitForResponse((r) =>
                r.url().endsWith("/api/changes"),
              );
              await page.mouse.up();
              const response = await saved;
              assert.equal(response.status(), 200);
              const persisted = (await f.state()).projects.find(
                (p) => p.id === "p-a",
              );
              const ranges = milestoneRanges(persisted.milestones[0]);
              const savedPoint = ranges.find(
                (r) => r.displayKind === "milestone",
              );
              const savedBar = ranges.find(
                (r) => r.displayKind !== "milestone",
              );
              assert(savedPoint && savedBar);
              assert(
                savedBar.start <= savedPoint.start &&
                  savedPoint.end <= savedBar.end,
              );
              assert.equal(savedPoint.start, savedPoint.end);
              if (movePoint) assert.notEqual(savedPoint.start, "2026-04-10");
              else assert.equal(savedPoint.start, "2026-04-10");
              await page.reload();
              await openTimeline();
              await point.scrollIntoViewIfNeeded();
              assert(
                (await point.getAttribute("aria-label")).includes(
                  dateLabel(savedPoint.start),
                ),
                "The persisted milestone date is missing after reload",
              );
              // Force coincident centers to exercise hover/drag paint order independently of collision lanes.
              const originalTop = await point.evaluate(
                (point, top) => {
                  const before = point.style.top;
                  point.style.top = top;
                  return before;
                },
                await bar.evaluate((bar) => bar.style.top),
              );
              try {
                assert(
                  await pointIsOnTop(point),
                  "Milestone is behind the idle bar",
                );
                await bar.hover({ position: { x: 12, y: 10 } });
                assert(
                  await pointIsOnTop(point),
                  "Milestone is behind the hovered bar",
                );
                await bar.evaluate((bar) => bar.classList.add("dragging"));
                assert(
                  await pointIsOnTop(point),
                  "Milestone is behind the dragged bar",
                );
              } finally {
                await bar.evaluate((bar) => bar.classList.remove("dragging"));
                await point.evaluate(
                  (point, top) => (point.style.top = top),
                  originalTop,
                );
              }
              assert(
                previewPointOnTop,
                "Milestone is behind the bar during the actual drag preview",
              );
            },
          );
        } catch (error) {
          await page.mouse.up();
          await f.capture(page, "milestone-overlap-failed");
          throw error;
        } finally {
          await client.context.close();
        }
      }
    }
  } finally {
    await projectWith(original);
  }
}
