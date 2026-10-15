import assert from "node:assert/strict";
import { selectWorkspaceTab } from "./fixture.mjs";

export async function checkAdAdminRole(f) {
  const { page, context } = await f.client("root-admin");
  const dialog = () =>
    page.locator('.employee-access-editor[data-state="open"]');
  async function save() {
    const pending = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/employees/save") &&
        r.request().method() === "POST",
    );
    await dialog().getByRole("button", { name: "Kaydet", exact: true }).click();
    const response = await pending;
    assert.equal(response.status(), 200);
    await dialog().waitFor({ state: "hidden" });
  }
  let resourceId, accountId;
  try {
    await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
    await f.check(
      "AD admin: new directory account can select Admin and retains employee linkage",
      async () => {
        await page
          .getByRole("button", {
            name: "Kaynak Ekle / Yetki Tanımla",
            exact: true,
          })
          .click();
        await dialog()
          .getByLabel("Ad Soyad", { exact: true })
          .fill("QA AD Administrator");
        for (const [label, value] of [
          ["Liderlik", f.teamA.lead],
          ["Takım", f.teamA.name],
        ]) {
          await dialog()
            .getByRole("button", { name: label, exact: true })
            .click();
          const picker = page.locator('.pickerpanel[data-state="open"]');
          await picker.getByRole("textbox").fill(value);
          await picker
            .getByRole("button", { name: value, exact: true })
            .click();
        }
        await dialog()
          .getByLabel("Hesap Eşleştirmesi", { exact: true })
          .selectOption("new-ad");
        const fields = dialog().locator(".resource-account-section");
        await fields
          .getByLabel("Kullanıcı Ara", { exact: true })
          .fill("new.manager");
        await fields
          .getByRole("button", { name: "Ara / Yenile", exact: true })
          .click();
        await fields
          .getByRole("button", {
            name: "Directory New Account kullanıcısını seç",
            exact: true,
          })
          .click();
        await fields.getByLabel("Rol", { exact: true }).selectOption("admin");
        assert.equal(await fields.locator(".access-leader-field").count(), 0);
        await save();
        const data = await f.state();
        const resource = data.resources.find(
          (r) => r.name === "Directory New Account",
        );
        const account = await f.store.findUser({ directoryId: "f".repeat(32) });
        assert(resource);
        resourceId = resource.id;
        accountId = account._id;
        assert.equal(account.role, "admin");
        assert.equal(account.resourceId, resourceId);
        assert.equal(account.authSource, "ldap");
        assert.deepEqual(account.leaders, []);
        assert.equal(
          await page
            .locator(
              `tr[data-account-id="${accountId}"][data-resource-id="${resourceId}"]`,
            )
            .count(),
          1,
        );
        const root = page.locator('tr[data-account-id="root-admin"]');
        assert.equal(
          await root
            .getByRole("button", { name: "Düzenle", exact: true })
            .count(),
          0,
        );
      },
    );
    await f.check(
      "AD admin: existing account can change role and regain Admin without detaching the employee",
      async () => {
        const row = () => page.locator(`tr[data-account-id="${accountId}"]`);
        await row()
          .getByRole("button", { name: "Düzenle", exact: true })
          .click();
        assert.equal(
          await dialog().getByLabel("Rol", { exact: true }).inputValue(),
          "admin",
        );
        await dialog()
          .getByLabel("Rol", { exact: true })
          .selectOption("manager");
        await save();
        let account = await f.store.findUser({ id: accountId });
        assert.equal(account.role, "manager");
        assert.equal(account.resourceId, resourceId);
        await row()
          .getByRole("button", { name: "Düzenle", exact: true })
          .click();
        await dialog().getByLabel("Rol", { exact: true }).selectOption("admin");
        await f.capture(page, "ad-admin-role");
        await save();
        account = await f.store.findUser({ id: accountId });
        assert.equal(account.role, "admin");
        assert.equal(account.resourceId, resourceId);
        assert.deepEqual(account.leaders, []);
      },
    );
  } finally {
    await context.close();
  }
}
