import assert from "node:assert/strict";
import { selectWorkspaceTab } from "./fixture.mjs";

export async function checkTodayLineVisibility(f) {
  const { page, context } = await f.client("root-admin");
  const table = page.locator(".projectmatrix");
  const container = table.locator("..");
  const marker = container.locator(".today-date-line");
  async function centerLine() {
    await container.evaluate((c) => {
      c.style.width = "650px";
      c.scrollLeft =
        Number.parseFloat(c.querySelector(".today-date-line").style.left) -
        c.clientWidth / 2;
    });
    await f.wait(
      async () =>
        (await marker.evaluate((e) => getComputedStyle(e).visibility)) ===
        "visible",
      "today line visible in calendar columns",
    );
  }
  async function assertPainted() {
    assert(
      await table.evaluate((t) => {
        const marker = t.parentElement.querySelector(".today-date-line");
        const r = marker.getBoundingClientRect();
        const row = t
          .querySelector("[data-project-heading]")
          .getBoundingClientRect();
        marker.style.pointerEvents = "auto";
        try {
          return (
            document.elementFromPoint(
              r.left + r.width / 2,
              row.top + row.height / 2,
            ) === marker
          );
        } finally {
          marker.style.pointerEvents = "";
        }
      }),
      "today line must paint above project-row backgrounds",
    );
    assert(
      await table.evaluate((t) => {
        const marker = t.parentElement.querySelector(".today-date-line");
        const x = marker.getBoundingClientRect().left;
        const header = t.querySelector("thead").getBoundingClientRect();
        marker.style.pointerEvents = "auto";
        try {
          return !!document
            .elementFromPoint(x, header.bottom - 5)
            ?.closest("thead");
        } finally {
          marker.style.pointerEvents = "";
        }
      }),
      "calendar headers must paint above the today line",
    );
  }
  try {
    await selectWorkspaceTab(page, "AA Mühendislik Liderliği Projeler");
    await page.locator(".planning-filterbar .period select").selectOption("24");
    for (const weekly of [false, true]) {
      await f.check(
        `today line: ${weekly ? "weekly" : "monthly"} project rows show it, headers and frozen labels stay protected`,
        async () => {
          await page
            .getByRole("switch", {
              name: "Haftalık proje görünümü",
              exact: true,
            })
            .setChecked(weekly);
          await marker.waitFor({ state: "attached" });
          await centerLine();
          await assertPainted();
          await container.evaluate((c) => {
            const left = Number.parseFloat(
              c.querySelector(".today-date-line").style.left,
            );
            c.scrollLeft = left - 100;
          });
          await f.wait(
            async () =>
              (await marker.evaluate((e) => getComputedStyle(e).visibility)) ===
              "hidden",
            "line hides beneath frozen project labels",
          );
          await centerLine();
          await assertPainted();
          await f.capture(
            page,
            weekly
              ? "weekly-today-line-restored"
              : "monthly-today-line-restored",
          );
        },
      );
    }
    await f.check(
      "today line: optional project-code column and period changes preserve visibility rules",
      async () => {
        await page
          .getByRole("switch", { name: "Proje Kodlarını Göster", exact: true })
          .check();
        await centerLine();
        await assertPainted();
        const start = page.locator('.planning-filterbar input[type="month"]');
        await start.fill("2024-01");
        await f.wait(
          async () =>
            (await marker.evaluate((e) => getComputedStyle(e).display)) ===
            "none",
          "today outside visible period",
        );
        await start.fill("2026-01");
        await f.wait(
          async () =>
            (await marker.evaluate((e) => getComputedStyle(e).display)) ===
            "block",
          "today returns with visible period",
        );
        await centerLine();
        await assertPainted();
      },
    );
  } finally {
    await context.close();
  }
}
