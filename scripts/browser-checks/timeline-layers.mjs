import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";

// Hit testing verifies the painted stacking order, not just CSS z-index values.
async function coveredByFrozenLabel(page, row, item) {
  const container = page.locator(".projectmatrix").locator("..");
  await container.evaluate((c) => {
    c.style.width = "650px";
    c.scrollLeft = 0;
    c.scrollTop = 0;
  });
  await item.waitFor();
  const target = await row.locator("td").first().boundingBox();
  const box = await item.boundingBox();
  assert(target && box);
  const x = target.x + target.width - 20;
  await container.evaluate(
    (c, amount) => {
      const zoom =
        Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      c.scrollLeft = amount / zoom;
    },
    box.x + box.width / 2 - x,
  );
  await page.waitForTimeout(60);
  const result = await row.evaluate((row) => {
    const label = row.cells[0],
      rect = label.getBoundingClientRect();
    const item = row.querySelector("[data-layer-probe]"),
      ir = item.getBoundingClientRect();
    const x = rect.right - 20,
      y = ir.top + ir.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      covered: top === label || label.contains(top),
      intersects: ir.left <= x && x <= ir.right,
      top: top?.className,
      scrollLeft: row.closest("table").parentElement.scrollLeft,
    };
  });
  assert(result.scrollLeft > 0 && result.intersects, JSON.stringify(result));
  assert(
    result.covered,
    "Timeline item paints over the frozen label: " + JSON.stringify(result),
  );
  // The visible part must remain interactive, including its resize handles.
  await container.evaluate(
    (c, x) => {
      const item = c.querySelector("[data-layer-probe]"),
        rect = item.getBoundingClientRect();
      const zoom =
        Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      c.scrollLeft += (rect.left + rect.width / 2 - x) / zoom;
    },
    target.x + target.width + 30,
  );
  await page.waitForTimeout(60);
  assert(
    await item.evaluate((item) => {
      const rect = item.getBoundingClientRect();
      const top = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      return item === top || item.contains(top);
    }),
  );
}

export async function checkTimelineLayers(f) {
  const state = await f.state(),
    project = state.projects.find((p) => p.id === "p-a");
  assert(project);
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(d, u, [
      {
        kind: "project",
        id: project.id,
        revision: state.revisions["project:" + project.id],
        value: {
          ...project,
          milestones: [
            {
              id: "layer-heading",
              name: "Layer test heading",
              start: "2026-03-01",
              end: "2026-03-20",
              barStyle: "outline",
              barColor: "blue",
              barNotes: [
                {
                  text: "Layer test note",
                  includeInReport: true,
                  start: "2026-03-01",
                  end: "2026-03-20",
                },
              ],
              additionalRanges: [
                {
                  displayKind: "milestone",
                  diamondStyle: "outline",
                  start: "2026-04-10",
                  end: "2026-04-10",
                  color: "red",
                  notes: [{ text: "Layer milestone", includeInReport: true }],
                },
              ],
            },
          ],
        },
      },
    ]),
  );
  const { page } = await f.client("root-admin");
  try {
    await page
      .getByRole("tab", {
        name: "AA Mühendislik Liderliği Projeler",
        exact: true,
      })
      .click();
    await f.check(
      "projects: selected and keyboard-focused phases stay behind frozen labels in monthly and weekly views",
      async () => {
        const heading = page.locator('[data-project-heading="p-a"]');
        for (const weekly of [false, true]) {
          await page
            .getByRole("switch", {
              name: "Haftalık proje görünümü",
              exact: true,
            })
            .setChecked(weekly);
          const phase = heading
            .locator('td[data-phase-cell="p-a|2026-01"] .phasebutton')
            .first();
          await page
            .locator(".projectmatrix")
            .locator("..")
            .evaluate((c) => {
              c.scrollLeft = 0;
              c.scrollTop = 0;
            });
          await phase.click();
          assert.equal(await phase.getAttribute("aria-pressed"), "true");
          await phase.evaluate((el) => el.setAttribute("data-layer-probe", ""));
          await coveredByFrozenLabel(page, heading, phase);
          assert.equal(await phase.getAttribute("aria-pressed"), "true");
          await phase.focus();
          await coveredByFrozenLabel(page, heading, phase);
          await phase.evaluate((el) => el.removeAttribute("data-layer-probe"));
          await heading.locator(".project-expand").focus();
          assert.equal(
            await heading
              .locator("td")
              .first()
              .evaluate((el) => getComputedStyle(el).position),
            "sticky",
          );
        }
        await page
          .getByRole("switch", { name: "Haftalık proje görünümü", exact: true })
          .uncheck();
      },
    );
    await page
      .getByRole("switch", { name: "Detayları Göster", exact: true })
      .check();
    const row = page
      .locator('[data-project-group="p-a"] .milestone-row')
      .first();
    for (const weekly of [false, true]) {
      await page
        .getByRole("switch", { name: "Haftalık proje görünümü", exact: true })
        .setChecked(weekly);
      await f.check(
        `projects: ${weekly ? "weekly notes" : "monthly bars"} and diamonds stay behind frozen labels, including hover/drag/resize layers`,
        async () => {
          for (const selector of [
            weekly ? ".weekly-note-box" : ".gantt-bar",
            ".milestone-point",
          ]) {
            const item = row.locator(selector).first();
            await item.evaluate((item) =>
              item.setAttribute("data-layer-probe", ""),
            );
            for (const active of [false, true]) {
              if (active)
                await item.evaluate((item) => item.classList.add("dragging"));
              await coveredByFrozenLabel(page, row, item);
            }
            await item.evaluate((item) => {
              item.classList.remove("dragging");
              item.removeAttribute("data-layer-probe");
            });
          }
          // Check the right/left resize handle where its higher local z-index used to escape the timeline cell.
          const bar = row
            .locator(weekly ? ".weekly-note-box" : ".gantt-bar")
            .first();
          const handle = bar.locator(
            weekly ? ".weekly-note-resize.start" : ".gantt-resize-handle.start",
          );
          await handle.evaluate((item) =>
            item.setAttribute("data-layer-probe", ""),
          );
          await coveredByFrozenLabel(page, row, handle);
          await handle.evaluate((item) =>
            item.removeAttribute("data-layer-probe"),
          );
          await f.capture(
            page,
            weekly ? "weekly-timeline-layers" : "monthly-timeline-layers",
          );
        },
      );
    }
  } catch (error) {
    await f.capture(page, "timeline-layers-failed");
    throw error;
  } finally {
    await page.close();
  }
}
