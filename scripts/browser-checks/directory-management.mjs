import { selectWorkspaceTab } from "./fixture.mjs";
import assert from "node:assert/strict";
import { directoryRevision } from "../../shared/directory-policy.ts";
import { applyChanges, applyLeaderChange } from "../../backend/operations.mjs";

export async function checkDirectoryManagement(f) {
  const c = await f.client("root-admin"),
    page = c.page;
  const original = (await f.state()).projects.find((p) => p.id === "p-a");
  const leaderName = "QA Manual Leadership",
    teamName = "QA Manual Team";
  const dialog = () => page.locator('[data-slot="dialog-content"]');
  const picker = () => page.locator('.pickerpanel[data-state="open"]');
  async function openPicker(label) {
    const trigger = dialog().getByRole("button", {
      name: label,
      exact: true,
      includeHidden: true,
    });
    await trigger.click();
    await picker().waitFor();
    // Wait for the popup animation and Floating UI's first measurement.
    await f.wait(async () => {
      const anchor = await trigger.boundingBox(),
        popup = await picker().boundingBox();
      return (
        anchor &&
        popup &&
        Math.abs(popup.x - anchor.x) <= 2 &&
        Math.abs(popup.width - anchor.width) <= 2 &&
        popup.y >= anchor.y + anchor.height &&
        popup.y <= anchor.y + anchor.height + 8
      );
    }, label + " popup below its trigger");
  }
  async function choose(label, name) {
    await openPicker(label);
    await picker().getByRole("textbox").fill(name);
    await picker().getByRole("button", { name, exact: true }).click();
  }
  async function scrollPicker(label) {
    await openPicker(label);
    const options = picker().locator(".pickeroptions");
    assert(
      await options.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    );
    await options.hover();
    await page.mouse.wheel(0, 700);
    await f.wait(
      async () => (await options.evaluate((element) => element.scrollTop)) > 0,
      label + " options scroll with the mouse wheel",
    );
    await page.mouse.wheel(0, 100000);
    await f.wait(
      async () =>
        options.evaluate(
          (element) =>
            element.scrollTop >=
            element.scrollHeight - element.clientHeight - 1,
        ),
      label + " final option is reachable",
    );
    const viewport = await options.boundingBox(),
      last = await options.locator(".option").last().boundingBox();
    assert(
      last.y >= viewport.y &&
        last.y + last.height <= viewport.y + viewport.height + 2,
    );
    await f.capture(page, "resource-picker-scroll-" + label);
    await page.keyboard.press("Escape");
    await picker().waitFor({ state: "hidden" });
  }
  async function save(path, name, status = 200) {
    const response = page.waitForResponse(
      (r) => r.url().endsWith(path) && r.request().method() === "POST",
    );
    await dialog().getByRole("button", { name, exact: true }).click();
    const result = await response;
    assert.equal(result.status(), status);
    return result;
  }
  async function close() {
    await dialog().getByRole("button", { name: "Kapat", exact: true }).click();
    await dialog().waitFor({ state: "hidden" });
  }
  try {
    await selectWorkspaceTab(page, "Liderlik ve Takımlar");
    await f.check(
      "directory: edit reveals selected team in left scroll list",
      async () => {
        const teams = (await f.state()).teams
          .filter((team) => team.kind !== "leadership")
          .toSorted((a, b) => a.name.localeCompare(b.name, "tr"));
        for (const team of [teams.at(-1), teams[0]]) {
          await page
            .getByRole("button", {
              name: team.name + " takımını düzenle",
              exact: true,
            })
            .click();
          const list = dialog().locator(".directory-manager-records");
          await f.wait(
            async () =>
              list.evaluate((element) => {
                const selected = element.querySelector(
                  'button[aria-pressed="true"]',
                );
                if (!selected) return false;
                const a = selected.getBoundingClientRect(),
                  b = element.getBoundingClientRect();
                return a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
              }),
            "selected team visible on open",
          );
          assert.equal(
            await list
              .locator('button[aria-pressed="true"]')
              .getAttribute("aria-label"),
            "Takım: " + team.name,
          );
          if (team === teams.at(-1))
            assert((await list.evaluate((element) => element.scrollTop)) > 0);
          await f.capture(
            page,
            team === teams[0]
              ? "directory-first-selected"
              : "directory-last-selected",
          );
          await close();
        }
      },
    );
    await f.check(
      "directory: team and leadership dialogs list linked employee names",
      async () => {
        await page
          .getByRole("button", {
            name: f.teamA.name + " takımını düzenle",
            exact: true,
          })
          .click();
        const own = (await f.state()).resources.find(
          (resource) => resource.id === "r-own",
        );
        assert(
          (
            await dialog()
              .getByRole("region", { name: "Bağlı çalışanlar", exact: true })
              .innerText()
          ).includes(own.name),
        );
        await close();
        await page
          .getByRole("button", { name: "Liderlikleri Yönet", exact: true })
          .click();
        await dialog()
          .getByRole("button", {
            name: "Liderlik: " + f.teamA.lead,
            exact: true,
          })
          .click();
        assert(
          (
            await dialog()
              .getByRole("region", { name: "Bağlı çalışanlar", exact: true })
              .innerText()
          ).includes(own.name),
        );
        assert.equal(
          await dialog()
            .getByLabel("Üst Liderlik", { exact: true })
            .locator("option")
            .filter({ hasText: f.teamA.lead })
            .count(),
          0,
        );
        await close();
      },
    );
    await f.check(
      "directory: dedicated leadership/team lists create records and refresh combo choices",
      async () => {
        await page
          .getByRole("button", { name: "Liderlikleri Yönet", exact: true })
          .click();
        await dialog()
          .getByRole("button", { name: "Yeni Liderlik Ekle", exact: true })
          .click();
        await dialog()
          .getByLabel("Liderlik Adı", { exact: true })
          .fill(leaderName);
        await dialog()
          .getByLabel("Liderlik Yöneticisi", { exact: true })
          .getAttribute("readonly")
          .then((value) => assert.notEqual(value, null));
        await save("/api/leaders/change", "Ekle");
        await dialog()
          .getByRole("button", { name: "Liderlik: " + leaderName, exact: true })
          .waitFor();
        await close();
        await page
          .getByRole("button", { name: "Takımları Yönet", exact: true })
          .click();
        await dialog()
          .getByRole("button", { name: "Yeni Takım Ekle", exact: true })
          .click();
        await dialog().getByLabel("Takım Adı", { exact: true }).fill(teamName);
        await dialog()
          .getByLabel("Liderlik", { exact: true })
          .selectOption(leaderName);
        await dialog()
          .getByLabel("Takım Yöneticisi", { exact: true })
          .getAttribute("readonly")
          .then((value) => assert.notEqual(value, null));
        await save("/api/changes", "Ekle");
        await dialog()
          .getByRole("button", { name: "Takım: " + teamName, exact: true })
          .waitFor();
        const team = (await f.state()).teams.find((t) => t.name === teamName);
        assert.equal(team.lead, leaderName);
        assert.equal(team.catalog, true);
        await f.capture(page, "directory-team-management");
        await close();
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        await page
          .getByRole("button", {
            name: "Kaynak Ekle / Yetki Tanımla",
            exact: true,
          })
          .click();
        assert.equal(
          await dialog()
            .getByLabel("Liderlik", { exact: true })
            .getAttribute("readonly"),
          "",
        );
        await scrollPicker("Takım");
        await choose("Takım", teamName);
        await dialog()
          .getByRole("button", { name: "Close", exact: true })
          .click();
        await page.reload();
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        await page
          .getByRole("button", {
            name: "Kaynak Ekle / Yetki Tanımla",
            exact: true,
          })
          .click();
        await choose("Takım", teamName);
        await dialog()
          .getByRole("button", { name: "Close", exact: true })
          .click();
        await selectWorkspaceTab(page, "Liderlik ve Takımlar");
      },
    );
    await f.check(
      "directory: bulk resource pickers align below their triggers at 90 percent scale and retain keyboard/scroll behavior",
      async () => {
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        await page.getByLabel("Browser Employee seç", { exact: true }).check();
        for (const width of [1800, 1280]) {
          await page.setViewportSize({ width, height: 1050 });
          await page
            .getByRole("button", {
              name: "Seçilenleri Toplu Düzenle",
              exact: true,
            })
            .click();
          await scrollPicker("Yeni takım");
          await choose("Liderlik filtresi", leaderName);
          await choose("Yeni takım", teamName);
          await openPicker("Yeni statü");
          await page.keyboard.press("Escape");
          await picker().waitFor({ state: "hidden" });
          assert.equal(await dialog().count(), 1);
          await openPicker("Liderlik filtresi");
          await page.evaluate(() => window.scrollBy(0, 40));
          const trigger = await dialog()
            .getByRole("button", {
              name: "Liderlik filtresi",
              exact: true,
              includeHidden: true,
            })
            .boundingBox();
          const popup = await picker().boundingBox();
          assert(Math.abs(trigger.x - popup.x) <= 2);
          await page.keyboard.press("Escape");
          await f.capture(page, "resource-bulk-pickers-" + width);
          await dialog()
            .getByRole("button", { name: "Vazgeç", exact: true })
            .click();
        }
        await page
          .getByLabel("Browser Employee seç", { exact: true })
          .uncheck();
        await page.setViewportSize({ width: 1800, height: 1050 });
        await selectWorkspaceTab(page, "Liderlik ve Takımlar");
      },
    );
    await f.check(
      "directory: unrelated project writes do not block a leader draft; catalog edits still require explicit reload",
      async () => {
        await page
          .getByRole("button", { name: "Liderlikleri Yönet", exact: true })
          .click();
        await dialog()
          .getByRole("button", { name: "Liderlik: " + leaderName, exact: true })
          .click();
        await dialog()
          .getByLabel("Üst Liderlik", { exact: true })
          .selectOption(f.teamA.lead);
        const state = await f.state();
        await f.store.mutate(f.actor, (d, u) =>
          applyChanges(d, u, [
            {
              kind: "project",
              id: original.id,
              revision: state.revisions["project:" + original.id],
              value: { ...original, responsibleName: "Remote QA owner" },
            },
          ]),
        );
        await page.evaluate(() =>
          window.dispatchEvent(
            new StorageEvent("storage", { key: "kaynak-planlama-offline-v1" }),
          ),
        );
        const unrelated = await save(
          "/api/leaders/change",
          "Değişiklikleri Kaydet",
        );
        const sent = unrelated.request().postDataJSON();
        assert.equal(
          sent.catalogRevision,
          state.revisions["directory:shared"] || 0,
        );
        assert.equal((await f.state()).leaderParents[leaderName], f.teamA.lead);
        await f.wait(
          async () =>
            !(await dialog()
              .getByRole("button", {
                name: "Değişiklikleri Kaydet",
                exact: true,
              })
              .isEnabled()),
          "saved leader draft settled",
        );
        await dialog()
          .getByLabel("Liderlik Adı", { exact: true })
          .fill(leaderName + " Renamed");
        const catalogState = await f.state();
        await f.store.mutate(f.actor, (d, u, c, generation) =>
          applyLeaderChange(
            d,
            u,
            {
              action: "update",
              name: leaderName,
              managerName: "Remote catalog manager",
              catalogRevision: catalogState.revisions["directory:shared"] || 0,
            },
            c,
            generation,
          ),
        );
        const conflicted = await save(
          "/api/leaders/change",
          "Değişiklikleri Kaydet",
          409,
        );
        assert.equal(
          conflicted.request().postDataJSON().catalogRevision,
          catalogState.revisions["directory:shared"],
        );
        assert.equal(
          (await f.state()).leaderManagers[leaderName],
          "Remote catalog manager",
        );
        assert.equal(
          await dialog()
            .getByLabel("Liderlik Adı", { exact: true })
            .inputValue(),
          leaderName + " Renamed",
        );
        await dialog().getByRole("alert").waitFor();
        page.once("dialog", (d) => d.accept());
        await dialog()
          .getByRole("button", { name: "Güncel Listeyi Yükle", exact: true })
          .click();
        await f.wait(
          async () =>
            (await dialog()
              .getByLabel("Liderlik Adı", { exact: true })
              .inputValue()) === leaderName,
          "explicit leader reload",
        );
        await dialog()
          .getByLabel("Liderlik Adı", { exact: true })
          .fill(leaderName + " Renamed");
        await save("/api/leaders/change", "Değişiklikleri Kaydet");
        await dialog()
          .getByRole("button", {
            name: "Liderlik: " + leaderName + " Renamed",
            exact: true,
          })
          .waitFor();
        assert.equal(
          (await f.state()).teams.find((t) => t.name === teamName).lead,
          leaderName + " Renamed",
        );
        await f.capture(page, "directory-leadership-management");
        await close();
      },
    );
    await f.check(
      "directory: team draft keeps stale revision and remote rename; explicit reload permits a new edit",
      async () => {
        await page
          .getByRole("button", { name: "Takımları Yönet", exact: true })
          .click();
        await dialog()
          .getByRole("button", { name: "Takım: " + teamName, exact: true })
          .click();
        await dialog()
          .getByLabel("Takım Adı", { exact: true })
          .fill("QA Local Team Draft");
        const state = await f.state(),
          team = state.teams.find((t) => t.name === teamName);
        await f.store.mutate(f.actor, (d, u) =>
          applyChanges(d, u, [
            {
              kind: "team",
              id: team.id,
              revision: state.revisions["team:" + team.id],
              value: { ...team, name: "QA Remote Team" },
            },
          ]),
        );
        const response = await save(
          "/api/changes",
          "Değişiklikleri Kaydet",
          409,
        );
        assert.equal(
          response.request().postDataJSON().changes[0].revision,
          state.revisions["team:" + team.id],
        );
        assert.equal(
          await dialog().getByLabel("Takım Adı", { exact: true }).inputValue(),
          "QA Local Team Draft",
        );
        page.once("dialog", (d) => d.accept());
        await dialog()
          .getByRole("button", { name: "Güncel Listeyi Yükle", exact: true })
          .click();
        await f.wait(
          async () =>
            (await dialog()
              .getByLabel("Takım Adı", { exact: true })
              .inputValue()) === "QA Remote Team",
          "explicit team reload",
        );
        await dialog()
          .getByLabel("Takım Adı", { exact: true })
          .fill(teamName + " Renamed");
        await save("/api/changes", "Değişiklikleri Kaydet");
        await dialog()
          .getByRole("button", {
            name: "Takım: " + teamName + " Renamed",
            exact: true,
          })
          .waitFor();
        await close();
      },
    );
    await f.check(
      "directory: referenced team deletion is rejected and unused manual records can be deleted",
      async () => {
        await page
          .getByRole("button", { name: "Takımları Yönet", exact: true })
          .click();
        await dialog()
          .getByRole("button", { name: "Takım: " + f.teamA.name, exact: true })
          .click();
        page.once("dialog", (d) => d.accept());
        await save("/api/changes", "Takımı Sil", 409);
        await dialog().getByRole("alert").waitFor();
        assert((await f.state()).teams.some((t) => t.id === f.teamA.id));
        await dialog()
          .getByRole("button", {
            name: "Takım: " + teamName + " Renamed",
            exact: true,
          })
          .click();
        page.once("dialog", (d) => d.accept());
        await save("/api/changes", "Takımı Sil");
        await f.wait(
          async () =>
            !(await f.state()).teams.some(
              (t) => t.name === teamName + " Renamed",
            ),
          "manual team deleted",
        );
        await close();
        await page
          .getByRole("button", { name: "Liderlikleri Yönet", exact: true })
          .click();
        await dialog()
          .getByRole("button", {
            name: "Liderlik: " + leaderName + " Renamed",
            exact: true,
          })
          .click();
        page.once("dialog", (d) => d.accept());
        await save("/api/leaders/change", "Liderliği Sil");
        await f.wait(
          async () =>
            !(await f.state()).leaders.includes(leaderName + " Renamed"),
          "manual leader deleted",
        );
        await close();
      },
    );
    await f.check(
      "directory: parent leadership and leader role feed a dedicated planning row without duplicate capacity",
      async () => {
        const name = "QA Direct Leadership";
        await page
          .getByRole("button", { name: "Liderlikleri Yönet", exact: true })
          .click();
        await dialog()
          .getByRole("button", { name: "Yeni Liderlik Ekle", exact: true })
          .click();
        await dialog().getByLabel("Liderlik Adı", { exact: true }).fill(name);
        await dialog()
          .getByLabel("Üst Liderlik", { exact: true })
          .selectOption(f.teamA.lead);
        await save("/api/leaders/change", "Ekle");
        assert.equal((await f.state()).leaderParents[name], f.teamA.lead);
        const unit = (await f.state()).leadershipUnits[name];
        assert(unit);
        await close();
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        await page
          .getByRole("button", {
            name: "Kaynak Ekle / Yetki Tanımla",
            exact: true,
          })
          .click();
        await dialog()
          .getByLabel("Ad Soyad", { exact: true })
          .fill("QA Direct Leader Employee");
        await dialog()
          .getByLabel("Kaynak Rolü", { exact: true })
          .selectOption("leader");
        assert.equal(
          await dialog()
            .getByRole("button", { name: "Takım", exact: true })
            .count(),
          0,
        );
        await choose("Liderlik", name);
        await save("/api/changes", "Kaydet");
        await dialog().waitFor({ state: "hidden" });
        const worker = (await f.state()).resources.find(
          (resource) => resource.name === "QA Direct Leader Employee",
        );
        assert.equal(worker.versions.at(-1).team, unit);
        await page
          .getByRole("tab", {
            name: "AA Planlanan Kaynak Dağılımı",
            exact: true,
          })
          .click();
        await page.getByRole("button", { name: "Proje", exact: true }).click();
        await picker()
          .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
          .click();
        await picker()
          .getByRole("checkbox", { name: "Browser Project A", exact: true })
          .check();
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", { name: "Liderlik", exact: true })
          .click();
        await picker()
          .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
          .click();
        await picker().getByRole("checkbox", { name, exact: true }).check();
        await page.keyboard.press("Escape");
        const cell = page.locator(
          '[data-plan-cell="' + unit + '|p-a|2026-01"]',
        );
        await cell.scrollIntoViewIfNeeded();
        assert(
          !(await cell.locator("xpath=..").innerText()).includes(
            "Liderlik · Doğrudan Kaynak",
          ),
        );
        await cell.locator("input").fill("0,5");
        await cell.locator("input").press("Enter");
        await f.wait(
          async () =>
            (await f.state()).allocations[unit + "|p-a|2026-01"] === 0.5,
          "direct leader allocation saved",
        );
        await page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .click();
        const labels = await page
          .locator(".leader-report tbody tr .report-unit-title")
          .allTextContents();
        // Current UI expands child leadership subtotals under the root;
        // only unique root units contribute to the final total.
        assert(labels.some((label) => label.includes(name)));
        assert(labels.some((label) => label.includes(f.teamA.lead)));
        const table = page.locator(".leader-report");
        const childRow = table.locator(`[data-report-leader="${name}"]`);
        const rootRow = table.locator(`[data-report-leader="${f.teamA.lead}"]`);
        assert.equal(await childRow.getAttribute("data-report-depth"), "1");
        assert.equal(await rootRow.getAttribute("data-report-depth"), "0");
        assert.equal(await childRow.locator("td").nth(2).innerText(), "0,5");
        assert.equal(await rootRow.locator("td").nth(2).innerText(), "0,5");
        assert.equal(
          await table.locator('[data-total-month="2026-01"]').innerText(),
          "0,5",
        );
        await f.capture(page, "hierarchy-top-leader-report");
        await f.store.mutate(f.actor, (data, actor) =>
          applyChanges(data, actor, [
            {
              kind: "resource",
              id: worker.id,
              operation: "delete",
              value: null,
              revision: data.revisions["resource:" + worker.id],
            },
            {
              kind: "allocation",
              id: unit + "|p-a|2026-01",
              value: null,
              operation: "delete",
              revision: data.revisions["allocation:" + unit + "|p-a|2026-01"],
            },
          ]),
        );
        await f.store.mutate(f.actor, (data, actor, session, generation) =>
          applyLeaderChange(
            data,
            actor,
            {
              action: "delete",
              name,
              catalogRevision: directoryRevision(data),
            },
            session,
            generation,
          ),
        );
      },
    );
  } catch (error) {
    await f.capture(page, "directory-management-failed");
    throw error;
  } finally {
    await c.context.close();
    await f.store.mutate(f.actor, (d, u) =>
      applyChanges(d, u, [
        {
          kind: "project",
          id: original.id,
          revision: d.revisions["project:" + original.id],
          value: original,
        },
      ]),
    );
  }
}
