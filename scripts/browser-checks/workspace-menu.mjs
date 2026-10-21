import assert from "node:assert/strict";
import { selectWorkspaceTab } from "./fixture.mjs";

export async function checkWorkspaceMenu(f) {
  const { page, context } = await f.client("root-admin");
  const menu = page.locator("#workspace-main-menu");
  const isOpen = async () => (await menu.getAttribute("data-open")) === "true";
  try {
    await f.check(
      "sol menü: dar ve sabit açık başlar, çalışma alanını örtmez, başlık metni kaldırılmıştır",
      async () => {
        assert.equal(await isOpen(), true);
        assert.equal(
          await menu.getByText("Çalışma alanı", { exact: true }).count(),
          0,
        );
        assert.equal(
          await menu
            .getByRole("button", {
              name: /Menüyü sabitle|Menüyü serbest bırak/,
            })
            .count(),
          0,
        );
        assert(
          Math.abs(
            (await menu.evaluate((el) =>
              parseFloat(getComputedStyle(el).width),
            )) - 244,
          ) < 1,
        );
        const panel = await menu.boundingBox();
        const main = await page.locator(".app > main").boundingBox();
        assert(
          main.x >= panel.x + panel.width - 1,
          "docked menu must not cover content",
        );
        const header = await page.locator("header.mast").boundingBox();
        assert(Math.abs(panel.y - header.y) < 2);
        assert(header.x >= panel.x + panel.width - 1);
        assert.equal(
          await menu
            .getByRole("heading", {
              name: "Askeri Araçlar Kaynak Yönetimi Sistemi",
              exact: true,
            })
            .count(),
          1,
        );
        assert.equal(await page.locator("header.mast h1").count(), 0);
        assert.equal(
          await page
            .getByRole("img", { name: "Otokar", exact: true })
            .evaluate((el) => el.complete && el.naturalWidth > 0),
          true,
        );
        await page.mouse.move(1000, 500);
        await page.waitForTimeout(300);
        assert.equal(
          await isOpen(),
          true,
          "pointer leave does not close a fixed menu",
        );
        await selectWorkspaceTab(page, "Projeler");
        await page.locator(".projectmatrix").waitFor();
        assert.equal(
          await isOpen(),
          true,
          "section changes leave the menu open",
        );
        await f.capture(page, "sabit-dar-sol-menu");
      },
    );
    await f.check(
      "sol menü: içerik kayarken yerinde kalır ve üst barla çakışmaz",
      async () => {
        const beforeHeader = await page.locator("header.mast").boundingBox();
        const beforeMenu = await menu.boundingBox();
        await page.evaluate(() => {
          const space = document.createElement("div");
          space.dataset.menuScrollFixture = "true";
          space.style.height = "1200px";
          document.querySelector(".app > main").append(space);
          window.scrollTo(0, 300);
        });
        await page.waitForTimeout(100);
        const header = await page.locator("header.mast").boundingBox();
        const panel = await menu.boundingBox();
        assert(header.y < beforeHeader.y - 50);
        assert(Math.abs(panel.y - beforeMenu.y) < 2);
        assert(panel.y >= -1);
        assert(panel.y + panel.height <= page.viewportSize().height + 2);
        assert(panel.x + panel.width <= header.x + 1);
        assert.equal(
          await page
            .locator(".workspace-sidebar-host")
            .evaluate((el) => getComputedStyle(el).position),
          "sticky",
        );
        await page.evaluate(() => {
          document.querySelector("[data-menu-scroll-fixture]").remove();
          window.scrollTo(0, 0);
        });
        const viewport = page.viewportSize();
        await page.setViewportSize({ width: 1280, height: 320 });
        const list = menu.getByRole("tablist");
        assert(await list.evaluate((el) => el.scrollHeight > el.clientHeight));
        const lastTab = list.getByRole("tab").last();
        await lastTab.scrollIntoViewIfNeeded();
        const last = await lastTab.boundingBox();
        assert(last.y >= 0 && last.y + last.height <= 321);
        const close = await menu
          .getByRole("button", { name: "Sol menüyü kapat", exact: true })
          .boundingBox();
        assert(close.y >= 0 && close.y + close.height <= 321);
        await page.setViewportSize(viewport);
      },
    );
    await f.check(
      "sol menü: açık/kapalı tercihi hatırlanır; kapalıyken fareyle kendiliğinden açılmaz",
      async () => {
        const before = await page.locator(".app > main").boundingBox();
        await menu
          .getByRole("button", { name: "Sol menüyü kapat", exact: true })
          .click();
        await f.wait(async () => !(await isOpen()), "explicit close");
        assert.equal(await menu.getAttribute("inert"), "");
        assert(
          (await page.locator(".app > main").boundingBox()).width >
            before.width,
        );
        await page.locator(".workspace-menu-edge").hover();
        await page.waitForTimeout(300);
        assert.equal(await isOpen(), false);
        await page.reload();
        await page
          .getByRole("button", { name: "Sol menüyü aç", exact: true })
          .waitFor();
        assert.equal(await isOpen(), false);
        await page
          .getByRole("button", { name: "Sol menüyü aç", exact: true })
          .click();
        await f.wait(isOpen, "edge click reopens");
        await page.reload();
        await page
          .getByRole("button", { name: "Sol menüyü kapat", exact: true })
          .waitFor();
        assert.equal(await isOpen(), true);
      },
    );
    await f.check(
      "sol menü: klavyeyle açma, dikey gezinme ve Escape ile kapatma",
      async () => {
        await selectWorkspaceTab(page, "Projeler");
        await page.locator(".app.tab-projects").waitFor();
        await page
          .getByRole("button", { name: "Sol menüyü kapat", exact: true })
          .click();
        const trigger = page.getByRole("button", {
          name: "Sol menüyü aç",
          exact: true,
        });
        await trigger.focus();
        await page.keyboard.press("Enter");
        const current = menu.locator('[role="tab"][aria-selected="true"]');
        await f.wait(
          async () =>
            await current.evaluate((el) => document.activeElement === el),
          "active tab receives keyboard focus",
        );
        await page.keyboard.press("ArrowDown");
        const progress = menu.getByRole("tab", {
          name: "Proje İlerlemesi",
          exact: true,
        });
        await f.wait(
          async () =>
            await progress.evaluate((el) => document.activeElement === el),
          "vertical arrow navigation",
        );
        await page.keyboard.press("Enter");
        await page.locator(".app.tab-progress").waitFor();
        assert.equal(await isOpen(), true);
        await page.keyboard.press("Escape");
        await f.wait(
          async () => !(await isOpen()),
          "Escape closes focused navigation",
        );
        await f.wait(
          async () =>
            await trigger.evaluate((el) => document.activeElement === el),
          "focus restored to trigger",
        );
      },
    );
    await f.check(
      "sol menü: küçük ekranda panel ve kapatma düğmesi erişilebilir",
      async () => {
        await page.setViewportSize({ width: 320, height: 480 });
        await page
          .getByRole("button", { name: "Sol menüyü aç", exact: true })
          .click();
        await f.wait(async () => {
          const b = await menu.boundingBox();
          return b.x >= 0 && b.x + b.width <= 320;
        }, "narrow panel fits");
        const list = menu.getByRole("tablist");
        assert((await list.getByRole("tab").count()) > 0);
        await menu
          .getByRole("tab", {
            name: "Organizasyon & Çalışan & Yetki",
            exact: true,
          })
          .scrollIntoViewIfNeeded();
        await menu
          .getByRole("button", { name: "Sol menüyü kapat", exact: true })
          .click();
        assert.equal(await isOpen(), false);
        await f.capture(page, "sabit-dar-sol-menu-mobile");
      },
    );
  } finally {
    await context.close();
  }
  for (const role of ["manager", "employee"]) {
    const client = await f.client(role);
    try {
      await f.check(
        `sol menü: ${role} rolünde yetki sınırları korunur`,
        async () => {
          const navigation = client.page.locator("#workspace-main-menu");
          assert.equal(await navigation.getAttribute("data-open"), "true");
          assert.equal(
            await navigation
              .getByRole("tab", {
                name: "Organizasyon & Çalışan & Yetki",
                exact: true,
              })
              .count(),
            0,
          );
          if (role === "employee")
            assert.equal(
              await navigation
                .getByRole("tab", { name: "Proje İlerlemesi", exact: true })
                .count(),
              0,
            );
          await selectWorkspaceTab(client.page, "Projeler");
          await client.page.locator(".projectmatrix").waitFor();
        },
      );
    } finally {
      await client.context.close();
    }
  }
}
