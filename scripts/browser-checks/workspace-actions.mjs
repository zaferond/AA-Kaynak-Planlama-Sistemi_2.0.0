import { selectWorkspaceTab } from "./fixture.mjs";
import assert from "node:assert/strict";
import path from "node:path";
import { applyChanges } from "../../backend/operations.mjs";
import { download, zipEntries, validateXml } from "./files.mjs";

async function choose(page, label, names) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const panel = page.locator('.pickerpanel[data-state="open"]');
  await panel
    .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
    .click();
  for (const name of names)
    await panel.getByRole("checkbox", { name, exact: true }).check();
  await page.keyboard.press("Escape");
}
export async function checkWorkspaceActions(f) {
  const initial = await f.state(),
    { context, page } = await f.client("root-admin");
  const planned = {
    [f.teamA.id + "|p-a|2026-01"]: 0.25,
    [f.teamA.id + "|p-b|2026-02"]: 0.5,
    [f.teamB.id + "|p-a|2026-11"]: 0.75,
  };
  async function write(changes) {
    const snapshot = await f.state();
    await f.store.mutate(f.actor, (data, user) =>
      applyChanges(
        data,
        user,
        changes.map((change) => ({
          ...change,
          revision: snapshot.revisions[change.kind + ":" + change.id] || 0,
        })),
      ),
    );
  }
  async function seedPlan() {
    await write(
      Object.entries(planned).map(([id, value]) => ({
        kind: "allocation",
        id,
        value,
      })),
    );
  }
  async function exportSheet(button, file) {
    const bytes = await download(page, button, path.join(f.dir, file));
    const entries = zipEntries(bytes);
    await validateXml(page, entries);
    return Object.entries(entries)
      .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
      .map(([, xml]) => xml)
      .join("\n");
  }
  try {
    await seedPlan();
    await page.reload();
    await f.check(
      "workspace actions: four tab exports use current filters; normal actual export includes only the own resource",
      async () => {
        await page
          .getByRole("tab", {
            name: "AA Planlanan Kaynak Dağılımı",
            exact: true,
          })
          .click();
        await choose(page, "Takım", [f.teamA.name]);
        await choose(page, "Proje", ["Browser Project A"]);
        let xml = await exportSheet(
          page.getByRole("button", { name: "Excel'e Aktar", exact: true }),
          "filtered-plan.xlsx",
        );
        assert(xml.includes("Browser Project A"));
        assert(!xml.includes("Browser Project B"));
        assert(xml.includes(f.teamA.name));
        assert(!xml.includes(f.teamB.name));
        assert(xml.includes("<v>0.25</v>"));
        await page
          .getByRole("tab", {
            name: "AA Mühendislik Liderliği Projeler",
            exact: true,
          })
          .click();
        xml = await exportSheet(
          page.getByRole("button", {
            name: "Proje Raporunu İndir",
            exact: true,
          }),
          "filtered-projects.xlsx",
        );
        assert(
          xml.includes("Browser Project A") &&
            !xml.includes("Browser Project B"),
        );
        await page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .click();
        xml = await exportSheet(
          page.getByRole("button", {
            name: "Kaynak Raporu İndir",
            exact: true,
          }),
          "filtered-resources.xlsx",
        );
        assert(xml.includes(f.teamA.name) && !xml.includes(f.teamB.name));
        assert(xml.includes("Liderlik: Tümü · Takım: 1 seçili"));
        await page
          .getByRole("tab", {
            name: "AA Gerçekleşen Kaynak Dağılımı",
            exact: true,
          })
          .click();
        await choose(page, "Takım", []);
        await choose(page, "Kişi", ["Browser Employee"]);
        xml = await exportSheet(
          page.getByRole("button", { name: "Excel'e Aktar", exact: true }),
          "filtered-actual.xlsx",
        );
        assert(
          xml.includes("Browser Employee") &&
            !xml.includes("Browser Other Employee"),
        );
        const employee = await f.client("employee");
        try {
          const bytes = await download(
            employee.page,
            employee.page.getByRole("button", {
              name: "Excel'e Aktar",
              exact: true,
            }),
            path.join(f.dir, "own-actual.xlsx"),
          );
          const entries = zipEntries(bytes);
          await validateXml(employee.page, entries);
          const own = entries["xl/worksheets/sheet1.xml"];
          assert(
            own.includes("Browser Employee") &&
              !own.includes("Browser Other Employee"),
          );
        } finally {
          await employee.context.close();
        }
      },
    );
    await f.check(
      "workspace actions: global reset ignores display filters; cancel/503 preserve data and retry clears only planned allocations",
      async () => {
        await page
          .getByRole("tab", {
            name: "AA Planlanan Kaynak Dağılımı",
            exact: true,
          })
          .click();
        await choose(page, "Takım", [f.teamA.name]);
        await choose(page, "Proje", ["Browser Project A"]);
        await seedPlan();
        await page.reload();
        await page
          .getByRole("tab", {
            name: "AA Planlanan Kaynak Dağılımı",
            exact: true,
          })
          .click();
        await choose(page, "Takım", [f.teamA.name]);
        await choose(page, "Proje", ["Browser Project A"]);
        await page
          .locator(".planning-filterbar .period select")
          .selectOption("6");
        const button = page.getByRole("button", {
          name: "Tüm Dağılımları Sıfırla",
          exact: true,
        });
        const before = await f.state();
        page.once("dialog", async (dialog) => {
          assert(dialog.message().includes("Ekrandaki filtreler"));
          await dialog.dismiss();
        });
        await button.click();
        assert.deepEqual((await f.state()).allocations, before.allocations);
        await page.route(
          "**/api/allocations/reset",
          (route) =>
            route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Synthetic reset failure" }),
            }),
          { times: 1 },
        );
        page.once("dialog", (dialog) => dialog.accept());
        await button.click();
        await page
          .getByRole("alert")
          .filter({ hasText: "Synthetic reset failure" })
          .waitFor();
        assert.deepEqual((await f.state()).allocations, before.allocations);
        page.once("dialog", (dialog) => dialog.accept());
        await button.click();
        await f.wait(
          async () =>
            Object.values((await f.state()).allocations).every(
              (value) => value === 0,
            ),
          "global reset saved",
        );
        const after = await f.state();
        for (const key of [
          "resources",
          "projects",
          "actualAllocations",
          "actualWorkedHours",
          "actualPercentEntries",
          "workCalendar",
          "personCalendar",
        ])
          assert.deepEqual(
            after[key],
            before[key],
            key + " preserved by planned reset",
          );
        assert(await button.isDisabled());
        await seedPlan();
      },
    );
    await f.check(
      "workspace actions: bulk resource deletion cancels safely, keeps selection on 409 and deletes actual records only for confirmed people",
      async () => {
        const resources = [
          ["action-a", "Bulk A", f.teamA],
          ["action-b", "Bulk B", f.teamA],
          ["action-outside", "Bulk outside", f.teamB],
        ].map(([id, name, team]) => ({
          id,
          name,
          note: "",
          versions: [
            {
              effective: "2026-01",
              start: "2026-01-01",
              end: "",
              team: team.id,
              lead: team.lead,
              status: "Aktif Çalışan",
              included: true,
              amount: 1,
            },
          ],
        }));
        await write(
          resources.map((value) => ({ kind: "resource", id: value.id, value })),
        );
        await write([
          { kind: "actual", id: "action-a|p-a|2026-01", value: 0.25 },
        ]);
        await page.reload();
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        await page
          .getByRole("checkbox", { name: "Bulk A seç", exact: true })
          .check();
        await page
          .getByRole("checkbox", { name: "Bulk B seç", exact: true })
          .check();
        const button = page.getByRole("button", {
            name: "Seçilenleri Sil",
            exact: true,
          }),
          before = await f.state();
        page.once("dialog", (dialog) => dialog.dismiss());
        await button.click();
        assert.deepEqual((await f.state()).resources, before.resources);
        assert(
          await page
            .getByRole("checkbox", { name: "Bulk A seç", exact: true })
            .isChecked(),
        );
        await page.route(
          "**/api/changes",
          (route) =>
            route.fulfill({
              status: 409,
              contentType: "application/json",
              body: JSON.stringify({ error: "Synthetic delete conflict" }),
            }),
          { times: 1 },
        );
        page.once("dialog", (dialog) => dialog.accept());
        await button.click();
        await page
          .getByRole("alert")
          .filter({ hasText: "Synthetic delete conflict" })
          .waitFor();
        assert.deepEqual((await f.state()).resources, before.resources);
        assert(
          await page
            .getByRole("checkbox", { name: "Bulk B seç", exact: true })
            .isChecked(),
        );
        page.once("dialog", (dialog) => dialog.accept());
        await button.click();
        await f.wait(
          async () =>
            !(await f.state()).resources.some((r) =>
              ["action-a", "action-b"].includes(r.id),
            ),
          "bulk deletion saved",
        );
        const after = await f.state();
        assert(after.resources.some((r) => r.id === "action-outside"));
        assert(
          !Object.keys(after.actualAllocations).some((k) =>
            k.startsWith("action-a|"),
          ),
        );
        assert.deepEqual(after.allocations, before.allocations);
        assert.deepEqual(after.projects, before.projects);
        assert(await button.isDisabled());
        await f.capture(page, "workspace-bulk-delete");
      },
    );
  } catch (error) {
    await f.capture(page, "workspace-actions-failed");
    throw error;
  } finally {
    await context.close();
    const state = await f.state();
    const cleanup = state.resources
      .filter((r) => r.id.startsWith("action-"))
      .map((r) => ({
        kind: "resource",
        id: r.id,
        value: null,
        operation: "delete",
      }));
    const keys = new Set([
      ...Object.keys(state.allocations),
      ...Object.keys(initial.allocations),
    ]);
    cleanup.push(
      ...[...keys].map((id) => ({
        kind: "allocation",
        id,
        value: initial.allocations[id] || 0,
      })),
    );
    if (cleanup.length) await write(cleanup);
  }
}
