import { selectWorkspaceTab } from "./fixture.mjs";
import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";
export async function checkPermissionPopup(f) {
  const { page, context } = await f.client("root-admin");
  const original = (await f.state()).resources.find((r) => r.id === "r-own");
  const row = () => page.locator('tr[data-account-id="employee"]');
  const popup = () =>
    page.locator('.employee-access-editor[data-state="open"]');
  try {
    await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
    await f.check(
      "permissions: modal replaces inline form, fits small screens and restores focus on cancel",
      async () => {
        const before = await f.state();
        const button = row().getByRole("button", {
          name: "Düzenle",
          exact: true,
        });
        await button.click();
        await popup().waitFor();
        assert.equal(await popup().getAttribute("role"), "dialog");
        assert.equal(
          await page
            .locator(".employee-access-panel .access-permission-form")
            .count(),
          0,
        );
        assert.equal(
          await popup().getByLabel("Rol", { exact: true }).inputValue(),
          "normal",
        );
        assert.equal(
          await popup().locator(".access-leader-field").count(),
          0,
          "Normal users do not see leadership grant controls",
        );
        await popup()
          .getByLabel("Rol", { exact: true })
          .selectOption("manager");
        const grants = popup().getByRole("group", {
          name: "Planlanan Kaynak Dağılımı Yetkisi",
          exact: true,
        });
        await grants.waitFor();
        const selected = await grants
          .locator('input[type="checkbox"]:checked')
          .count();
        assert.equal(
          await popup()
            .getByText(
              "Liderlik seçimi normal kullanıcıya plan düzenleme yetkisi vermez.",
              { exact: true },
            )
            .count(),
          0,
        );
        await popup().getByLabel("Rol", { exact: true }).selectOption("normal");
        assert.equal(await popup().locator(".access-leader-field").count(), 0);
        await popup()
          .getByLabel("Rol", { exact: true })
          .selectOption("manager");
        assert.equal(
          await grants.locator('input[type="checkbox"]:checked').count(),
          selected,
          "Hiding grant controls preserves the pending selection",
        );
        await popup().getByLabel("Rol", { exact: true }).selectOption("normal");
        await page.setViewportSize({ width: 900, height: 600 });
        await f.wait(async () => {
          const rect = await popup().boundingBox();
          return (
            rect.x >= 0 &&
            rect.y >= 0 &&
            rect.x + rect.width <= 901 &&
            rect.y + rect.height <= 601
          );
        }, "permission popup fits resized viewport");
        await f.capture(page, "permission-popup-small-screen");
        await popup()
          .getByRole("button", { name: "Vazgeç", exact: true })
          .click();
        await popup().waitFor({ state: "hidden" });
        await f.wait(
          () => button.evaluate((el) => document.activeElement === el),
          "focus restored after modal close",
        );
        await button.click();
        await popup().waitFor();
        await page.keyboard.press("Escape");
        await popup().waitFor({ state: "hidden" });
        assert.deepEqual(await f.state(), before);
        await page.setViewportSize({ width: 1800, height: 1050 });
      },
    );
    await f.check(
      "permissions: pending save cannot dismiss modal; failed save keeps role draft and retry succeeds",
      async () => {
        await row()
          .getByRole("button", { name: "Düzenle", exact: true })
          .click();
        await popup()
          .getByLabel("Rol", { exact: true })
          .selectOption("manager");
        let release, started;
        const pending = new Promise((resolve) => {
          release = resolve;
        });
        const requestStarted = new Promise((resolve) => {
          started = resolve;
        });
        await page.route(
          "**/api/employees/save",
          async (route) => {
            started();
            await pending;
            await route.fulfill({
              status: 409,
              contentType: "application/json",
              body: JSON.stringify({ error: "Synthetic permission conflict" }),
            });
          },
          { times: 1 },
        );
        await popup()
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        await requestStarted;
        await page.keyboard.press("Escape");
        assert.equal(await popup().count(), 1);
        assert(
          await popup()
            .getByRole("button", { name: "Vazgeç", exact: true })
            .isDisabled(),
        );
        release();
        await popup()
          .getByRole("alert")
          .filter({ hasText: "Synthetic permission conflict" })
          .waitFor();
        assert.equal(
          await popup().getByLabel("Rol", { exact: true }).inputValue(),
          "manager",
        );
        await popup()
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        await popup().waitFor({ state: "hidden" });
        assert.equal(
          (await f.store.findUser({ id: "employee" })).role,
          "manager",
        );
      },
    );
    await f.check(
      "employee table: every column wraps, long employee text stays inside its cell and row grows",
      async () => {
        const longName = "Synthetic Very Long Employee Name ".repeat(5) + "END";
        await f.store.mutate(f.actor, (d, u) =>
          applyChanges(d, u, [
            {
              kind: "resource",
              id: original.id,
              revision: d.revisions["resource:" + original.id],
              value: { ...original, name: longName },
            },
          ]),
        );
        await page.reload();
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        const table = page.locator(".employee-access-table");
        for (const cell of await table.locator("th,td").all()) {
          assert.equal(
            await cell.evaluate((el) => getComputedStyle(el).whiteSpace),
            (await cell.getAttribute("class"))?.includes("resource-description")
              ? "pre-wrap"
              : "normal",
          );
          assert.equal(
            await cell.evaluate((el) => getComputedStyle(el).overflowWrap),
            "anywhere",
          );
        }
        const name = row().locator("td").nth(1).locator("strong");
        assert.equal(await name.innerText(), longName);
        const bounds = await name.boundingBox(),
          cell = await row().locator("td").nth(1).boundingBox();
        assert(bounds.height > 50);
        assert(
          bounds.x >= cell.x &&
            bounds.x + bounds.width <= cell.x + cell.width + 1,
        );
        for (const selector of [
          ".badge",
          ".access-role-badge",
          ".button",
          ".subline",
        ]) {
          for (const element of await table.locator(selector).all())
            assert.equal(
              await element.evaluate((el) => getComputedStyle(el).whiteSpace),
              "normal",
            );
        }
        await f.capture(page, "employee-table-wrapped-text");
      },
    );
  } catch (e) {
    await f.capture(page, "permission-popup-failure").catch(() => {});
    throw e;
  } finally {
    await context.close();
    await f.store.mutate(f.actor, (d, u) =>
      applyChanges(d, u, [
        {
          kind: "resource",
          id: original.id,
          revision: d.revisions["resource:" + original.id],
          value: original,
        },
      ]),
    );
  }
}
