import { selectWorkspaceTab } from "./fixture.mjs";
import assert from "node:assert/strict";
import { applyLeaderChange } from "../../backend/operations.mjs";
import { directoryRevision } from "../../shared/directory-policy.ts";
export async function checkEmployeeAccess(f) {
  const { page, context } = await f.client("root-admin");
  const dialog = () => page.locator('[data-slot="dialog-content"]');
  const resources = () => selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
  async function save(status = 200) {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/employees/save") &&
        r.request().method() === "POST",
    );
    await dialog().getByRole("button", { name: "Kaydet", exact: true }).click();
    assert.equal((await response).status(), status);
    if (status === 200) await dialog().waitFor({ state: "hidden" });
  }
  async function choose(label, name) {
    await dialog().getByRole("button", { name: label, exact: true }).click();
    const picker = page.locator('.pickerpanel[data-state="open"]');
    await picker.getByRole("textbox").fill(name);
    await picker.getByRole("button", { name, exact: true }).click();
  }
  async function edit(name) {
    await resources();
    await page
      .getByRole("textbox", { name: "Kaynak ara", exact: true })
      .fill(name);
    await page
      .locator(".resource-table tbody tr")
      .filter({ has: page.getByText(name, { exact: true }) })
      .getByRole("button", { name: "Düzenle", exact: true })
      .click();
  }
  try {
    await f.check(
      "employee access: one navigation entry and legacy opening preference migrates",
      async () => {
        await page.evaluate(() =>
          localStorage.setItem(
            "aa-kaynak-varsayilan-sekme-v1:root-admin",
            "access",
          ),
        );
        await page.reload();
        const tab = page.getByRole("tab", {
          name: "Organizasyon & Çalışan & Yetki",
          exact: true,
        });
        await tab.waitFor();
        assert.equal(await tab.getAttribute("aria-selected"), "true");
        assert.equal(
          await page
            .getByRole("tab", { name: "Yetki Kontrol Ekranı", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await page
            .getByRole("heading", { name: "Hesaplar ve Yetkiler", exact: true })
            .count(),
          0,
        );
      },
    );
    await f.check(
      "organization: legacy teams preference and two views preserve main navigation",
      async () => {
        await page.evaluate(() =>
          localStorage.setItem(
            "aa-kaynak-varsayilan-sekme-v1:root-admin",
            "teams",
          ),
        );
        await page.reload();
        const main = page.getByRole("tablist", {
          name: "Ana sekmeler",
          exact: true,
        });
        const combined = main.getByRole("tab", {
          name: "Organizasyon & Çalışan & Yetki",
          exact: true,
        });
        await combined.waitFor();
        assert.equal(await combined.getAttribute("aria-selected"), "true");
        assert.equal(
          await main
            .getByRole("tab", { name: "Liderlik ve Takımlar", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await main
            .getByRole("tab", {
              name: "Çalışan & Yetki Tanımlama",
              exact: true,
            })
            .count(),
          0,
        );
        const employeeButton = page.getByRole("button", {
          name: "Kaynak Ekle / Yetki Tanımla",
          exact: true,
        });
        const employeeHeight = await employeeButton.evaluate(
          (n) => getComputedStyle(n).height,
        );
        await selectWorkspaceTab(page, "Organizasyon Yapısı");
        assert.equal(await combined.getAttribute("aria-selected"), "true");
        assert.equal(await page.locator(".team-directory").count(), 1);
        assert.equal(await page.locator(".employee-access-table").count(), 0);
        const search = page.getByRole("searchbox", {
          name: "Liderlik veya takım ara",
          exact: true,
        });
        for (const name of ["Liderlikleri Yönet", "Takımları Yönet"]) {
          const button = page.getByRole("button", { name, exact: true });
          assert.equal(
            await button.evaluate((n) => getComputedStyle(n).height),
            employeeHeight,
          );
          const a = await search.boundingBox(),
            b = await button.boundingBox();
          assert(
            Math.abs(a.y - b.y) < 2,
            "search and management buttons share the row",
          );
        }
        await f.capture(page, "organization-directory-view");
        await search.fill(f.teamB.name);
        await page
          .getByRole("button", {
            name: f.teamB.name + " takımını düzenle",
            exact: true,
          })
          .waitFor();
        await search.fill("");
        await page.setViewportSize({ width: 620, height: 900 });
        const toolbar = page.locator(".directory-toolbar");
        assert(
          await toolbar.evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
        );
        for (const name of ["Liderlikleri Yönet", "Takımları Yönet"]) {
          const a = await search.boundingBox(),
            b = await page
              .getByRole("button", { name, exact: true })
              .boundingBox();
          assert(
            a.y + a.height <= b.y + 1 ||
              b.y + b.height <= a.y + 1 ||
              a.x + a.width <= b.x + 1 ||
              b.x + b.width <= a.x + 1,
            "toolbar controls do not overlap",
          );
        }
        await f.capture(page, "organization-directory-mobile");
        await page.setViewportSize({ width: 1800, height: 1050 });
        await resources();
        assert.equal(await combined.getAttribute("aria-selected"), "true");
        assert.equal(await page.locator(".team-directory").count(), 0);
        assert.equal(await page.locator(".employee-access-table").count(), 1);
      },
    );
    await f.check(
      "employee access: one table retains root and unlinked accounts without role cards or a separate AD creation button",
      async () => {
        assert.equal(await page.locator(".employee-access-table").count(), 1);
        assert.equal(await page.locator(".access-role-overview").count(), 0);
        assert.equal(
          await page
            .getByRole("button", {
              name: "AD Kullanıcısına Yetki Tanımla",
              exact: true,
            })
            .count(),
          0,
        );
        const root = page.locator('tr[data-account-id="root-admin"]');
        assert.match(await root.innerText(), /Ana yönetici/);
        assert.equal(await root.locator('input[type="checkbox"]').count(), 0);
        assert.equal(await root.getByRole("button").count(), 0);
        assert.equal(
          await page.locator('tr[data-resource-id="r-own"]').count(),
          1,
        );
        assert.match(
          await page.locator('tr[data-resource-id="r-own"]').innerText(),
          /qa.employee/,
        );
        assert.equal(
          await page.locator('tr[data-account-id="unmapped"]').count(),
          1,
        );
        assert.equal(
          await page
            .getByRole("button", { name: "Yetkileri Düzenle", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await page
            .getByRole("button", { name: "Yetkiyi Sil", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await page
            .locator('tr[data-account-id="unmapped"]')
            .getByRole("button", { name: "Düzenle", exact: true })
            .count(),
          1,
        );
        await f.capture(page, "unified-employee-account-table");
      },
    );
    await f.check(
      "employee access: new employee and directory manager save in one request",
      async () => {
        await page
          .getByRole("button", {
            name: "Kaynak Ekle / Yetki Tanımla",
            exact: true,
          })
          .click();
        await dialog()
          .getByLabel("Ad Soyad", { exact: true })
          .fill("Manual name to replace");
        await choose("Takım", f.teamA.name);
        await dialog()
          .getByLabel("Hesap Eşleştirmesi", { exact: true })
          .selectOption("new-ad");
        const mainName = dialog()
          .getByLabel("Ad Soyad", { exact: true })
          .first();
        assert.equal(await mainName.inputValue(), "");
        assert.equal(await mainName.getAttribute("readonly"), "");
        await dialog()
          .getByLabel("Hesap Eşleştirmesi", { exact: true })
          .selectOption("");
        assert.equal(await mainName.inputValue(), "Manual name to replace");
        assert.equal(await mainName.getAttribute("readonly"), null);
        await dialog()
          .getByLabel("Hesap Eşleştirmesi", { exact: true })
          .selectOption("new-ad");
        const accountFields = dialog().locator(".resource-account-section");
        assert.equal(
          await accountFields
            .getByLabel("Hesap Açılacak Çalışan", { exact: true })
            .count(),
          0,
        );
        await accountFields
          .getByLabel("Kullanıcı Ara", { exact: true })
          .fill("new.manager");
        await accountFields
          .getByRole("button", { name: "Ara / Yenile", exact: true })
          .click();
        await accountFields
          .getByRole("button", {
            name: "Directory New Account kullanıcısını seç",
            exact: true,
          })
          .click();
        for (const [label, value] of [
          ["Ad Soyad", "Directory New Account"],
          ["Kullanıcı Adı", "qa.new-manager"],
          ["E-posta", "new.manager@example.test"],
        ]) {
          const field = accountFields.getByLabel(label, { exact: true });
          assert.equal(await field.inputValue(), value);
          assert.equal(await field.getAttribute("readonly"), "");
        }
        const employeeName = dialog()
          .getByLabel("Ad Soyad", { exact: true })
          .first();
        assert.equal(await employeeName.inputValue(), "Directory New Account");
        assert.equal(await employeeName.getAttribute("readonly"), "");
        await employeeName.click();
        await page.keyboard.type("Cannot change");
        assert.equal(await employeeName.inputValue(), "Directory New Account");
        await dialog()
          .getByLabel("Rol", { exact: true })
          .selectOption("manager");
        assert.equal(
          await dialog()
            .getByLabel("Uygulamadaki Çalışan Kaydı", { exact: true })
            .count(),
          0,
        );
        await f.capture(page, "combined-resource-access-draft");
        await save();
        const data = await f.state(),
          employee = data.resources.find(
            (r) => r.name === "Directory New Account",
          );
        assert(employee);
        const account = await f.store.findUser({ directoryId: "f".repeat(32) });
        assert.equal(account.resourceId, employee.id);
        assert.equal(account.role, "manager");
        assert.deepEqual(account.leaders, [f.teamA.lead]);
        await page
          .getByRole("textbox", { name: "Kaynak ara", exact: true })
          .fill(employee.name);
        const row = page
          .locator(".resource-table tbody tr")
          .filter({ has: page.getByText(employee.name, { exact: true }) });
        assert.match(await row.innerText(), /qa.new-manager/);
      },
    );
    await f.check(
      "employee access: conflict preserves resource and permission drafts",
      async () => {
        await edit("Directory New Account");
        const note = dialog().getByRole("textbox", { name: /^Açıklama/ });
        await note.fill("QA Preserved Draft");
        await dialog()
          .getByLabel("Rol", { exact: true })
          .selectOption("normal");
        await page.route("**/api/employees/save", (route) =>
          route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Synthetic combined revision conflict",
            }),
          }),
        );
        await save(409);
        assert.equal(await note.inputValue(), "QA Preserved Draft");
        assert.equal(
          await dialog().getByLabel("Rol", { exact: true }).inputValue(),
          "normal",
        );
        assert.match(
          await dialog().getByRole("alert").innerText(),
          /Synthetic combined revision conflict/,
        );
        await page.unroute("**/api/employees/save");
        await page.keyboard.press("Escape");
      },
    );
    await f.check(
      "employee access: employee form revokes account while keeping employee",
      async () => {
        await edit("Directory New Account");
        page.once("dialog", (d) => d.accept());
        await dialog()
          .getByRole("button", {
            name: "Uygulama Yetkisini Kaldır",
            exact: true,
          })
          .click();
        await save();
        const account = await f.store.findUser({ directoryId: "f".repeat(32) });
        assert.equal(account.active, false);
        assert.equal(account.resourceId, "");
        assert(
          (await f.state()).resources.some(
            (r) => r.name === "Directory New Account",
          ),
        );
      },
    );
    await f.check(
      "directory hierarchy: child leadership follows parent as an indented unit and search retains parent",
      async () => {
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
        await page.reload();
        await selectWorkspaceTab(page, "Liderlik ve Takımlar");
        const child = page.locator(".directory-child-leadership").filter({
          has: page.getByRole("button", {
            name: f.teamB.lead + " liderliğini düzenle",
            exact: true,
          }),
        });
        await child.waitFor();
        assert.equal(await child.getAttribute("data-depth"), "1");
        assert.match(await child.innerText(), /Alt Liderlik/);
        const rows = await page
          .locator(".team-directory tbody tr")
          .allTextContents();
        const parentIndex = rows.findIndex(
          (t) => t.includes(f.teamA.lead) && !t.includes("Alt Liderlik"),
        );
        const childIndex = rows.findIndex(
          (t) => t.includes(f.teamB.lead) && t.includes("Alt Liderlik"),
        );
        assert(childIndex > parentIndex);
        const childTeams = page.locator(".directory-nested-team").filter({
          has: page.getByRole("button", {
            name: f.teamB.name + " tak\u0131m\u0131n\u0131 d\u00fczenle",
            exact: true,
          }),
        });
        assert.equal(await childTeams.count(), 1);
        assert.equal(
          await childTeams.getAttribute("data-directory-lead"),
          f.teamB.lead,
        );
        assert.equal(await childTeams.getAttribute("data-depth"), "2");
        assert.equal(
          await childTeams
            .locator("td")
            .first()
            .evaluate((n) => getComputedStyle(n).paddingLeft),
          "40px",
        );
        const sequence = await page
          .locator(".team-directory tbody tr")
          .evaluateAll((nodes) =>
            nodes.map((n) => ({
              child: n.classList.contains("directory-child-leadership"),
              lead: n.dataset.directoryLead || "",
            })),
          );
        const heading = sequence.findIndex(
          (n, i) => n.child && rows[i].includes(f.teamB.lead),
        );
        assert.equal(sequence[heading + 1].lead, f.teamB.lead);

        await page
          .getByRole("searchbox", {
            name: "Liderlik veya takım ara",
            exact: true,
          })
          .fill(f.teamB.name);
        assert.equal(await page.locator(".directory-group").count(), 2);
        assert.equal(
          await page.locator(".directory-team").count(),
          (await f.state()).teams.filter(
            (t) => t.kind !== "leadership" && t.lead === f.teamB.lead,
          ).length,
        );
        await f.capture(page, "nested-leadership-directory");
      },
    );
    await f.check(
      "directory leadership: linked leaders and teams are listed without duplicate leadership capacity rows",
      async () => {
        await page
          .getByRole("button", { name: "Liderlikleri Yönet", exact: true })
          .click();
        await dialog()
          .getByRole("button", {
            name: "Liderlik: " + f.teamA.lead,
            exact: true,
          })
          .click();
        const region = dialog().getByRole("region", {
          name: "Bağlı takımlar ve liderlikler",
          exact: true,
        });
        const data = await f.state();
        const expected = data.teams.filter(
          (t) =>
            t.kind !== "leadership" &&
            [f.teamA.lead, f.teamB.lead].includes(t.lead),
        );
        assert.equal(
          await region.locator('li[data-directory-kind="team"]').count(),
          expected.length,
        );
        assert.equal(
          await region.locator('li[data-directory-kind="leader"]').count(),
          1,
        );
        assert.equal(
          await region
            .locator('li[data-directory-kind="leader"]')
            .getByText(f.teamB.lead, { exact: true })
            .count(),
          1,
        );
        assert.equal(
          await region
            .locator('li[data-directory-kind="leader"]')
            .getByText(f.teamA.lead, { exact: true })
            .count(),
          0,
        );
        for (const team of expected)
          assert.equal(
            await region
              .locator('li[data-directory-kind="team"]')
              .getByText(team.name, { exact: true })
              .count(),
            1,
          );
        assert.match(
          await region.innerText(),
          /Alt liderliklerin takımları dahildir/,
        );
        assert.match(await region.innerText(), /Doğrudan bağlı/);
        assert.match(
          await region.innerText(),
          new RegExp("Alt liderlik · " + f.teamB.lead),
        );
        await f.capture(page, "leadership-linked-teams");
        await dialog()
          .getByRole("button", {
            name: "Liderlik: " + f.teamB.lead,
            exact: true,
          })
          .click();
        const childTeams = data.teams.filter(
          (t) => t.kind !== "leadership" && t.lead === f.teamB.lead,
        );
        assert.equal(
          await region.locator('li[data-directory-kind="team"]').count(),
          childTeams.length,
        );
        assert.equal(
          await region.locator('li[data-directory-kind="leader"]').count(),
          0,
        );
        for (const team of childTeams)
          assert.equal(
            await region
              .locator('li[data-directory-kind="team"]')
              .getByText(team.name, { exact: true })
              .count(),
            1,
          );
        for (const team of expected.filter((t) => t.lead === f.teamA.lead))
          assert.equal(
            await region
              .locator('li[data-directory-kind="team"]')
              .getByText(team.name, { exact: true })
              .count(),
            0,
          );
        await dialog()
          .getByRole("button", { name: "Kapat", exact: true })
          .click();
      },
    );
    await f.check(
      "directory leadership: empty, leadership-only and new drafts have correct linked organization state",
      async () => {
        const name = "QA Empty Team Listing";
        await f.store.mutate(f.actor, (d, u, c, g) =>
          applyLeaderChange(
            d,
            u,
            { action: "create", name, catalogRevision: directoryRevision(d) },
            c,
            g,
          ),
        );
        await page.reload();
        await selectWorkspaceTab(page, "Organizasyon Yapısı");
        await page
          .getByRole("button", { name: "Liderlikleri Yönet", exact: true })
          .click();
        await dialog()
          .getByRole("button", { name: "Liderlik: " + name, exact: true })
          .click();
        const region = dialog().getByRole("region", {
          name: "Bağlı takımlar ve liderlikler",
          exact: true,
        });
        assert.match(await region.innerText(), /0 takım/);
        assert.match(
          await region.innerText(),
          /Bu liderliğe bağlı takım veya alt liderlik bulunmuyor/,
        );
        await dialog()
          .getByRole("button", { name: "Kapat", exact: true })
          .click();
        const child = "QA Empty Child Leadership";
        await f.store.mutate(f.actor, (d, u, c, g) =>
          applyLeaderChange(
            d,
            u,
            {
              action: "create",
              name: child,
              parentName: name,
              catalogRevision: directoryRevision(d),
            },
            c,
            g,
          ),
        );
        const grandchild = "QA Empty Grandchild Leadership";
        await f.store.mutate(f.actor, (d, u, c, g) =>
          applyLeaderChange(
            d,
            u,
            {
              action: "create",
              name: grandchild,
              parentName: child,
              catalogRevision: directoryRevision(d),
            },
            c,
            g,
          ),
        );
        await page.reload();
        await selectWorkspaceTab(page, "Organizasyon Yapısı");
        await page
          .getByRole("button", { name: "Liderlikleri Yönet", exact: true })
          .click();
        await dialog()
          .getByRole("button", { name: "Liderlik: " + name, exact: true })
          .click();
        assert.equal(
          await region.locator('li[data-directory-kind="team"]').count(),
          0,
        );
        assert.equal(
          await region.locator('li[data-directory-kind="leader"]').count(),
          2,
        );
        for (const leader of [child, grandchild])
          assert.equal(
            await region.getByText(leader, { exact: true }).count(),
            1,
          );
        assert.match(await region.innerText(), /2 liderlik · 0 takım/);
        assert.match(
          await region.innerText(),
          /Üst liderlik · QA Empty Child Leadership/,
        );
        assert.equal(
          await region
            .getByText(
              "Bu liderliğe bağlı takım veya alt liderlik bulunmuyor.",
              { exact: true },
            )
            .count(),
          0,
        );
        await dialog()
          .getByRole("button", { name: "Yeni Liderlik Ekle", exact: true })
          .click();
        assert.equal(await region.count(), 0);
        await dialog()
          .getByRole("button", { name: "Kapat", exact: true })
          .click();
      },
    );
  } catch (error) {
    await f.capture(page, "employee-access-failure").catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
