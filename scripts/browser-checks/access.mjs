import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";

export async function loginUI(page, id, password) {
  await page.getByLabel("Kullanıcı Adı", { exact: true }).fill("qa." + id);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş Yap", exact: true }).click();
  await page
    .getByRole("tab", { name: "AA Risk Yönetimi", exact: true })
    .waitFor();
}
const openAccess = (page) =>
  page
    .getByRole("tab", {
      name: "Organizasyon & Çalışan & Yetki",
      exact: true,
    })
    .click();
async function editAccount(page, id) {
  await page
    .getByRole("textbox", { name: "Kaynak ara", exact: true })
    .fill("qa." + id);
  await page
    .locator(".accesstable tbody tr")
    .getByRole("button", { name: "Düzenle", exact: true })
    .click();
  const form = page.locator(
    ".employee-access-editor, .access-permission-dialog",
  );
  await form.waitFor();
  return form;
}
export async function checkAccess(f) {
  const admin = await f.client("root-admin"),
    page = admin.page;
  try {
    await f.check(
      "auth: login errors, remember/reload, password visibility and logout",
      async () => {
        const c = await f.client("employee", { login: false }),
          p = c.page;
        await p
          .getByLabel("Kullanıcı Adı", { exact: true })
          .fill("qa.employee");
        await p
          .getByLabel("Şifre", { exact: true })
          .fill("Wrong test password");
        await p.getByRole("button", { name: "Giriş Yap", exact: true }).click();
        await p.getByRole("alert").waitFor();
        await p
          .getByRole("button", { name: "Şifreyi Göster", exact: true })
          .click();
        assert.equal(
          await p.getByLabel("Şifre", { exact: true }).getAttribute("type"),
          "text",
        );
        await p
          .getByRole("button", { name: "Şifreyi Gizle", exact: true })
          .click();
        await p
          .getByRole("checkbox", { name: "Beni Hatırla", exact: true })
          .check();
        await loginUI(p, "employee", f.password);
        await p.reload();
        await p
          .getByRole("tab", { name: "AA Risk Yönetimi", exact: true })
          .waitFor();
        const cookies = await c.context.cookies();
        assert(cookies.some((cookie) => cookie.httpOnly));
        assert.equal(
          await p
            .getByRole("tab", {
              name: "Organizasyon & Çalışan & Yetki",
              exact: true,
            })
            .count(),
          0,
        );
        assert.equal(
          await p
            .getByRole("button", { name: "Veri Yedeği İndir", exact: true })
            .count(),
          0,
        );
        assert(
          !(await p.evaluate(() => JSON.stringify(localStorage))).includes(
            f.password,
          ),
        );
        await p.getByRole("button", { name: "Çıkış", exact: true }).click();
        await p.getByLabel("Kullanıcı Adı", { exact: true }).waitFor();
        await p.reload();
        await p.getByLabel("Kullanıcı Adı", { exact: true }).waitFor();
        await c.context.close();
      },
    );
    await openAccess(page);
    await f.check(
      "access: root admin is protected; role/resource edits revoke the employee's old session",
      async () => {
        await page
          .getByRole("textbox", { name: "Kaynak ara", exact: true })
          .fill("qa.root-admin");
        assert.equal(
          await page
            .locator(".accesstable tbody tr")
            .getByRole("button", { name: "Düzenle", exact: true })
            .count(),
          0,
        );
        const employee = await f.client("employee");
        const form = await editAccount(page, "employee");
        await form.getByLabel("Rol", { exact: true }).selectOption("manager");
        await form.getByRole("button", { name: "Kaydet", exact: true }).click();
        await form.waitFor({ state: "hidden" });
        assert.equal(
          (await f.store.findUser({ id: "employee" })).role,
          "manager",
        );
        assert.equal(
          (await f.store.findUser({ id: "employee" })).resourceId,
          "r-own",
        );
        await employee.page.reload();
        await employee.page
          .getByLabel("Kullanıcı Adı", { exact: true })
          .waitFor();
        await loginUI(employee.page, "employee", f.password);
        assert(
          await employee.page
            .getByRole("tab", {
              name: "AA Planlanan Kaynak Dağılımı",
              exact: true,
            })
            .isVisible(),
        );
        assert.equal(
          await employee.page
            .getByRole("tab", {
              name: "Organizasyon & Çalışan & Yetki",
              exact: true,
            })
            .count(),
          0,
        );
        const restoreForm = await editAccount(page, "employee");
        await restoreForm
          .getByLabel("Rol", { exact: true })
          .selectOption("normal");
        await page.route(
          "**/api/employees/save",
          (route) =>
            route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Synthetic permission failure" }),
            }),
          { times: 1 },
        );
        await restoreForm
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        await restoreForm
          .getByRole("alert")
          .filter({ hasText: "Synthetic permission failure" })
          .waitFor();
        assert.equal(
          (await f.store.findUser({ id: "employee" })).role,
          "manager",
        );
        await restoreForm
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        await restoreForm.waitFor({ state: "hidden" });
        assert.equal(
          (await f.store.findUser({ id: "employee" })).resourceId,
          "r-own",
        );
        await employee.page.reload();
        await employee.page
          .getByLabel("Kullanıcı Adı", { exact: true })
          .waitFor();
        await employee.context.close();
      },
    );
    await f.check(
      "access: normal role hides grants; manager can edit leadership scope without changing employee identity",
      async () => {
        const form = await editAccount(page, "employee");
        assert.equal(
          await form
            .getByRole("textbox", {
              name: "Liderlik veya takım ara",
              exact: true,
            })
            .count(),
          0,
        );
        await form.getByLabel("Rol", { exact: true }).selectOption("manager");
        await form
          .getByRole("textbox", {
            name: "Liderlik veya takım ara",
            exact: true,
          })
          .fill(f.teamB.lead);
        await form
          .getByRole("checkbox", { name: f.teamB.lead, exact: true })
          .check();
        assert.equal(
          await form.getByLabel("Çalışan Kaydı", { exact: true }).count(),
          0,
        );
        assert.equal(
          (await f.store.findUser({ id: "employee" })).resourceId,
          "r-own",
        );
        await form.getByRole("button", { name: "Vazgeç", exact: true }).click();
      },
    );
    await f.check(
      "access: stale permission revision cannot overwrite another admin's change",
      async () => {
        const otherAdmin = await f.client("root-admin");
        await openAccess(otherAdmin.page);
        const a = await editAccount(page, "admin-edit"),
          b = await editAccount(otherAdmin.page, "admin-edit");
        await b.getByLabel("Rol", { exact: true }).selectOption("admin");
        await b.getByRole("button", { name: "Kaydet", exact: true }).click();
        await b.waitFor({ state: "hidden" });
        await a.getByLabel("Rol", { exact: true }).selectOption("manager");
        await a.getByRole("button", { name: "Kaydet", exact: true }).click();
        await a.getByRole("alert").waitFor();
        assert.equal(
          (await f.store.findUser({ id: "admin-edit" })).role,
          "admin",
        );
        await f.capture(page, "access-conflict");
        await otherAdmin.context.close();
        await page.reload();
        await openAccess(page);
      },
    );
    await f.check(
      "access: editing own admin role commits then requires login with the new permissions",
      async () => {
        const c = await f.client("admin-edit");
        await openAccess(c.page);
        const form = await editAccount(c.page, "admin-edit");
        await form.getByLabel("Rol", { exact: true }).selectOption("manager");
        await form
          .getByRole("checkbox", { name: f.teamA.lead, exact: true })
          .check();
        await form.getByRole("button", { name: "Kaydet", exact: true }).click();
        await c.page.getByLabel("Kullanıcı Adı", { exact: true }).waitFor();
        assert.equal(
          (await f.store.findUser({ id: "admin-edit" })).role,
          "manager",
        );
        await loginUI(c.page, "admin-edit", f.password);
        assert.equal(
          await c.page
            .getByRole("tab", {
              name: "Organizasyon & Çalışan & Yetki",
              exact: true,
            })
            .count(),
          0,
        );
        await c.context.close();
      },
    );
    await f.check(
      "access: admins provision existing employees and managers retain their own calendar identity",
      async () => {
        await f.store.mutate(f.actor, (data, user) =>
          applyChanges(data, user, [
            {
              kind: "resource",
              id: "r-new-account",
              revision: 0,
              value: {
                id: "r-new-account",
                name: "Browser New Account",
                note: "",
                versions: [
                  {
                    effective: "2026-01",
                    start: "2026-01-01",
                    end: "",
                    team: f.teamA.id,
                    lead: f.teamA.lead,
                    status: "Aktif Çalışan",
                    included: true,
                    amount: 1,
                  },
                ],
              },
            },
          ]),
        );
        await page.reload();
        await openAccess(page);
        await page
          .getByRole("textbox", { name: "Kaynak ara", exact: true })
          .fill("Browser New Account");
        await page
          .locator(".resource-table tbody tr")
          .getByRole("button", { name: "Düzenle", exact: true })
          .click();
        const form = page.locator('[data-slot="dialog-content"]');
        const accountForm = form.locator(".resource-account-section");
        await accountForm
          .getByLabel("Hesap Eşleştirmesi", { exact: true })
          .selectOption("new-ad");
        await accountForm
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
          const input = accountForm.getByLabel(label, { exact: true });
          assert.equal(await input.inputValue(), value);
          assert.equal(await input.getAttribute("readonly"), "");
        }
        assert.equal(await form.locator('input[type="password"]').count(), 0);
        assert.equal(
          await accountForm
            .getByLabel("Uygulamadaki Çalışan Kaydı", { exact: true })
            .count(),
          0,
        );
        assert.equal(
          await form
            .getByRole("textbox", {
              name: "Liderlik veya takım ara",
              exact: true,
            })
            .count(),
          0,
        );
        await form.getByLabel("Rol", { exact: true }).selectOption("manager");
        assert(
          await form
            .getByRole("checkbox", { name: f.teamA.lead, exact: true })
            .isChecked(),
        );
        await f.capture(page, "access-create-directory-employee");
        await form
          .getByRole("button", {
            name: "Kaydet",
            exact: true,
          })
          .click();
        await form.waitFor({ state: "hidden" });
        const saved = await f.store.findUser({ username: "qa.new-manager" });
        assert.equal(saved.role, "manager");
        assert.equal(saved.authSource, "ldap");
        assert.equal(saved.directoryId, "f".repeat(32));
        assert.equal(saved.email, "new.manager@example.test");
        assert.equal(saved.resourceId, "r-new-account");
        const edit = await editAccount(page, "new-manager");
        assert.equal(
          await edit.getByLabel("Çalışan Kaydı", { exact: true }).count(),
          0,
        );
        await edit.getByLabel("Rol", { exact: true }).selectOption("normal");
        assert.equal(
          (await f.store.findUser({ username: "qa.new-manager" })).resourceId,
          "r-new-account",
        );
        await edit.getByRole("button", { name: "Vazgeç", exact: true }).click();
        const manager = await f.client("new-manager");
        await manager.page
          .getByRole("tab", {
            name: "AA Gerçekleşen Kaynak Dağılımı",
            exact: true,
          })
          .click();
        await f.capture(manager.page, "access-manager-own-actual");
        await manager.page
          .locator(".person-allocation tbody tr")
          .filter({ hasText: "Directory New Account" })
          .first()
          .waitFor();
        assert.equal(
          (await f.state()).resources.find(
            (resource) => resource.id === "r-new-account",
          ).name,
          "Directory New Account",
        );
        await manager.context.close();
      },
    );
    await f.check(
      "access: directory disabled state prevents manual provisioning and refresh recovers",
      async () => {
        await page.reload();
        await openAccess(page);
        await page.route(
          "**/api/directory/users?*",
          (route) =>
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                configured: false,
                users: [],
                hasMore: false,
              }),
            }),
          { times: 1 },
        );
        await page
          .getByRole("button", {
            name: "Kaynak Ekle / Yetki Tanımla",
            exact: true,
          })
          .click();
        const form = page.locator('[data-slot="dialog-content"]');
        const directoryResponse = page.waitForResponse((response) =>
          response.url().includes("/api/directory/users?"),
        );
        await form
          .getByLabel("Hesap Eşleştirmesi", { exact: true })
          .selectOption("new-ad");
        await directoryResponse;
        await form
          .getByRole("status")
          .filter({ hasText: "AD kullanıcıları yükleniyor…" })
          .waitFor({ state: "hidden" });
        assert.equal(
          await form
            .getByLabel("Hesap Açılacak Çalışan", { exact: true })
            .count(),
          0,
        );
        assert.equal(await form.locator(".access-directory-select").count(), 0);
        assert.equal(await form.locator('input[type="password"]').count(), 0);
        await form
          .getByRole("button", { name: "Ara / Yenile", exact: true })
          .click();
        const assigned = form.getByRole("button", {
          name: "Directory New Account kullanıcısını seç",
          exact: true,
        });
        await assigned.waitFor();
        assert(await assigned.isDisabled());
        await page.keyboard.press("Escape");
      },
    );
    await f.check(
      "access: select all ignores search, revoke cancels or closes sessions, regrant preserves identity",
      async () => {
        await page.reload();
        await openAccess(page);
        const form = await editAccount(page, "manager");
        await form
          .getByRole("textbox", {
            name: "Liderlik veya takım ara",
            exact: true,
          })
          .fill(f.teamA.lead);
        await form
          .getByRole("button", { name: "Tümünü Seç", exact: true })
          .click();
        await form
          .getByRole("textbox", {
            name: "Liderlik veya takım ara",
            exact: true,
          })
          .fill("");
        const boxes = form.locator('input[type="checkbox"]');
        assert.equal(
          await boxes.count(),
          (await f.state()).leaders.length +
            (await f.state()).teams.filter((team) => team.kind !== "leadership")
              .length,
        );
        for (const box of await boxes.all()) assert(await box.isChecked());
        await form
          .getByRole("button", { name: "Seçimi Temizle", exact: true })
          .click();
        assert.equal(
          await form.locator('input[type="checkbox"]:checked').count(),
          0,
        );
        await form.getByRole("button", { name: "Vazgeç", exact: true }).click();
        const target = await f.client("unmapped");
        await page
          .getByRole("textbox", { name: "Kaynak ara", exact: true })
          .fill("qa.unmapped");
        await page
          .locator('tr[data-account-id="unmapped"]')
          .getByRole("button", { name: "Düzenle", exact: true })
          .click();
        const remove = page.getByRole("dialog").getByRole("button", {
          name: "Uygulama Yetkisini Kaldır",
          exact: true,
        });
        page.once("dialog", (d) => d.dismiss());
        await remove.click();
        assert.equal((await f.store.findUser({ id: "unmapped" })).active, true);
        page.once("dialog", (d) => d.accept());
        await remove.click();
        await page
          .locator(".access-permission-form")
          .waitFor({ state: "hidden" });
        assert.equal(
          (await f.store.findUser({ id: "unmapped" })).active,
          false,
        );
        await target.page.reload();
        await target.page
          .getByLabel("Kullanıcı Adı", { exact: true })
          .waitFor();
        await page
          .locator('tr[data-account-id="unmapped"]')
          .getByRole("button", { name: "Düzenle", exact: true })
          .click();
        await page
          .locator(".access-permission-form")
          .getByRole("button", { name: "Yeniden Yetki Ver", exact: true })
          .click();
        await page
          .locator(".access-permission-form")
          .waitFor({ state: "hidden" });
        assert.equal((await f.store.findUser({ id: "unmapped" })).active, true);
        await target.context.close();
        await page
          .getByRole("textbox", { name: "Kaynak ara", exact: true })
          .fill("qa.root-admin");
        assert.equal(
          await page
            .getByRole("button", { name: "Yetkiyi Sil", exact: true })
            .count(),
          0,
        );
      },
    );
    await f.check(
      "audit: pagination, field diffs, private data masking and retry after read failure",
      async () => {
        const d = await f.state(),
          teams = d.teams.slice(0, 4);
        await f.store.mutate(f.actor, (data, user) =>
          applyChanges(
            data,
            user,
            Array.from({ length: 40 }, (_, i) => {
              const id =
                teams[Math.floor(i / 12)].id +
                "|p-a|2026-" +
                String((i % 12) + 1).padStart(2, "0");
              return {
                kind: "allocation",
                id,
                value: 0.2,
                revision: data.revisions["allocation:" + id] || 0,
              };
            }),
          ),
        );
        await page.route(
          "**/api/audit?*",
          (route) =>
            route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Synthetic audit failure" }),
            }),
          { times: 1 },
        );
        await page
          .getByRole("button", { name: "Değişiklik Geçmişi", exact: true })
          .click();
        await page
          .getByRole("dialog")
          .getByRole("alert")
          .filter({ hasText: "Synthetic audit failure" })
          .waitFor();
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", { name: "Değişiklik Geçmişi", exact: true })
          .click();
        const audit = page.getByRole("dialog");
        await audit.locator(".audit-log-entry").first().waitFor();
        assert.equal(await audit.locator(".audit-log-entry").count(), 30);
        await audit.locator("details summary").first().click();
        assert(await audit.locator("details[open] table").isVisible());
        assert(
          !/PRIVATE_LEAVE_LABEL|PRIVATE_HR_TEST_NOTE|Browser-check-only/.test(
            await audit.innerText(),
          ),
        );
        await audit
          .getByRole("button", { name: "Sonraki", exact: true })
          .click();
        await f.wait(
          async () =>
            (await audit.locator(".audit-log-footer").innerText()).includes(
              "Sayfa 2",
            ),
          "audit page two",
        );
        await audit.locator(".audit-log-entry").first().waitFor();
        await audit
          .getByRole("button", { name: "Önceki", exact: true })
          .click();
        await f.wait(
          async () =>
            (await audit.locator(".audit-log-footer").innerText()).includes(
              "Sayfa 1",
            ),
          "audit first page",
        );
        await f.capture(page, "audit-log");
      },
    );
  } catch (error) {
    await f.capture(page, "access-failure").catch(() => {});
    throw error;
  }
}
