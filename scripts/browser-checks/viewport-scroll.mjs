import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";

export async function checkViewportScroll(f) {
  await f.store.mutate(f.actor, (data, actor) =>
    applyChanges(
      data,
      actor,
      Array.from({ length: 260 }, (_, i) => ({
        kind: "project",
        id: "qa-viewport-" + i,
        revision: 0,
        value: {
          id: "qa-viewport-" + i,
          name: "Synthetic viewport project " + i,
          start: "2026-01",
          end: "2026-12",
          phases: { "2026-01": "Design" },
          milestones: [],
        },
      })),
    ),
  );
  const orderedProjects = (await f.state()).projects;
  const totalProjects = orderedProjects.length;
  const finalProjectId = orderedProjects.at(-1).id;
  const { page, context } = await f.client("root-admin");
  async function checkHeaders(table) {
    await table.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const headers = await table.evaluate((container) => {
      const cr = container.getBoundingClientRect();
      return [...container.querySelectorAll("thead th")]
        .filter((cell) => {
          const r = cell.getBoundingClientRect();
          return r.right > cr.left && r.left < cr.right;
        })
        .map((cell) => {
          const r = cell.getBoundingClientRect();
          const x =
            Math.max(cr.left, r.left) +
            Math.min(
              (Math.min(cr.right, r.right) - Math.max(cr.left, r.left)) / 2,
              8,
            );
          const top = document.elementFromPoint(x, r.top + r.height / 2);
          return {
            inside: r.top >= cr.top - 2 && r.bottom <= cr.bottom,
            painted: cell === top || cell.contains(top),
          };
        });
    });
    assert(headers.length > 0);
    assert(
      headers.every((h) => h.inside && h.painted),
      JSON.stringify(headers),
    );
  }
  async function checkScroll() {
    const panel = page.locator(".workspace-dock");
    const table = panel.locator(':scope > [data-slot="table-container"]');
    await page.evaluate(() => window.scrollTo(0, 1e8));
    await f.wait(async () => {
      const top = await panel
        .locator(".capacitystrip")
        .first()
        .evaluate((el) => el.getBoundingClientRect().top);
      return top >= -3 && top <= 4;
    }, "page ends at filter summary");
    const placement = await panel.evaluate((el) => {
      const summary = el
        .querySelector(":scope > .capacitystrip")
        .getBoundingClientRect();
      const options = el
        .querySelector(":scope > .workspace-view-options")
        .getBoundingClientRect();
      const grid = el
        .querySelector(':scope > [data-slot="table-container"]')
        .getBoundingClientRect();
      return {
        afterSummary: options.top >= summary.bottom - 1,
        beforeGrid: options.bottom <= grid.top + 1,
        height: options.height,
      };
    });
    assert(
      placement.afterSummary && placement.beforeGrid && placement.height <= 36,
      JSON.stringify(placement),
    );
    assert.equal(
      await page.locator(".planning-filterbar [role=switch]").count(),
      0,
    );
    const scroll = await page.evaluate(() => scrollY);
    assert(await table.evaluate((el) => el.scrollHeight > el.clientHeight));
    await table.hover();
    await page.mouse.wheel(0, 600);
    await f.wait(
      async () => (await table.evaluate((el) => el.scrollTop)) > 0,
      "table scrolls independently",
    );
    assert(Math.abs((await page.evaluate(() => scrollY)) - scroll) <= 2);
    await table.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.mouse.wheel(0, 3000);
    await checkHeaders(table);
    assert(Math.abs((await page.evaluate(() => scrollY)) - scroll) <= 2);
    // wheel() returns before Chromium's compositor finishes the gesture. Let
    // that downward gesture end before resetting the DOM scroll position and
    // testing a separate upward gesture; otherwise its pending delta can race.
    await page.waitForTimeout(300);
    await table.evaluate((el) => {
      el.scrollTop = 0;
    });
    // The virtual rows and compositor must paint the reset before hit testing
    // the next wheel event; a DOM scrollTop read alone is not a paint barrier.
    await checkHeaders(table);
    const left = await table.evaluate((el) => el.scrollLeft);
    await table.hover();
    await page.mouse.wheel(0, -600);
    await f.wait(
      async () => (await page.evaluate(() => scrollY)) < scroll - 20,
      "upward wheel at table top continues on the page",
    );
    // Also finish the upward gesture before the next programmatic page reset.
    await page.waitForTimeout(300);
    assert.equal(await table.evaluate((el) => el.scrollTop), 0);
    assert.equal(await table.evaluate((el) => el.scrollLeft), left);
    await page.evaluate(() => window.scrollTo(0, 1e8));
  }
  try {
    for (const [tab, screenshot] of [
      ["AA Planlanan Kaynak Dağılımı", "plan"],
      ["AA Mühendislik Liderliği Projeler", "projects"],
    ]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await f.check(
        "viewport: " +
          screenshot +
          " page bounds and table scrolling at 90 percent scale",
        async () => {
          await checkScroll();
          // Let the compositor finish the native wheel gesture before visual capture.
          await page.waitForTimeout(150);
          await f.capture(page, "viewport-" + screenshot);
          await page.setViewportSize({ width: 1000, height: 720 });
          await checkScroll();
          await page.setViewportSize({ width: 1800, height: 1050 });
        },
      );
      if (screenshot === "plan") {
        await f.check(
          "planning: compact in-panel actual-distribution switch toggles actual rows",
          async () => {
            const toggle = page
              .locator(".workspace-view-options")
              .getByRole("switch", {
                name: "Gerçekleşen Dağılım Göster",
                exact: true,
              });
            await toggle.check();
            assert(
              (await page.locator(".workspace-dock .actual-row").count()) > 0,
            );
            await checkScroll();
            await toggle.uncheck();
            assert.equal(
              await page.locator(".workspace-dock .actual-row").count(),
              0,
            );
          },
        );
        await f.check(
          "planning: unsaved focused input remains mounted while scrolling and Escape cancels",
          async () => {
            const scroll = page.locator(
              '.workspace-dock > [data-slot="table-container"]',
            );
            await scroll.evaluate((el) => {
              el.scrollTop = 0;
            });
            const input = page
              .locator(
                '.workspace-dock > [data-slot="table-container"] .cell input:not(:disabled)',
              )
              .first();
            const label = await input.getAttribute("aria-label");
            const stable = page.getByRole("textbox", {
              name: label,
              exact: true,
            });
            const old = await stable.inputValue();
            await stable.fill("0,123");
            await scroll.evaluate((el) => {
              el.scrollTop = el.scrollHeight;
            });
            await f.wait(
              async () => (await scroll.evaluate((el) => el.scrollTop)) > 1000,
              "scroll reaches later projects",
            );
            assert.equal(await stable.inputValue(), "0,123");
            await page.keyboard.press("Escape");
            await scroll.evaluate((el) => {
              el.scrollTop = 0;
            });
            assert.equal(await stable.inputValue(), old);
          },
        );
        await f.check(
          "viewport: summary disclosure and grouping retain the page boundary",
          async () => {
            await page.locator(".capacitystrip > summary").click();
            await checkScroll();
            await page
              .getByRole("tab", { name: "Takım → Projeler", exact: true })
              .click();
            await checkScroll();
          },
        );
      } else {
        await f.check(
          "projects: compact detail controls and simplified filter summary heading",
          async () => {
            assert.equal(
              await page
                .locator(".project-filter-summary .capacitystrip-copy > strong")
                .innerText(),
              "Filtrelenen Projeler",
            );
            const toggle = page
              .locator(".workspace-view-options")
              .getByRole("switch", { name: "Detayları Göster", exact: true });
            await toggle.check();
            assert.equal(
              await page
                .locator(".projectmatrix .project-expand")
                .first()
                .getAttribute("aria-expanded"),
              "true",
            );
            await checkScroll();
            await toggle.uncheck();
            assert.equal(
              await page
                .locator(".projectmatrix .project-expand")
                .first()
                .getAttribute("aria-expanded"),
              "false",
            );
          },
        );
        await f.check(
          "projects: all records reachable in one windowed table, no page limit or usage hint",
          async () => {
            const rows = page.locator(
              ".projectmatrix tbody[data-project-group]",
            );
            assert((await rows.count()) < 100);
            assert.equal(
              await page.locator(".workspace-dock .pager").count(),
              0,
            );
            assert.match(
              await page.locator(".workspace-record-count").innerText(),
              new RegExp(totalProjects + " proje"),
            );
            assert.equal(
              await page.locator(".phase-selection-hint").count(),
              0,
            );
            const scroll = page.locator(
              '.workspace-dock > [data-slot="table-container"]',
            );
            const expanded = page.locator(
              '.projectmatrix tbody[data-project-group="p-a"] .project-expand',
            );
            await scroll.evaluate((el) => {
              el.scrollTop = 0;
            });
            await expanded.click();
            assert.equal(await expanded.getAttribute("aria-expanded"), "true");
            await page.evaluate(() => document.activeElement?.blur());
            await scroll.evaluate((el) => {
              el.scrollTop = el.scrollHeight;
            });
            await page
              .locator(
                `.projectmatrix tbody[data-project-group="${finalProjectId}"]`,
              )
              .waitFor();
            assert((await rows.count()) < 100);
            assert.equal(
              await page
                .locator('.projectmatrix tbody[data-project-group="p-a"]')
                .count(),
              0,
            );
            await scroll.evaluate((el) => {
              el.scrollTop = 0;
            });
            await page
              .locator('.projectmatrix tbody[data-project-group="p-a"]')
              .waitFor();
            assert.equal(await expanded.getAttribute("aria-expanded"), "true");
            await expanded.click();
          },
        );
        await f.check(
          "viewport: project filter labels reflect selection, dates and weekly view",
          async () => {
            await page.evaluate(() => window.scrollTo(0, 0));
            await page
              .getByRole("switch", {
                name: "Haftalık proje görünümü",
                exact: true,
              })
              .click();
            assert.match(
              await page.locator(".project-filter-summary").innerText(),
              /Haftalık/,
            );
            await checkScroll();
            await page.evaluate(() => window.scrollTo(0, 0));
            await page
              .getByRole("button", { name: "Proje", exact: true })
              .click();
            const picker = page.locator('.pickerpanel[data-state="open"]');
            await picker
              .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
              .click();
            await picker
              .getByRole("checkbox", {
                name: "Synthetic viewport project 0",
                exact: true,
              })
              .check();
            await page.keyboard.press("Escape");
            const summary = page.locator(".project-filter-summary");
            assert.match(
              await summary.innerText(),
              /Synthetic viewport project 0/,
            );
            assert.equal(
              await summary.getByText("Liderlik", { exact: true }).count(),
              0,
            );
            await page
              .locator('.planning-filterbar input[type="month"]')
              .fill("2026-03");
            assert.match(await summary.innerText(), /Mar 2026/);
            await page.evaluate(() => window.scrollTo(0, 1e8));
            await f.wait(async () => {
              await page.evaluate(() => window.scrollTo(0, 1e8));
              return Math.abs((await summary.boundingBox()).y) <= 4;
            }, "filtered summary remains the page boundary after layout settles");
          },
        );
      }
    }
    const actual = await f.client("employee");
    try {
      await actual.page
        .getByRole("tab", {
          name: "AA Gerçekleşen Kaynak Dağılımı",
          exact: true,
        })
        .click();
      await f.check(
        "actual: upward wheel at table top continues on the page",
        async () => {
          const table = actual.page.locator(
            '.person-allocation > [data-slot="table-container"]',
          );
          await table.waitFor();
          await actual.page.evaluate(() => window.scrollTo(0, 1e8));
          await table.hover();
          const before = await actual.page.evaluate(() => scrollY);
          assert(before > 20, "actual page must be scrolled before the check");
          assert(
            await table.evaluate((el) => el.scrollHeight > el.clientHeight),
          );
          await table.evaluate((el) => {
            el.scrollTop = 0;
          });
          await actual.page.mouse.wheel(0, -600);
          await f.wait(
            async () =>
              (await actual.page.evaluate(() => scrollY)) < before - 20,
            "actual page resumes upward scrolling",
          );
          assert.equal(await table.evaluate((el) => el.scrollTop), 0);
        },
      );
    } finally {
      await actual.context.close();
    }
  } finally {
    await context.close();
  }
}
