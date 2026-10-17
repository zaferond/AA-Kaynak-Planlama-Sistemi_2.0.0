import assert from "node:assert/strict";

// After a save the actual view refreshes in the background. Cells must stay
// editable meanwhile: Tab keeps focus on the next cell and the saved value
// does not fall back to the old one.
export async function checkActualSaveFocus(f) {
  const { page, context } = await f.client("employee");
  const cell = (month) =>
    page.getByRole("textbox", {
      name: `Browser Employee / Browser Project A / ${month} / %`,
      exact: true,
    });
  try {
    await page
      .getByRole("tab", { name: "Aktivite Girişi", exact: true })
      .click();
    await f.check(
      "actual: Tab after a save keeps focus on the next cell and the saved value stays",
      async () => {
        await cell("2026-01").click();
        await cell("2026-01").fill("20");
        const refreshed = page.waitForResponse(
          (r) => r.url().includes("/api/actual-view") && r.status() === 200,
        );
        await cell("2026-01").press("Tab");
        // Percent converts against the month's working hours, so compare
        // with the stored value rather than a fixed FTE.
        const saved = async () =>
          (await f.state()).actualAllocations["r-own|p-a|2026-01"] || 0;
        await f.wait(async () => (await saved()) > 0, "first cell saved");
        const first = await saved();
        await refreshed;
        // The neighbour never lost focus or its enabled state.
        assert.equal(
          await page.evaluate(() => document.activeElement?.ariaLabel),
          "Browser Employee / Browser Project A / 2026-02 / %",
        );
        assert(await cell("2026-02").isEnabled());
        assert.equal(await cell("2026-01").inputValue(), "%20");
        // A second edit of the same cell uses its new revision (no conflict).
        await cell("2026-01").click();
        await cell("2026-01").fill("30");
        await cell("2026-01").press("Enter");
        await f.wait(
          async () => (await saved()) > first,
          "second edit saved without a revision conflict",
        );
        assert.equal(await page.locator(".write-recovery-notice").count(), 0);
      },
    );
  } finally {
    await context.close();
  }
}
