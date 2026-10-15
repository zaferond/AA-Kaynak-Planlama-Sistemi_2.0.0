import assert from "node:assert/strict";
import fs from "node:fs/promises";

// Exercise the emitted stylesheet, including legacy/late overrides. No writes,
// application login or API calls are needed for the synthetic table markup.
export async function checkTableStyles(f) {
  const html = await fs.readFile(
    new URL("../../site/index.html", import.meta.url),
    "utf8",
  );
  const name = html.match(/href="\/assets\/([\w.-]+\.css)"/)?.[1];
  assert(name, "Built stylesheet is missing");
  const css = await fs.readFile(
    new URL("../../site/assets/" + name, import.meta.url),
    "utf8",
  );
  const { context, page } = await f.client("root-admin", { login: false });
  try {
    await f.check(
      "tables: emitted theme retains year palettes, border precedence, entry/focus colors and header/today geometry",
      async () => {
        const bands = Array.from(
          { length: 6 },
          (_, i) => `<th class="year-band-${i}">${2026 + i}</th>`,
        ).join("");
        const months = bands.replaceAll(
          'class="year-band-',
          'class="monthhead year-band-',
        );
        const tables = [
          ["plan", "allocation-grid planning-grid project-team-view"],
          ["actual", "allocation-grid planning-grid"],
          ["overview", "remaining-report planning-grid"],
          ["projects", "projectmatrix"],
        ];
        await page.setContent(
          `<style>${css}</style>` +
            tables
              .map(
                ([tab, classes]) =>
                  `<div class="app tab-${tab}"><section class="person-allocation"><div data-slot="table-container"><table class="${classes}"><thead><tr class="yearrow"><th>Proje</th>${bands}</tr><tr><th>Takım</th>${months}</tr></thead><tbody><tr><td>Sentetik</td><td class="has-entry"><div class="cell person-amount"><input value="0.5"></div></td><td><div class="cell person-amount"><input value="0"></div></td></tr></tbody></table><div class="today-date-line" style="display:block"></div></div></section></div>`,
              )
              .join("") +
            '<div id="standalone" data-slot="table-container"><div class="today-date-line" style="display:block"></div></div>',
        );
        const colors = [
          "rgb(233, 241, 250)",
          "rgb(234, 244, 238)",
          "rgb(246, 239, 228)",
          "rgb(241, 236, 248)",
          "rgb(233, 244, 245)",
          "rgb(248, 237, 239)",
        ];
        for (const [tab] of tables) {
          const row = page.locator(`.tab-${tab} .yearrow th:not(:first-child)`);
          assert.deepEqual(
            await row.evaluateAll((cells) =>
              cells.map((cell) => getComputedStyle(cell).backgroundColor),
            ),
            colors,
            tab + " year palette",
          );
        }
        const style = (selector, property) =>
          page
            .locator(selector)
            .first()
            .evaluate(
              (el, p) => getComputedStyle(el).getPropertyValue(p),
              property,
            );
        // The two grids intentionally have different month-border precedence.
        assert.equal(
          await style(".tab-plan .year-band-0.monthhead", "border-left-color"),
          "rgb(185, 207, 223)",
        );
        assert.equal(
          await style(
            ".tab-actual .year-band-0.monthhead",
            "border-left-color",
          ),
          "rgb(189, 206, 222)",
        );
        for (const [tab, saved] of [
          ["plan", "rgb(220, 236, 249)"],
          ["actual", "rgb(216, 238, 232)"],
        ]) {
          const input = `.tab-${tab} .has-entry input`;
          assert.equal(await style(input, "background-color"), saved);
          await page.locator(input).focus();
          assert.equal(
            await style(input, "background-color"),
            "rgb(255, 255, 255)",
          );
          assert.equal(
            await page
              .locator(input)
              .evaluate((el) => getComputedStyle(el.closest("td")).zIndex),
            "1",
          );
          assert.equal(
            await page
              .locator(input)
              .evaluate((el) => getComputedStyle(el.closest("td")).position),
            "relative",
          );
          await page.locator(input).blur();
          assert.equal(await style(input, "background-color"), saved);
          assert.equal(
            await style(
              `.tab-${tab} td:not(.has-entry) input`,
              "background-color",
            ),
            "rgb(255, 255, 255)",
          );
        }
        for (const selector of [".tab-plan", ".tab-actual", "#standalone"]) {
          // Chrome quantizes small computed sizes under the app's page zoom.
          assert(
            Math.abs(
              Number.parseFloat(
                await style(selector + " .today-date-line", "width"),
              ) - 2,
            ) < 0.02,
          );
          assert.equal(
            await style(selector + " .today-date-line", "background-color"),
            "rgb(57, 123, 168)",
          );
          assert.equal(
            await style(selector + " .today-date-line", "z-index"),
            "0",
          );
        }
        assert.equal(
          await style(".tab-projects thead tr:not(.yearrow) th", "top"),
          "24px",
        );
        await page
          .locator(".tab-projects")
          .evaluate((el) =>
            el.style.setProperty("--table-project-year-height", "32px"),
          );
        assert(
          Math.abs(
            Number.parseFloat(
              await style(".tab-projects .yearrow th", "height"),
            ) - 32,
          ) < 0.02,
        );
        assert.equal(
          await style(".tab-projects thead tr:not(.yearrow) th", "top"),
          "32px",
        );
      },
    );
  } finally {
    await context.close();
  }
}
