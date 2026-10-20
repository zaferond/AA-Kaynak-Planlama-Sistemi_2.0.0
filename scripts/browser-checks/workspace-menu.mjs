import assert from "node:assert/strict";
import { selectWorkspaceTab } from "./fixture.mjs";

export async function checkWorkspaceMenu(f) {
  const { page, context } = await f.client("root-admin");
  const menu = page.locator("#workspace-main-menu");
  const isOpen = async () => (await menu.getAttribute("data-open")) === "true";
  const outside = () => page.mouse.move(900, 500);
  try {
    await f.check(
      "sol menü: başlangıçta gizli; kenardan açılır, ayrılınca kapanır; çalışma alanı kaymaz",
      async () => {
        assert.equal(await isOpen(), false);
        assert.equal(await menu.getAttribute("inert"), "");
        assert.equal(await menu.getByRole("tab").count(), 0);
        const before = await page.locator(".planning-filterbar").boundingBox();
        const edge = page.getByRole("button", {
          name: "Sol menüyü aç",
          exact: true,
        });
        await edge.hover();
        await f.wait(isOpen, "edge hover opens menu");
        await menu
          .getByRole("tab", { name: "Projeler", exact: true })
          .waitFor();
        const after = await page.locator(".planning-filterbar").boundingBox();
        assert.equal(after.x, before.x);
        assert.equal(after.width, before.width);
        const header = await page.locator("header.mast").boundingBox();
        const panel = await menu.boundingBox();
        assert(Math.abs(panel.y - (header.y + header.height)) < 2);
        await outside();
        await f.wait(
          async () => !(await isOpen()),
          "pointer leave closes menu",
        );
      },
    );
    await f.check(
      "sol menü: sabitleme açık tutar; serbest bırakma ve Escape kapatır",
      async () => {
        await page
          .getByRole("button", { name: "Ana menüyü aç", exact: true })
          .click();
        await menu
          .getByRole("button", { name: "Menüyü sabitle", exact: true })
          .click();
        await outside();
        await page.waitForTimeout(350);
        assert.equal(await isOpen(), true);
        await selectWorkspaceTab(page, "Projeler");
        await page.locator(".projectmatrix").waitFor();
        assert.equal(await isOpen(), true);
        await menu
          .getByRole("button", { name: "Menüyü serbest bırak", exact: true })
          .click();
        await outside();
        await f.wait(
          async () => !(await isOpen()),
          "unpinned menu closes on leave",
        );
        await page
          .getByRole("button", { name: "Ana menüyü aç", exact: true })
          .click();
        await page.keyboard.press("Escape");
        await f.wait(async () => !(await isOpen()), "Escape closes");
        await f.wait(
          async () =>
            await page
              .getByRole("button", { name: "Ana menüyü aç", exact: true })
              .evaluate((el) => document.activeElement === el),
          "Escape restores menu trigger focus",
        );
      },
    );
    await f.check(
      "sol menü: klavye ile açma, dikey oklarla gezinme ve seçim",
      async () => {
        const trigger = page.getByRole("button", {
          name: "Ana menüyü aç",
          exact: true,
        });
        await trigger.focus();
        await page.keyboard.press("Enter");
        await f.wait(
          async () =>
            await menu
              .getByRole("tab", { name: "Projeler", exact: true })
              .evaluate((el) => document.activeElement === el),
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
          "ArrowDown focuses next item",
        );
        assert.equal(await isOpen(), true);
        await page.keyboard.press("Enter");
        await page.locator(".app.tab-progress").waitFor();
        await f.wait(
          async () => !(await isOpen()),
          "successful selection closes unpinned menu",
        );
        await page
          .getByRole("button", { name: "Ana menüyü aç", exact: true })
          .click();
        await outside();
        // Explicitly opened menus also close on a click outside.
        await page
          .locator(".app > main")
          .click({ position: { x: 700, y: 12 } });
        assert.equal(await isOpen(), false);
      },
    );
    await f.check(
      "sol menü: dar ekranda düğmeyle açılır, panel ekrana sığar ve kısa ekranda kaydırılabilir",
      async () => {
        await page.setViewportSize({ width: 320, height: 480 });
        await page
          .getByRole("button", { name: "Ana menüyü aç", exact: true })
          .click();
        await menu
          .getByRole("tab", { name: "Projeler", exact: true })
          .waitFor();
        await f.wait(async () => {
          const b = await menu.boundingBox();
          return b.x >= 0 && b.x + b.width <= 320;
        }, "narrow menu finishes opening within viewport");
        const box = await menu.boundingBox();
        assert(box.x >= 0 && box.x + box.width <= 320);
        const list = menu.getByRole("tablist");
        const dimensions = await list.evaluate((el) => ({
          scroll: el.scrollHeight,
          client: el.clientHeight,
        }));
        assert(dimensions.scroll > dimensions.client);
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
        await f.capture(page, "gizlenen-sol-menu-mobile");
        await page.setViewportSize({ width: 1800, height: 1050 });
        await page
          .getByRole("button", { name: "Ana menüyü aç", exact: true })
          .click();
        await f.capture(page, "gizlenen-sol-menu-desktop");
      },
    );
  } finally {
    await context.close();
  }
  for (const role of ["manager", "employee"]) {
    const client = await f.client(role);
    try {
      await f.check(
        `sol menü: ${role} rolünde yönetim bağlantıları gösterilmez`,
        async () => {
          await client.page
            .getByRole("button", { name: "Ana menüyü aç", exact: true })
            .click();
          assert.equal(
            await client.page
              .getByRole("tab", {
                name: "Organizasyon & Çalışan & Yetki",
                exact: true,
              })
              .count(),
            0,
          );
          if (role === "employee")
            assert.equal(
              await client.page
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
