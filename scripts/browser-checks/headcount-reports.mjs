import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { applyChanges, applyLeaderChange } from "../../backend/operations.mjs";
import { directoryRevision } from "../../shared/directory-policy.ts";
import { HEADCOUNT_REPORTS } from "../../frontend/src/features/resource-reports/headcount-report-data.ts";

export async function checkHeadcountReports(f) {
  await f.store.mutate(f.actor, (d, u, c, g) =>
    applyLeaderChange(
      d,
      u,
      {
        action: "update",
        name: f.teamB.lead,
        original: f.teamB.lead,
        parentName: f.teamA.lead,
        catalogRevision: directoryRevision(d),
      },
      c,
      g,
    ),
  );
  const resources = [
    ["gear", "Gear Up", f.teamA, {}],
    ["hourly", "SAAT Ücretli Ofis Ç.", f.teamB, {}],
    ["posting", "Aktif İlan", f.teamA, { start: "" }],
    ["passive", "Pasif İlan", f.teamB, { start: "" }],
    ["excluded", "Aktif Çalışan", f.teamA, {}],
    ["left", "İşten Ayrıldı", f.teamA, { end: "2026-10-01" }],
    ["future", "Aktif Çalışan", f.teamA, { start: "2027-01-01" }],
  ].map(([id, status, team, extra]) => ({
    id: "qa-headcount-" + id,
    name: "Synthetic " + id,
    note: "",
    versions: [
      {
        effective: "2026-01",
        start: "2026-01-01",
        end: "",
        team: team.id,
        lead: team.lead,
        status,
        included: false,
        amount: 0.5,
        ...extra,
      },
    ],
  }));
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(
      d,
      u,
      resources.map((value) => ({
        kind: "resource",
        id: value.id,
        revision: 0,
        value,
      })),
    ),
  );
  const { page } = await f.client("root-admin");
  const tab = (name) => page.getByRole("tab", { name, exact: true });
  const table = (index) =>
    page.getByRole("table", {
      name: HEADCOUNT_REPORTS[index].title,
      exact: true,
    });
  const total = async (index, key) =>
    (
      await table(index).locator(`[data-headcount-total="${key}"]`).innerText()
    ).trim();
  await tab("AA Kaynak Planlama Raporları").click();
  await f.check(
    "headcount: left sub-tabs retain resource reports and show dated status pivots with unique totals",
    async () => {
      assert(
        await page
          .getByRole("heading", {
            name: "Liderlik Bazında Eksik Raporu",
            exact: true,
          })
          .isVisible(),
      );
      const tabs = page.getByRole("tablist", {
        name: "Kaynak raporu görünümü",
        exact: true,
      });
      const switchBox = await tabs.boundingBox(),
        density = await page
          .getByLabel("Takvim yoğunluğu", { exact: true })
          .boundingBox();
      assert(switchBox.x < density.x);
      await tab("Head Count").click();
      assert.equal(await page.locator(".headcount-table").count(), 2);
      assert.equal(await page.locator(".leader-report").count(), 0);
      assert.equal(
        await page.getByLabel("Takvim yoğunluğu", { exact: true }).count(),
        0,
      );
      assert.equal(
        await page.locator('.planning-filterbar input[type="month"]').count(),
        0,
      );
      assert(
        (await page.locator(".reports-filter-summary").innerText()).includes(
          "02.10.2026",
        ),
      );
      for (const [key, value] of [
        ["active", "3"],
        ["gearUp", "1"],
        ["hourly", "1"],
        ["working", "5"],
      ])
        assert.equal(await total(0, key), value);
      for (const [key, value] of [
        ["active", "3"],
        ["activePosting", "1"],
        ["passivePosting", "1"],
        ["combined", "5"],
      ])
        assert.equal(await total(1, key), value);
      assert.equal(
        (
          await table(1).locator("[data-headcount-with-postings]").innerText()
        ).trim(),
        "4",
      );
      const child = table(0)
        .locator("[data-headcount-depth='1']")
        .filter({ hasText: f.teamB.lead });
      assert.equal(await child.count(), 1);
      assert.equal(
        (
          await child.locator('[data-headcount-status="active"]').innerText()
        ).trim(),
        "1",
      );
      await f.capture(page, "headcount-full");
    },
  );
  await f.check(
    "headcount: child leadership filter retains parent context and totals only selected units",
    async () => {
      await page.getByRole("button", { name: "Liderlik", exact: true }).click();
      const picker = page.locator('.pickerpanel[data-state="open"]');
      await picker
        .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
        .click();
      await picker
        .getByRole("checkbox", { name: f.teamB.lead, exact: true })
        .check();
      await page.keyboard.press("Escape");
      assert.equal(await total(0, "active"), "1");
      assert.equal(await total(0, "hourly"), "1");
      assert.equal(await total(0, "working"), "2");
      assert.equal(await total(1, "activePosting"), "0");
      assert.equal(await total(1, "passivePosting"), "1");
      assert.equal(await total(1, "combined"), "2");
      assert.equal(await table(0).locator("tbody tr").count(), 2);
      await f.capture(page, "headcount-child-filter");
    },
  );
  await f.check(
    "headcount: Excel downloads current pivot and resource sub-tab restores existing reports",
    async () => {
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Head Count Excel'e Aktar", exact: true })
        .click();
      const file = await download;
      assert.equal(file.suggestedFilename(), "AA-Head-Count-2026-10-02.xlsx");
      const target = path.join(f.dir, file.suggestedFilename());
      await file.saveAs(target);
      const bytes = await fs.readFile(target);
      assert.equal(bytes.readUInt32LE(0), 0x04034b50);
      assert(bytes.length > 1000);
      await tab("Kaynak Raporları").click();
      assert.equal(await page.locator(".headcount-table").count(), 0);
      assert.equal(await page.locator(".leader-report").count(), 1);
      assert.equal(await page.locator(".team-report").count(), 1);
      assert.equal(
        await page.locator('.planning-filterbar input[type="month"]').count(),
        1,
      );
      await tab("Head Count").click();
      assert.equal(await total(0, "working"), "2");
    },
  );
  await f.check(
    "headcount: managers can view aggregates; normal users cannot access report navigation",
    async () => {
      const manager = await f.client("manager"),
        normal = await f.client("employee");
      await manager.page
        .getByRole("tab", { name: "AA Kaynak Planlama Raporları", exact: true })
        .click();
      await manager.page
        .getByRole("tab", { name: "Head Count", exact: true })
        .click();
      const report = manager.page.getByRole("table", {
        name: HEADCOUNT_REPORTS[0].title,
        exact: true,
      });
      assert.equal(
        (
          await report.locator('[data-headcount-total="working"]').innerText()
        ).trim(),
        "5",
      );
      assert.equal(
        await normal.page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .count(),
        0,
      );
      assert.equal(
        await normal.page
          .getByRole("tab", { name: "Head Count", exact: true })
          .count(),
        0,
      );
      await manager.context.close();
      await normal.context.close();
    },
  );
}
