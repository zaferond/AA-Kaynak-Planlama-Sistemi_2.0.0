import { selectWorkspaceTab } from "./fixture.mjs";
import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";

export async function checkActualRemainingHours(f) {
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(d, u, [
      {
        kind: "calendar",
        id: "shared",
        revision: 0,
        value: {
          "2026-01-07": {
            type: "official",
            label: "Synthetic holiday",
            fraction: 1,
          },
        },
      },
      {
        kind: "personDay",
        id: "r-own|2026-01-08|leave",
        revision: 0,
        value: { type: "leave", hours: 4.5, label: "Synthetic leave" },
      },
      {
        kind: "personDay",
        id: "r-own|2026-01-09|training",
        revision: 0,
        value: { type: "training", hours: 2.5, label: "Synthetic training" },
      },
      ...[
        ["p-a", 18],
        ["p-b", 9],
      ].map(([project, hours]) => ({
        kind: "actual",
        id: `r-own|${project}|2026-01`,
        revision: 0,
        value: { unit: "hours", value: hours },
      })),
    ]),
  );
  const { page } = await f.client("employee");
  try {
    await selectWorkspaceTab(page, "Aktivite Girişi");
    // Person totals are load bars under each entry cell (no separate row).
    const january = page
      .locator(
        '[data-project-group="p-a"] .actual-cell-load[data-actual-total="r-own|2026-01"]',
      )
      .first();
    const value = async () => await january.getAttribute("data-value");
    await f.check(
      "actual hours: remaining net capacity subtracts all projects and training, with holiday/leave deducted once",
      async () => {
        await page.locator("#actual-entry-unit").selectOption("hours");
        assert(
          (await january.getAttribute("aria-label")).startsWith(
            "Kalan Aylık Çalışma Saati",
          ),
        );
        assert.equal(await value(), "155");
        assert(
          (await january.getAttribute("title")).includes(
            "184,5 saat aylık çalışma − 27 saat proje dağılımı − 2,5 saat eğitim = 155 saat kalan",
          ),
        );
        // Hiding a project must never make those allocated hours available again.
        await page.getByRole("button", { name: "Proje", exact: true }).click();
        const picker = page.locator('.pickerpanel[data-state="open"]');
        await picker
          .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
          .click();
        await picker
          .getByRole("checkbox", { name: "Browser Project A", exact: true })
          .check();
        await page.keyboard.press("Escape");
        assert.equal(await value(), "155");
        await page.locator("#actual-entry-unit").selectOption("percent");
        assert(
          (await january.getAttribute("aria-label")).startsWith(
            "Dağıtılan Kaynak %'si",
          ),
        );
        assert.equal(await value(), "%15,99");
        await page.locator("#actual-entry-unit").selectOption("hours");
        assert.equal(await value(), "155");
      },
    );
    await f.check(
      "actual hours: manual net hours and full allocation update remaining hours without negative floating-point zero",
      async () => {
        const amount = page.getByRole("textbox", {
          name: "Browser Employee / Browser Project A / 2026-01 / saat",
          exact: true,
        });
        await amount.click();
        const hours = page.getByRole("textbox", {
          name: "Browser Employee / 2026-01 çalışılan saat",
          exact: true,
        });
        await hours.fill("200");
        await hours.press("Enter");
        await f.wait(
          async () => (await value()) === "170,5",
          "remaining hours after manual capacity update",
        );
        await amount.fill("188,5");
        await amount.press("Enter");
        await f.wait(
          async () => (await value()) === "0",
          "fully distributed month has zero remaining hours",
        );
        assert(
          (await january.getAttribute("class")).includes("actual-total-full"),
        );
        await page.locator("#actual-entry-unit").selectOption("percent");
        assert.equal(await value(), "%100");
        await page.locator("#actual-entry-unit").selectOption("hours");
        await f.capture(page, "actual-remaining-hours");
      },
    );
  } finally {
    await page.close();
  }
}
