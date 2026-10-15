import { selectWorkspaceTab } from "./fixture.mjs";
import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";

export async function checkHeadcountForecast(f) {
  const ids = [
    "qa-forecast-active",
    "qa-forecast-passive",
    "qa-forecast-undated",
  ];
  async function write(included) {
    const state = await f.state();
    await f.store.mutate(f.actor, (data, actor) =>
      applyChanges(
        data,
        actor,
        ids.map((id, index) => ({
          kind: "resource",
          id,
          revision: state.revisions["resource:" + id] || 0,
          value: {
            id,
            name: id,
            note: "",
            versions: [
              {
                effective: "2026-10",
                team: f.teamA.id,
                lead: f.teamA.lead,
                status: index === 1 ? "Pasif İlan" : "Aktif İlan",
                included: index === 0 ? included : index === 1,
                start: index === 2 ? "" : "2026-11-16",
                end: "",
                amount: 1,
              },
            ],
          },
        })),
      ),
    );
  }
  const { page, context } = await f.client("root-admin");
  const dialog = () => page.getByRole("dialog");
  async function chooseStatus(status) {
    await dialog()
      .getByRole("button", { name: "Statü", exact: true, includeHidden: true })
      .click();
    await page
      .locator('.pickerpanel[data-state="open"]')
      .getByRole("button", { name: status, exact: true })
      .click();
  }
  async function openReport() {
    await page.goto(f.origin);
    await page
      .getByRole("tab", { name: "AA Kaynak Planlama Raporları", exact: true })
      .click();
    await page.getByRole("button", { name: "Takım", exact: true }).click();
    const panel = page.locator('.pickerpanel[data-state="open"]');
    await panel
      .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
      .click();
    await panel
      .getByRole("checkbox", { name: f.teamA.name, exact: true })
      .check();
    await page.keyboard.press("Escape");
    await page.locator(".headcount-trend svg circle").nth(10).waitFor();
    return page
      .locator(".headcount-trend svg circle title")
      .nth(10)
      .textContent();
  }
  async function activeCapacity() {
    const query = new URLSearchParams({
      allocation: "full",
      view: "team",
      start: "2026-11",
      count: "12",
      team: f.teamA.id,
    });
    await page.goto(f.origin + "/?" + query);
    const table = page.locator(".capacitystrip .planning-grid");
    await table.waitFor();
    assert.equal(
      (await table.locator(".summary.s2 td").first().textContent()).trim(),
      "Dağıtılan Kaynak",
    );
    return (await table.locator(".summary.s0 td").nth(1).textContent()).trim();
  }
  try {
    await f.check(
      "forecast: posting date labels change with status; date and inclusion defaults remain intact",
      async () => {
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        await page
          .getByRole("button", {
            name: "Kaynak Ekle / Yetki Tanımla",
            exact: true,
          })
          .click();
        for (const status of ["Aktif İlan", "Pasif İlan"]) {
          await chooseStatus(status);
          assert.equal(
            await dialog()
              .getByLabel("Tahmini İşbaşı Tarihi", { exact: true })
              .inputValue(),
            "",
          );
          assert(!(await dialog().getByRole("switch").isChecked()));
        }
        for (const status of [
          "Aktif Çalışan",
          "Gear Up",
          "SAAT Ücretli Ofis Ç.",
        ]) {
          await chooseStatus(status);
          assert.equal(
            await dialog()
              .getByLabel("İşbaşı Tarihi", { exact: true })
              .inputValue(),
            "2026-01-01",
          );
          assert(await dialog().getByRole("switch").isChecked());
        }
        await dialog()
          .getByRole("button", { name: "Close", exact: true })
          .click();
        await dialog().waitFor({ state: "hidden" });
      },
    );
    await f.check(
      "forecast: dated excluded active posting appears in the chart, while planning capacity still requires inclusion",
      async () => {
        await write(false);
        const excluded = await openReport();
        assert.match(excluded, /Aktif İlan: 0,5 · Öngörülen Aylık Sayı: 1,5/);
        assert.equal(await activeCapacity(), "1");
        await write(true);
        assert.equal(await openReport(), excluded);
        assert.equal(await activeCapacity(), "1,5");
        await write(false);
        assert.equal(await openReport(), excluded);
        assert.equal(await activeCapacity(), "1");
      },
    );
  } catch (error) {
    await f.capture(page, "headcount-forecast-failed");
    throw error;
  } finally {
    await context.close();
    const state = await f.state();
    const changes = ids
      .filter((id) => state.resources.some((r) => r.id === id))
      .map((id) => ({
        kind: "resource",
        id,
        operation: "delete",
        value: null,
        revision: state.revisions["resource:" + id],
      }));
    if (changes.length)
      await f.store.mutate(f.actor, (data, actor) =>
        applyChanges(data, actor, changes),
      );
  }
}
