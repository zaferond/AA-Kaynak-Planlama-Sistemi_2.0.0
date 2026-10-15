import assert from "node:assert/strict";

export async function checkAllocationFocusLayers(f) {
  const { page } = await f.client("root-admin");
  const before = await f.state();
  try {
    for (const [tab, tableSelector, inputSelector] of [
      [
        "AA Gerçekleşen Kaynak Dağılımı",
        ".person-allocation .allocation-grid",
        ".person-amount input:not(:disabled)",
      ],
      [
        "AA Planlanan Kaynak Dağılımı",
        ".workspace-dock > [data-slot=table-container] > .allocation-grid",
        ".cell input:not(:disabled)",
      ],
    ]) {
      await f.check(
        `allocation focus: ${tab} draft stays below sticky headers during vertical scrolling`,
        async () => {
          await page.getByRole("tab", { name: tab, exact: true }).click();
          const table = page.locator(tableSelector),
            container = table.locator(".."),
            input = table.locator(inputSelector).first();
          await container.evaluate((c) => {
            c.style.setProperty("height", "180px", "important");
            c.style.setProperty("max-height", "180px", "important");
            c.style.setProperty("flex", "none", "important");
          });
          await container.scrollIntoViewIfNeeded();
          await input.fill("17");
          await input.evaluate((input) => {
            const table = input.closest("table"),
              c = table.parentElement;
            const bottom = Math.max(
              ...[...table.querySelectorAll("thead th")].map(
                (cell) => cell.getBoundingClientRect().bottom,
              ),
            );
            const r = input.getBoundingClientRect(),
              zoom =
                Number.parseFloat(
                  getComputedStyle(document.documentElement).zoom,
                ) || 1;
            c.scrollTop += (r.top + r.height / 2 - bottom + 2) / zoom;
          });
          await f.wait(
            async () => await container.evaluate((c) => c.scrollTop > 0),
            "table scrolled with focused input",
          );
          await page.waitForTimeout(80);
          const result = await input.evaluate((input) => {
            const table = input.closest("table"),
              cr = table.parentElement.getBoundingClientRect();
            const bottom = Math.max(
              ...[...table.querySelectorAll("thead th")].map(
                (cell) => cell.getBoundingClientRect().bottom,
              ),
            );
            const r = input.getBoundingClientRect(),
              x = Math.min(cr.right - 5, r.left + r.width / 2);
            const top = document.elementFromPoint(x, bottom - 2);
            return {
              focused: document.activeElement === input,
              painted: !!top?.closest("thead"),
              z: getComputedStyle(input.closest("td")).zIndex,
            };
          });
          assert(
            result.focused && result.painted && result.z === "1",
            JSON.stringify(result),
          );
          assert((await input.inputValue()).includes("17"));
          await f.capture(
            page,
            tab.includes("Gerçekleşen")
              ? "actual-focused-header"
              : "planned-focused-header",
          );
          await input.press("Escape");
        },
      );
    }
    assert.deepEqual((await f.state()).allocations, before.allocations);
    assert.deepEqual(
      (await f.state()).actualAllocations,
      before.actualAllocations,
    );
  } finally {
    await page.close();
  }
}
