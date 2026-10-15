import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";

export async function checkPlannedTeamFreeze(f) {
  await f.store.mutate(f.actor, (data, actor) =>
    applyChanges(
      data,
      actor,
      Array.from({ length: 65 }, (_, i) => ({
        kind: "project",
        id: `freeze-project-${i}`,
        revision: 0,
        value: {
          id: `freeze-project-${i}`,
          name: `Freeze project ${i}`,
          start: "2026-01",
          end: "2026-12",
          phases: {},
          milestones: [],
        },
      })),
    ),
  );
  const { page } = await f.client("root-admin");
  try {
    await page
      .getByRole("tab", { name: "AA Planlanan Kaynak Dağılımı", exact: true })
      .click();
    await page
      .getByRole("tab", { name: "Takım → Projeler", exact: true })
      .click();
    const table = page.locator(
      ".workspace-dock > [data-slot=table-container] > .allocation-grid",
    );
    const container = table.locator("..");
    const firstId = await table
      .locator("[data-planning-group]")
      .first()
      .getAttribute("data-planning-group");
    const heading = table.locator(`[data-planning-group="${firstId}"]`);
    const dimensions = () =>
      table.evaluate((table) => {
        const c = table.parentElement;
        const headBottom = Math.max(
          ...[...table.querySelectorAll("thead th")].map(
            (cell) => cell.getBoundingClientRect().bottom,
          ),
        );
        return { headBottom, left: c.getBoundingClientRect().left };
      });
    async function assertPinned(row) {
      await f.wait(async () => {
        if ((await row.count()) !== 1) return false;
        const { headBottom } = await dimensions();
        const box = await row.boundingBox();
        if (Math.abs(box.y - headBottom) >= 2) return false;
        // Virtual chunks and sticky offsets can settle on adjacent frames.
        // Require both geometry and painting; do not assert between two renders.
        return row.evaluate((row) => {
          const label = row.querySelector(".team-group-label");
          const rect = label.getBoundingClientRect();
          const top = document.elementFromPoint(rect.left + 25, rect.top + 10);
          return row.contains(top);
        });
      }, "team heading pinned below headers and painted above allocation cells");
    }
    await f.check(
      "planning team view: heading persists across virtual chunks and stays fixed horizontally",
      async () => {
        // Deep inside a group: the first 20-row chunk would normally be unmounted.
        await container.evaluate((c) => {
          c.scrollTop = 2400;
        });
        await assertPinned(heading);
        assert(
          (await table.locator(".windowed-table-spacer").count()) > 0,
          "Windowing remains active",
        );
        const width = await container.evaluate((c) => {
          const old = c.style.width;
          c.style.width = "650px";
          c.scrollLeft = 450;
          return old;
        });
        await f.wait(
          async () => await container.evaluate((c) => c.scrollLeft > 0),
          "horizontal scroll active",
        );
        await assertPinned(heading);
        const label = await heading.locator(".team-group-label").boundingBox();
        assert(Math.abs(label.x - (await dimensions()).left) < 15);
        await f.capture(page, "planning-team-freeze");
        await container.evaluate((c, width) => {
          c.style.width = width;
          c.scrollLeft = 0;
        }, width);
      },
    );
    await f.check(
      "planning team view: next team replaces the prior heading",
      async () => {
        // Scroll incrementally so measured virtual chunk heights remain current.
        let nextId;
        for (let i = 0; i < 25; i++) {
          await container.evaluate((c) => {
            c.scrollTop += 300;
          });
          await page.waitForTimeout(40);
          nextId = await table
            .locator("[data-planning-group]")
            .evaluateAll(
              (rows, first) =>
                rows
                  .map((r) => r.dataset.planningGroup)
                  .find((id) => id !== first),
              firstId,
            );
          if (nextId) break;
        }
        assert(nextId, "Next team heading becomes mounted");
        const next = table.locator(`[data-planning-group="${nextId}"]`);
        await next.evaluate((row) => {
          const table = row.closest("table"),
            c = table.parentElement;
          const bottom = Math.max(
            ...[...table.querySelectorAll("thead th")].map(
              (cell) => cell.getBoundingClientRect().bottom,
            ),
          );
          const zoom =
            Number.parseFloat(
              getComputedStyle(document.documentElement).zoom,
            ) || 1;
          c.scrollTop += (row.getBoundingClientRect().top - bottom) / zoom + 5;
        });
        await assertPinned(next);
        if (await heading.count()) {
          const oldBox = await heading.boundingBox(),
            newBox = await next.boundingBox();
          assert(
            oldBox.y + oldBox.height <= newBox.y + 2,
            "Previous heading leaves its group",
          );
        }
        await container.evaluate((c) => {
          c.scrollTop = 0;
        });
        await page
          .getByRole("switch", {
            name: "Gerçekleşen Dağılım Göster",
            exact: true,
          })
          .check();
        await container.evaluate((c) => {
          c.scrollTop = 2400;
        });
        await assertPinned(heading);
      },
    );
  } finally {
    await page.close();
  }
}
