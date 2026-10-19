import assert from "node:assert/strict";
import path from "node:path";
import { applyChanges } from "../../backend/operations.mjs";
import { download, zipEntries, validateXml } from "./files.mjs";

export async function checkProgressManagement(f) {
  const extra = {
    id: "p-report-unplanned",
    name: "Browser Project Unplanned",
    responsibleName: "Synthetic owner",
    start: "2026-01",
    end: "2027-12",
    phases: {
      "2026-09": "Tasarım",
      "2026-10": "Tasarım",
      "2026-11": "Doğrulama",
    },
    phaseColors: { "2026-09": "blue", "2026-10": "blue", "2026-11": "green" },
    milestones: [],
  };
  const progress = (projectId, leader, id) => ({
    id,
    projectId,
    leader,
    baselines: [],
    actuals: {},
    createdBy: "root-admin",
    createdByName: "Browser root-admin",
    createdAt: "2026-10-01T00:00:00.000Z",
    proposal: {
      status: "approved",
      openingMonth: "2026-08",
      openingPct: 0,
      targets: { "2026-09": 50, "2026-10": 70, "2026-11": 85, "2026-12": 100 },
    },
  });
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(d, u, [
      { kind: "project", id: extra.id, value: extra, revision: 0 },
      ...["p-a", "p-b", extra.id].flatMap((projectId) =>
        ["2026-09", "2026-10", "2026-11", "2026-12"].map((month) => ({
          kind: "allocation",
          id: `${f.teamA.id}|${projectId}|${month}`,
          value: projectId === extra.id ? 0.05 : 0.2,
          revision: 0,
        })),
      ),
      ...["p-a", "p-b"].map((projectId) => ({
        kind: "actual",
        id: `r-own|${projectId}|2026-09`,
        value: 0.1,
        revision: 0,
      })),
      ...["p-a", "p-b"].map((projectId) => ({
        kind: "progress",
        id: "management-" + projectId,
        value: progress(projectId, f.teamA.lead, "management-" + projectId),
        revision: 0,
      })),
    ]),
  );
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(
      d,
      u,
      d.projectProgress.map((record) => ({
        kind: "progress",
        id: record.id,
        value: {
          ...record,
          actuals: {
            "2026-09": {
              pct: record.projectId === "p-a" ? 70 : 30,
              note: "Aylık yönetici raporu testi",
            },
          },
        },
        revision: d.revisions["progress:" + record.id] || 0,
      })),
    ),
  );
  const { page, context } = await f.client("root-admin");
  const open = async () => {
    await page
      .getByRole("tab", { name: "Proje İlerlemesi", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Ay", exact: true })
      .selectOption("2026-09");
    await page
      .getByRole("tab", { name: "İlerleme Raporu", exact: true })
      .click();
  };
  try {
    await open();
    const matrix = page.getByRole("table", {
      name: "Proje ilerleme raporu",
      exact: true,
    });
    const decision = page.getByRole("combobox", {
      name: "Değerlendirme",
      exact: true,
    });
    await f.check(
      "progress management: monthly leadership matrix and decision summary distinguish ahead, behind and missing plans",
      async () => {
        assert.equal(await matrix.locator(".monthhead").count(), 12);
        assert.equal(await matrix.locator(".progress-project-row").count(), 3);
        assert.equal(await matrix.locator(".progress-leader-row").count(), 0);
        const statusHeader = matrix.getByRole("columnheader", {
          name: "Değerlendirme durumu Eyl 2026",
          exact: true,
        });
        await statusHeader.waitFor();
        assert.match(
          await matrix
            .locator("thead tr")
            .nth(1)
            .locator("th")
            .first()
            .innerText(),
          /Değerlendirme durumu/,
        );
        const projectA = matrix.locator('[data-project="p-a"]');
        assert.equal(await projectA.count(), 4);
        await projectA
          .first()
          .getByRole("rowheader", { name: "Aşama", exact: true })
          .waitFor();
        await projectA.first().getByText("Design", { exact: true }).waitFor();
        await projectA
          .first()
          .locator(".progress-matrix-assessment")
          .getByText("Planın önünde", { exact: true })
          .waitFor();
        await matrix
          .locator('[data-project="p-b"] .progress-matrix-assessment')
          .getByText("Planın gerisinde", { exact: true })
          .waitFor();
        await projectA
          .first()
          .getByText("Hedefin 20 puan önünde.", { exact: true })
          .waitFor();
        const projectBStatus = matrix.locator(
          '[data-project="p-b"] .progress-matrix-assessment',
        );
        await projectBStatus
          .getByText("Hedefin 20 puan gerisinde.", { exact: true })
          .waitFor();
        await projectBStatus
          .getByText("Riskin nedeni ve öneri", { exact: true })
          .click();
        await projectBStatus
          .getByText("Destek ve darboğazları incele", { exact: true })
          .waitFor();
        await projectBStatus
          .getByText("Riskin nedeni ve öneri", { exact: true })
          .click();
        await page
          .getByText("Değerlendirme durumları ve riskler ne anlama geliyor?", {
            exact: true,
          })
          .click();
        const guide = page.locator(".progress-report-help");
        await guide
          .getByText(
            "Gerçekleşen ilerleme, seçili ayın hedefinden düşük. Gecikmenin nedeni incelenmeli.",
            { exact: true },
          )
          .waitFor();
        await f.capture(page, "management-assessment-guide");
        await page
          .getByText("Değerlendirme durumları ve riskler ne anlama geliyor?", {
            exact: true,
          })
          .click();
        await matrix
          .getByRole("button", { name: "Browser Project A", exact: true })
          .click();
        const detail = page.getByRole("region", {
          name: "Browser Project A ayrıntısı",
          exact: true,
        });
        await detail
          .getByRole("heading", { name: "Açıklama geçmişi", exact: true })
          .waitFor();
        assert.equal(await detail.locator(".progress-chart, svg").count(), 0);
        assert.equal(
          await detail
            .getByText("Grafik için onaylı hedef planı gerekir.", {
              exact: true,
            })
            .count(),
          0,
        );
        await detail
          .getByText("Aylık yönetici raporu testi", { exact: true })
          .waitFor();
        await f.capture(page, "management-project-history-without-chart");
        await matrix
          .getByRole("button", { name: "Browser Project A", exact: true })
          .click();
        const phase = matrix.locator(
          `[data-project="${extra.id}"][data-metric="phase"] td[data-month="2026-09"]`,
        );
        assert.equal(await phase.getAttribute("colspan"), "2");
        assert.equal(await phase.innerText(), "Tasarım");
        await page
          .getByRole("combobox", { name: "Ay", exact: true })
          .selectOption("2026-10");
        await matrix
          .getByRole("columnheader", {
            name: "Değerlendirme durumu Eki 2026",
            exact: true,
          })
          .waitFor();
        await projectA
          .first()
          .locator(".progress-matrix-assessment")
          .getByText("Gerçekleşen verisi eksik", { exact: true })
          .waitFor();
        await page
          .getByRole("combobox", { name: "Ay", exact: true })
          .selectOption("2026-09");
        await f.capture(page, "management-progress-collapsed");
        await matrix
          .getByRole("button", {
            name: "Browser Project A liderliklerini göster",
            exact: true,
          })
          .click();
        assert.equal(await matrix.locator(".progress-leader-row").count(), 3);
        await matrix
          .getByRole("button", {
            name: "Browser Project Unplanned",
            exact: true,
          })
          .waitFor();
        await page
          .locator('.progress-management-cards button[data-tone="risk"]')
          .getByText("1", { exact: true })
          .waitFor();
        await page
          .locator('.progress-management-cards button[data-tone="ahead"]')
          .getByText("1", { exact: true })
          .waitFor();
        await page
          .locator('.progress-management-cards button[data-tone="donor"]')
          .getByText("1", { exact: true })
          .waitFor();
        await page
          .locator('.progress-management-cards button[data-tone="missing"]')
          .getByText("1", { exact: true })
          .waitFor();
        const comparisons = page.getByRole("region", {
          name: "Kaynak aktarımı için karşılaştırma",
          exact: true,
        });
        await comparisons
          .getByText("Browser Project A → Browser Project B", { exact: true })
          .waitFor();
        await comparisons.getByText(f.teamA.lead, { exact: true }).waitFor();
        await page
          .getByRole("button", { name: "Liderlikleri Kapat", exact: true })
          .click();
        assert.equal(await matrix.locator(".progress-leader-row").count(), 0);
        await page
          .getByRole("button", { name: "Liderlikleri Aç", exact: true })
          .click();
        assert.equal(await matrix.locator(".progress-leader-row").count(), 9);
        await f.capture(page, "management-progress-matrix");
        await decision.selectOption("risk");
        assert.equal(await matrix.locator(".progress-project-row").count(), 1);
        await matrix
          .getByRole("button", { name: "Browser Project B", exact: true })
          .waitFor();
        await decision.selectOption("ahead");
        assert.equal(await matrix.locator(".progress-project-row").count(), 1);
        await matrix
          .getByRole("button", { name: "Browser Project A", exact: true })
          .waitFor();
        await decision.selectOption("missing");
        await matrix
          .getByRole("button", { name: extra.name, exact: true })
          .waitFor();
        await decision.selectOption("");
      },
    );
    await f.check(
      "progress management: Excel includes the filtered management and monthly sheets with numeric percentages",
      async () => {
        const project = page.getByRole("combobox", {
          name: "Proje",
          exact: true,
        });
        await project.selectOption("p-a");
        const bytes = await download(
          page,
          page.getByRole("button", { name: "Excel’e Aktar", exact: true }),
          path.join(f.dir, "management-progress.xlsx"),
        );
        const entries = zipEntries(bytes);
        await validateXml(page, entries);
        assert.match(entries["xl/workbook.xml"], /Yönetici Değerlendirmesi/);
        assert.match(entries["xl/workbook.xml"], /Aylık İlerleme/);
        assert.match(entries["xl/worksheets/sheet2.xml"], /<v>70<\/v>/);
        assert.match(entries["xl/worksheets/sheet2.xml"], /<v>20<\/v>/);
        assert(
          !entries["xl/worksheets/sheet2.xml"].includes("Browser Project B"),
        );
        assert.match(entries["xl/worksheets/sheet3.xml"], /2026-12/);
        assert.match(entries["xl/worksheets/sheet3.xml"], /Aşama/);
        assert.match(entries["xl/worksheets/sheet3.xml"], /Design/);
        await project.selectOption("");
        await page
          .getByRole("combobox", { name: "Aylık görünüm yılı", exact: true })
          .selectOption("2027");
        await matrix.locator(".monthhead[data-month='2027-01']").waitFor();
        await page
          .getByRole("combobox", { name: "Aylık görünüm yılı", exact: true })
          .selectOption("2026");
      },
    );
    await f.check(
      "progress management: incomplete leadership submissions suppress project comparisons and transfer suggestions",
      async () => {
        await f.store.mutate(f.actor, (d, u) =>
          applyChanges(d, u, [
            {
              kind: "allocation",
              id: `${f.teamB.id}|p-a|2026-09`,
              value: 0.1,
              revision: 0,
            },
            {
              kind: "progress",
              id: "management-incomplete",
              value: progress("p-a", f.teamB.lead, "management-incomplete"),
              revision: 0,
            },
          ]),
        );
        await page.reload();
        await open();
        const rows = matrix.locator('[data-project="p-a"]');
        await page
          .locator('.progress-management-cards button[data-tone="missing"]')
          .getByText("2", { exact: true })
          .waitFor();
        assert.equal(await matrix.locator(".progress-leader-row").count(), 0);
        assert.equal(
          await page
            .getByRole("region", {
              name: "Kaynak aktarımı için karşılaştırma",
              exact: true,
            })
            .count(),
          0,
        );
        const actualSeptember = rows
          .filter({
            has: page.getByRole("rowheader", {
              name: "Gerçekleşen %",
              exact: true,
            }),
          })
          .locator('td[data-selected="true"]');
        assert.equal(await actualSeptember.textContent(), "—");
        await rows
          .first()
          .locator(".progress-matrix-assessment")
          .getByText("Gerçekleşen verisi eksik", { exact: true })
          .waitFor();
        await page
          .getByRole("combobox", { name: "Liderlik", exact: true })
          .selectOption(f.teamA.lead);
        assert.equal(await actualSeptember.textContent(), "70");
        await rows
          .first()
          .locator(".progress-matrix-assessment")
          .getByText("Planın önünde", { exact: true })
          .waitFor();
        assert.equal(
          await rows
            .filter({
              has: page.getByRole("rowheader", {
                name: "Fark (puan)",
                exact: true,
              }),
            })
            .locator('td[data-selected="true"]')
            .textContent(),
          "+20",
        );
        await f.capture(page, "management-progress-leadership-filter");
        await page.setViewportSize({ width: 1100, height: 850 });
        const statusHeader = matrix.locator(
          "thead .progress-matrix-assessment",
        );
        const nameHeader = matrix.locator("thead .progress-matrix-name");
        const before = await statusHeader.boundingBox();
        await matrix.evaluate((table) => {
          table.parentElement.scrollLeft = 600;
        });
        const after = await statusHeader.boundingBox();
        const nameBox = await nameHeader.boundingBox();
        assert(
          Math.abs(before.x - after.x) < 1,
          "Assessment stays visible while scrolling months",
        );
        assert(
          Math.abs(after.x + after.width - nameBox.x) < 2,
          "Sticky status and project columns do not overlap",
        );
        await f.capture(page, "management-progress-narrow");
      },
    );
  } finally {
    await context.close();
  }
}
