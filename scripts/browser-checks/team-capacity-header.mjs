import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";

export async function checkTeamCapacityHeader(f) {
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(d, u, [
      ...[
        ["p-a", "2026-01", 0.6],
        ["p-b", "2026-01", 0.5],
        ["p-a", "2026-03", 1.11],
      ].map(([p, m, value]) => ({
        kind: "allocation",
        id: `${f.teamA.id}|${p}|${m}`,
        value,
        revision: 0,
      })),
    ]),
  );
  const { page } = await f.client("root-admin");
  try {
    await page
      .getByRole("tab", { name: "AA Planlanan Kaynak Dağılımı", exact: true })
      .click();
    await page
      .getByRole("tab", { name: "Takım → Projeler", exact: true })
      .click();
    await page.getByRole("button", { name: "Takım", exact: true }).click();
    const teamPicker = page.locator('.pickerpanel[data-state="open"]');
    await teamPicker
      .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
      .click();
    await teamPicker
      .getByRole("checkbox", { name: f.teamA.name, exact: true })
      .check();
    await page.keyboard.press("Escape");
    const table = page.locator(
      ".workspace-dock > [data-slot=table-container] > .allocation-grid",
    );
    const row = table.locator(`[data-planning-group="${f.teamA.id}"]`);
    await row.scrollIntoViewIfNeeded();
    await f.check(
      "team capacity header: compact monthly totals appear beside team identity with accessible labels and threshold colors",
      async () => {
        for (const label of [
          "Aktif Kaynak",
          "Dağıtılan Kaynak",
          "Kalan Kaynak",
        ]) {
          assert.equal(await row.getByText(label, { exact: true }).count(), 0);
          assert(
            (
              await row
                .locator('[data-team-capacity-month="2026-01"]')
                .getByLabel(new RegExp(label))
                .getAttribute("title")
            ).includes(label),
          );
        }
        assert.deepEqual(
          await row
            .locator(
              '[data-team-capacity-month="2026-01"] [data-team-capacity-kind]',
            )
            .allTextContents(),
          ["1", "1,1", "-0,1"],
        );
        assert(
          (
            await row
              .locator(
                '[data-team-capacity-month="2026-01"] [data-team-capacity-kind="2"]',
              )
              .getAttribute("class")
          ).includes("over-warning"),
        );
        assert(
          (
            await row
              .locator(
                '[data-team-capacity-month="2026-03"] [data-team-capacity-kind="2"]',
              )
              .getAttribute("class")
          ).includes("over-critical"),
        );
        assert.equal(
          await table.locator(".summary").count(),
          0,
          "Old bottom summaries are removed in team view",
        );
        const position = await row.evaluate((row) => ({
          heading: row.rowIndex,
          next: row.nextElementSibling.rowIndex,
        }));
        assert(position.next > position.heading);
        const layout = await row.evaluate((row) => {
          const values = [...row.querySelectorAll(".team-capacity-values")][0];
          const boxes = [...values.children].map((value) =>
            value.getBoundingClientRect(),
          );
          return {
            height: row.getBoundingClientRect().height,
            horizontal: boxes.every(
              (box) => Math.abs(box.top - boxes[0].top) < 2,
            ),
            fits: values.scrollWidth <= values.clientWidth,
          };
        });
        assert(
          layout.height < 80,
          `Compact team header height: ${layout.height}`,
        );
        assert(
          layout.horizontal,
          "Detailed view places monthly values side by side",
        );
        assert(layout.fits, "Monthly values fit their column");
        const numbersVisible = await row
          .locator(".team-capacity-number")
          .evaluateAll((numbers) =>
            numbers.every((number) => number.getBoundingClientRect().width > 3),
          );
        assert(
          numbersVisible,
          "Numeric values have visible width, not just DOM text",
        );
        await f.capture(page, "team-capacity-header");
      },
    );
    await f.check(
      "team capacity header: resource entry updates summary and project filter retains all-project team totals",
      async () => {
        const input = table.locator(
          `[data-plan-cell="${f.teamA.id}|p-a|2026-01"] input`,
        );
        await input.fill("0,75");
        await input.press("Enter");
        await f.wait(
          async () =>
            (await row
              .locator(
                '[data-team-capacity-month="2026-01"] [data-team-capacity-kind="1"]',
              )
              .innerText()) === "1,25",
          "header reflects saved allocation",
        );
        await page.getByRole("button", { name: "Proje", exact: true }).click();
        const picker = page.locator('.pickerpanel[data-state="open"]');
        await picker
          .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
          .click();
        await picker
          .getByRole("checkbox", { name: "Browser Project A", exact: true })
          .check();
        await page.keyboard.press("Escape");
        assert.deepEqual(
          await row
            .locator(
              '[data-team-capacity-month="2026-01"] [data-team-capacity-kind]',
            )
            .allTextContents(),
          ["1", "1,25", "-0,25"],
        );
      },
    );
    await f.check(
      "team capacity header: narrow views remain compact and inside their month columns",
      async () => {
        for (const mode of ["compact", "overview"]) {
          await page
            .getByRole("combobox", { name: "Takvim yoğunluğu", exact: true })
            .selectOption(mode);
          await row.scrollIntoViewIfNeeded();
          const layout = await row.evaluate((row) => ({
            height: row.getBoundingClientRect().height,
            fits: [...row.querySelectorAll(".team-capacity-values")].every(
              (values) => values.scrollWidth <= values.clientWidth,
            ),
            labelFits: row.cells[0].scrollWidth <= row.cells[0].clientWidth,
            numbersVisible: [
              ...row.querySelectorAll(".team-capacity-number"),
            ].every((number) => number.getBoundingClientRect().width > 3),
          }));
          await f.capture(page, `team-capacity-${mode}`);
          assert(layout.height < 85, `${mode} header height: ${layout.height}`);
          assert(
            layout.fits && layout.labelFits && layout.numbersVisible,
            `${mode} summaries stay inside their cells: ${JSON.stringify(layout)}`,
          );
        }
      },
    );
  } finally {
    await page.close();
  }
}
