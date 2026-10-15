import assert from "node:assert/strict";
import path from "node:path";
import { download, zipEntries, validateXml } from "./files.mjs";
import { applyChanges } from "../../backend/operations.mjs";
import { projectWorkbook } from "../../frontend/src/project-export.ts";

export async function checkProjectCodes(f) {
  const state = await f.state();
  const project = state.projects.find((p) => p.id === "p-a");
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(d, u, [
      {
        kind: "project",
        id: project.id,
        revision: state.revisions["project:" + project.id] || 0,
        value: {
          ...project,
          milestones: [
            {
              id: "code-heading",
              name: "Code timeline",
              start: "2026-01-05",
              end: "2026-02-05",
              barStyle: "outline",
              barText: "Synthetic note",
            },
          ],
        },
      },
    ]),
  );
  const { page } = await f.client("root-admin");
  try {
    await page
      .getByRole("tab", {
        name: "AA Mühendislik Liderliği Projeler",
        exact: true,
      })
      .click();
    const toggle = page.getByRole("switch", {
      name: "Proje Kodlarını Göster",
      exact: true,
    });
    const code = "=AA<&>001";
    await f.check(
      "project code: create, edit and reload preserve optional code; column starts hidden",
      async () => {
        assert.equal(await toggle.isChecked(), false);
        await page
          .getByRole("button", { name: "Yeni Proje Ekle", exact: true })
          .click();
        await page
          .getByLabel("Proje Adı", { exact: true })
          .fill("Synthetic code project");
        await page.getByLabel("Proje Kodu", { exact: true }).fill("OLD-001");
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        await page
          .locator(".project-name-copy button")
          .filter({ hasText: "Synthetic code project" })
          .click();
        assert.equal(
          await page.getByLabel("Proje Kodu", { exact: true }).inputValue(),
          "OLD-001",
        );
        await page.getByLabel("Proje Kodu", { exact: true }).fill(code);
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        await page.reload();
        await page
          .getByRole("tab", {
            name: "AA Mühendislik Liderliği Projeler",
            exact: true,
          })
          .click();
        assert.equal(
          (await f.state()).projects.find(
            (p) => p.name === "Synthetic code project",
          ).code,
          code,
        );
        assert.equal(
          await page.locator(".projectmatrix .project-code-cell").count(),
          0,
        );
      },
    );
    await f.check(
      "project code: monthly/weekly Excel follows visible column, freezes labels and keeps code as text",
      async () => {
        for (const weekly of [false, true]) {
          await page
            .getByRole("switch", {
              name: "Haftalık proje görünümü",
              exact: true,
            })
            .setChecked(weekly);
          for (const show of [false, true]) {
            await toggle.setChecked(show);
            assert.equal(
              await page
                .locator(".projectmatrix thead .project-code-cell")
                .count(),
              show ? 1 : 0,
            );
            const bytes = await download(
              page,
              page.getByRole("button", {
                name: "Proje Raporunu İndir",
                exact: true,
              }),
              path.join(f.dir, `projects-${weekly}-${show}.xlsx`),
            );
            const entries = zipEntries(bytes);
            await validateXml(page, entries);
            const sheet = entries["xl/worksheets/sheet1.xml"];
            assert.equal(sheet.includes("Proje Kodu"), show);
            assert(sheet.includes(`xSplit="${show ? 2 : 1}"`));
            assert(!sheet.includes("<f>"));
            if (show) assert(sheet.includes("=AA&lt;&amp;&gt;001"));
          }
        }
        // Export directly with empty/Unicode codes and a year boundary as well.
        const projects = (await f.state()).projects;
        const entries = zipEntries(
          Buffer.from(
            projectWorkbook(
              projects,
              ["2026-12", "2027-01"],
              "detail",
              false,
              true,
            ),
          ),
        );
        await validateXml(page, entries);
        await f.capture(page, "project-code-visible");
      },
    );
    await f.check(
      "project code: labels remain frozen while timeline scrolls; details keep calendar alignment",
      async () => {
        await page
          .getByRole("switch", { name: "Detayları Göster", exact: true })
          .check();
        const table = page.locator(".projectmatrix"),
          container = table.locator("..");
        await container.evaluate((c) => {
          c.style.width = "700px";
          c.scrollLeft = 500;
        });
        await f.wait(
          async () => await container.evaluate((c) => c.scrollLeft > 0),
          "timeline horizontally scrolled",
        );
        const geometry = await table.evaluate((t) => {
          const cr = t.parentElement.getBoundingClientRect();
          const name = t.querySelector("thead tr:not(.yearrow) th"),
            code = t.querySelector("thead .project-code-cell");
          const nr = name.getBoundingClientRect(),
            r = code.getBoundingClientRect();
          return {
            nameLeft: nr.left,
            left: cr.left,
            codeLeft: r.left,
            nameRight: nr.right,
          };
        });
        assert(
          Math.abs(geometry.nameLeft - geometry.left) < 2,
          JSON.stringify(geometry),
        );
        assert(
          Math.abs(geometry.codeLeft - geometry.nameRight) < 2,
          JSON.stringify(geometry),
        );
        await container.evaluate((c) => {
          c.style.width = "";
          c.scrollLeft = 0;
        });
        const detail = await table.evaluate((t) => {
          const start = t
            .querySelector("thead [data-date-start]")
            .getBoundingClientRect().left;
          const track = t
            .querySelector(".milestone-track-cell")
            .getBoundingClientRect().left;
          return { start, track };
        });
        assert(
          Math.abs(detail.start - detail.track) < 2,
          JSON.stringify(detail),
        );
      },
    );
    await f.check(
      "report graphs: Turkish short month and full year labels",
      async () => {
        await page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .click();
        await page
          .locator('.planning-filterbar input[type="month"]')
          .fill("2026-01");
        for (const label of [
          "Aylık eksik kaynak sayısı",
          "Aylara göre birikimli ortalama çalışan sayısı ve gelecek ayların aktif ilanlar dahil öngörüsü",
        ]) {
          const chart = page.getByRole("img", { name: label, exact: true });
          const texts = await chart.locator("text").allTextContents();
          assert(texts.includes("Oca 2026"), JSON.stringify({ label, texts }));
          assert(texts.includes("Şub 2026"), JSON.stringify({ label, texts }));
        }
      },
    );
  } finally {
    await page.close();
  }
}
