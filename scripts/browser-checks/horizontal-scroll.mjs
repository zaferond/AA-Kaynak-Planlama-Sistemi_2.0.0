import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { selectWorkspaceTab } from "./fixture.mjs";
import { applyChanges } from "../../backend/operations.mjs";

// Count expensive DOM work rather than asserting machine-dependent frame times.
// Instrumentation is scoped to disposable synthetic pages and restored in finally.
export async function measureHorizontalScroll(container) {
  return container.evaluate(async (container) => {
    const table = container.querySelector("table");
    const marker = container.querySelector(".today-date-line");
    const markerLeft = marker?.style.left;
    let rectReads = 0,
      windowQueries = 0,
      stickyWrites = 0;
    const rect = Element.prototype.getBoundingClientRect;
    const query = Element.prototype.querySelectorAll;
    const set = CSSStyleDeclaration.prototype.setProperty;
    Element.prototype.getBoundingClientRect = function (...args) {
      if (this === container || table.contains(this)) rectReads++;
      return rect.apply(this, args);
    };
    Element.prototype.querySelectorAll = function (selector) {
      if (this === table && selector === "tbody[data-window-key]")
        windowQueries++;
      return query.call(this, selector);
    };
    CSSStyleDeclaration.prototype.setProperty = function (name, ...args) {
      if (name === "--project-row-top" || name === "--project-sticky-offset")
        stickyWrites++;
      return set.call(this, name, ...args);
    };
    const frames = [];
    let previous = performance.now();
    try {
      const max = container.scrollWidth - container.clientWidth;
      for (let i = 0; i < 40; i++) {
        container.scrollLeft =
          ((i < 20 ? i + 1 : 40 - i) / 20) * Math.min(900, max);
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        frames.push(now - previous);
        previous = now;
      }
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      frames.sort((a, b) => a - b);
      return {
        scrollRange: max,
        rectReads,
        windowQueries,
        stickyWrites,
        markerStable: marker?.style.left === markerLeft,
        p95FrameMs: Number(frames[Math.floor(frames.length * 0.95)].toFixed(2)),
        maxFrameMs: Number(frames.at(-1).toFixed(2)),
      };
    } finally {
      Element.prototype.getBoundingClientRect = rect;
      Element.prototype.querySelectorAll = query;
      CSSStyleDeclaration.prototype.setProperty = set;
    }
  });
}
export async function checkHorizontalScroll(f) {
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(
      d,
      u,
      Array.from({ length: 16 }, (_, i) => ({
        kind: "project",
        id: "qa-scroll-" + i,
        revision: 0,
        value: {
          id: "qa-scroll-" + i,
          name: "Synthetic scroll project " + i,
          start: "2026-01",
          end: "2027-12",
          phases: {},
          milestones: [],
        },
      })),
    ),
  );
  const before = await f.state();
  const { page, context } = await f.client("root-admin");
  const results = [];
  const configurations = [
    [
      "AA Planlanan Kaynak Dağılımı",
      ".workspace-dock > [data-slot=table-container]",
      "plan",
    ],
    [
      "AA Mühendislik Liderliği Projeler",
      ".workspace-dock > [data-slot=table-container]",
      "projects",
    ],
    [
      "AA Gerçekleşen Kaynak Dağılımı",
      ".person-allocation > [data-slot=table-container]",
      "actual",
    ],
    [
      "AA Aylık Aktivite Raporu",
      ".monthly-activity-report > [data-slot=table-container]",
      "activity",
    ],
    ["AA Kaynak Planlama Raporları", ".remaining-report", "reports"],
  ];
  async function sample(selector, label) {
    let container = page.locator(selector).first();
    await container.waitFor();
    if (await container.evaluate((e) => e.tagName === "TABLE"))
      container = container.locator("..");
    await container.evaluate((e) => {
      e.style.width = "650px";
      e.style.maxWidth = "650px";
      e.scrollLeft = 0;
    });
    await page.waitForTimeout(150); // Let resize/windowing settle before counting scroll work.
    const result = await measureHorizontalScroll(container);
    assert(result.scrollRange > 0, label + " must actually scroll");
    assert.equal(
      result.windowQueries,
      0,
      label + ": horizontal scroll must not rebuild virtual rows",
    );
    assert.equal(
      result.stickyWrites,
      0,
      label + ": vertical heading offsets must stay unchanged",
    );
    assert.equal(
      result.rectReads,
      0,
      label + ": native horizontal scrolling must not measure table bounds",
    );
    assert(
      result.markerStable,
      label + ": today marker stays in its content column",
    );
    results.push({ label, ...result });
    return container;
  }
  try {
    for (const [tab, selector, label] of configurations) {
      await f.check(
        "horizontal scroll: " +
          label +
          " has no repeated geometry reads or virtual-row work",
        async () => {
          await selectWorkspaceTab(page, tab);
          await sample(selector, label);
        },
      );
    }
    await f.check(
      "horizontal scroll: weekly projects and 5-year planning retain native scrolling",
      async () => {
        await selectWorkspaceTab(page, "AA Mühendislik Liderliği Projeler");
        await page
          .getByRole("switch", { name: "Haftalık proje görünümü", exact: true })
          .check();
        await sample(configurations[1][1], "weekly-projects");
        await selectWorkspaceTab(page, "AA Planlanan Kaynak Dağılımı");
        await page
          .locator(".planning-filterbar .period select")
          .selectOption("60");
        await sample(configurations[0][1], "five-year-plan");
        await page
          .getByRole("tab", { name: "Takım → Projeler", exact: true })
          .click();
        await sample(configurations[0][1], "team-projects");
      },
    );
    await f.check(
      "horizontal scroll: focused planning draft survives, report sync works both ways and unequal widths cannot echo a clamp",
      async () => {
        await page
          .locator(".planning-filterbar .period select")
          .selectOption("12");
        const input = page
          .locator(".allocation-grid .cell input:not(:disabled)")
          .first();
        await input.fill("0,37");
        await sample(configurations[0][1], "focused-plan");
        assert.equal(await input.inputValue(), "0,37");
        assert(await input.evaluate((e) => e === document.activeElement));
        await input.press("Escape");
        await selectWorkspaceTab(page, "AA Kaynak Planlama Raporları");
        const containers = page.locator(".remaining-report");
        for (const table of await containers.all())
          await table.locator("..").evaluate((e) => {
            e.style.width = "650px";
          });
        const first = containers.nth(0).locator(".."),
          second = containers.nth(1).locator("..");
        for (const [source, target, left] of [
          [first, second, 180],
          [second, first, 360],
        ]) {
          await source.evaluate((e, x) => {
            e.scrollLeft = x;
          }, left);
          await f.wait(
            async () =>
              Math.abs(
                (await source.evaluate((e) => e.scrollLeft)) -
                  (await target.evaluate((e) => e.scrollLeft)),
              ) < 1,
            "bidirectional report sync",
          );
        }
        await second.evaluate((e) => {
          e.style.width = "1000px";
          e.style.maxWidth = "1000px";
        });
        await first.evaluate((e) => {
          e.scrollLeft = e.scrollWidth;
        });
        await f.wait(
          async () =>
            first.evaluate(
              (e) =>
                Math.abs(e.scrollLeft - (e.scrollWidth - e.clientWidth)) < 1,
            ),
          "source reaches its own edge",
        );
        await page.waitForTimeout(100);
        assert(
          await first.evaluate(
            (e) => Math.abs(e.scrollLeft - (e.scrollWidth - e.clientWidth)) < 1,
          ),
          "shorter partner must not rewind the source",
        );
      },
    );
    assert.deepEqual((await f.state()).allocations, before.allocations);
    assert.deepEqual(
      (await f.state()).actualAllocations,
      before.actualAllocations,
    );
    await fs.writeFile(
      f.dir + "/horizontal-scroll-metrics.json",
      JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify({ horizontalScrollMetrics: results }));
  } finally {
    await context.close();
  }
}
