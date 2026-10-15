import assert from "node:assert/strict";
import { selectWorkspaceTab } from "./fixture.mjs";
import { applyLeaderChange, applyChanges } from "../../backend/operations.mjs";
import { directoryRevision } from "../../shared/directory-policy.ts";

export async function checkFilterAppliedToast(f) {
  const searchLead = "QA Toast Search Leadership";
  const searchTeam = {
    ...f.teamA,
    id: "qa-toast-search-team",
    name: "QA Toast Search Team",
    lead: searchLead,
    catalog: false,
  };
  await f.store.mutate(f.actor, (d, u, c, g) =>
    applyLeaderChange(
      d,
      u,
      {
        action: "create",
        name: searchLead,
        catalogRevision: directoryRevision(d),
      },
      c,
      g,
    ),
  );
  await f.store.mutate(f.actor, (d, u) => {
    const other = d.resources.find((r) => r.id === "r-other");
    return applyChanges(d, u, [
      { kind: "team", id: searchTeam.id, revision: 0, value: searchTeam },
      {
        kind: "resource",
        id: other.id,
        revision: d.revisions["resource:" + other.id],
        value: {
          ...other,
          versions: other.versions.map((v) => ({
            ...v,
            team: searchTeam.id,
            lead: searchLead,
            assignmentRole: "member",
          })),
        },
      },
    ]);
  });
  const { page } = await f.client("root-admin");
  const toast = () => page.locator(".filter-applied-toast");
  try {
    await selectWorkspaceTab(page, "AA Planlanan Kaynak Dağılımı");
    await f.check(
      "filters: no initial notification; changed filters show one green checked toast at bottom right then dismiss",
      async () => {
        assert.equal(await toast().count(), 0);
        await page
          .getByRole("button", { name: "Liderlik", exact: true })
          .click();
        await page
          .locator('.pickerpanel[data-state="open"]')
          .getByRole("checkbox", { name: f.teamA.lead, exact: true })
          .check();
        await page.keyboard.press("Escape");
        await toast().waitFor();
        assert.equal(await toast().innerText(), "Liderlik Filtresi Uygulandı");
        assert.equal(await toast().locator("svg").count(), 1);
        assert.equal(
          await toast().evaluate((e) => getComputedStyle(e).color),
          "rgb(40, 99, 58)",
        );
        const box = await toast().boundingBox(),
          viewport = page.viewportSize();
        assert(Math.abs(viewport.width - box.x - box.width - 20) <= 2);
        assert(Math.abs(viewport.height - box.y - box.height - 20) <= 2);
        await page
          .locator(".planning-filterbar .period select")
          .selectOption("6");
        assert.equal(await toast().count(), 1);
        assert.equal(await toast().innerText(), "Görünür Dönem Değiştirildi");
        assert.equal(
          await toast().evaluate((e) => getComputedStyle(e).color),
          "rgb(40, 99, 58)",
        );
        await f.capture(page, "filter-applied-toast");
        await toast().waitFor({ state: "hidden", timeout: 2000 });
      },
    );
    await f.check(
      "filters: same values and invalid dates do not notify; valid dates and reset do",
      async () => {
        await page
          .locator(".planning-filterbar .period select")
          .selectOption("6");
        assert.equal(await toast().count(), 0);
        const start = page.locator('.planning-filterbar input[type="month"]');
        await start.fill("");
        assert.equal(await toast().count(), 0);
        await start.fill("2026-02");
        await toast().waitFor();
        await page
          .getByRole("button", { name: "Filtreleri Sıfırla", exact: true })
          .click();
        assert.equal(await toast().count(), 1);
        assert.equal(await start.inputValue(), "2026-01");
        assert.equal(await toast().innerText(), "Filtreler Sıfırlandı");
        assert.equal(
          await toast().evaluate((e) => getComputedStyle(e).color),
          "rgb(54, 94, 144)",
        );
        await start.fill("2026-03");
        assert.equal(
          await toast().innerText(),
          "Başlangıç Ayı Filtresi Uygulandı",
        );
        assert.equal(
          await toast().evaluate((e) => getComputedStyle(e).color),
          "rgb(40, 99, 58)",
        );
        await toast().waitFor({ state: "hidden", timeout: 2000 });
      },
    );
    await f.check(
      "filters: team, project and person notifications identify the changed field",
      async () => {
        for (const [label, name, message] of [
          ["Takım", f.teamA.name, "Takım Filtresi Uygulandı"],
          ["Proje", "Browser Project A", "Proje Filtresi Uygulandı"],
        ]) {
          await page.getByRole("button", { name: label, exact: true }).click();
          await page
            .locator('.pickerpanel[data-state="open"]')
            .getByRole("checkbox", { name, exact: true })
            .check();
          await page.keyboard.press("Escape");
          assert.equal(await toast().innerText(), message);
        }
        await selectWorkspaceTab(page, "AA Gerçekleşen Kaynak Dağılımı");
        await page.getByRole("button", { name: "Kişi", exact: true }).click();
        await page
          .locator('.pickerpanel[data-state="open"]')
          .getByRole("checkbox", { name: "Browser Employee", exact: true })
          .check();
        await page.keyboard.press("Escape");
        assert.equal(await toast().innerText(), "Kişi Filtresi Uygulandı");
      },
    );
    await f.check(
      "employee quick search: no filter bar or hidden organizational filter; team and leadership text searches notify and clear",
      async () => {
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        assert.equal(await page.locator(".planning-filterbar").count(), 0);
        const row = (id) => page.locator(`[data-resource-id="${id}"]`);
        assert.equal(await row("r-other").count(), 1);
        const search = page.getByRole("textbox", {
          name: "Kaynak ara",
          exact: true,
        });
        await search.fill(searchTeam.name);
        assert.equal(await row("r-other").count(), 1);
        assert.equal(await row("r-own").count(), 0);
        assert.equal(await toast().innerText(), "Takım Filtresi Uygulandı");
        await search.fill(searchLead);
        assert.equal(await row("r-other").count(), 1);
        assert.equal(await row("r-own").count(), 0);
        assert.equal(await toast().innerText(), "Liderlik Filtresi Uygulandı");
        await search.fill("");
        assert.equal(await row("r-other").count(), 1);
        assert.equal(await toast().innerText(), "Filtreler Sıfırlandı");
        await toast().waitFor({ state: "hidden", timeout: 2000 });
      },
    );
  } finally {
    await page.close();
  }
}
