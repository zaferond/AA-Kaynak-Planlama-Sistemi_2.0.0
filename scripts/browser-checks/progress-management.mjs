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
    milestones: [
      {
        id: "report-topic-range",
        name: "Tasarım gözden geçirmesi",
        start: "2026-08-25",
        end: "2026-09-15",
        barColor: "amber",
        barText: "Tasarım dokümanları kontrol edilecek",
        additionalRanges: [
          { start: "2026-10-05", end: "2026-11-10", color: "green" },
        ],
      },
      {
        id: "report-topic-point",
        name: "Prototip kabulü",
        start: "2026-09-21",
        end: "2026-09-21",
        displayKind: "milestone",
        barColor: "red",
      },
      {
        id: "report-topic-hidden",
        name: "Gizli kritik konu",
        start: "2026-09-01",
        end: "2026-09-30",
        hasCriticalTopics: false,
      },
    ],
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
      .getByRole("tab", { name: "Proje İlerleme Raporu", exact: true })
      .click();
  };
  const showDetails = async (cell, section, open = true) => {
    const details = cell.locator(`details[data-section="${section}"]`);
    const isOpen = (await details.getAttribute("open")) !== null;
    if (isOpen !== open) await details.locator(":scope > summary").click();
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
          name: "İlerleme ve kaynak değerlendirmesi Eyl 2026",
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
          /İlerleme ve kaynak değerlendirmesi/,
        );
        assert.equal(
          await matrix.locator(".progress-assessment-section[open]").count(),
          0,
        );
        assert.equal(
          await matrix
            .getByRole("rowheader", { name: "Fark %", exact: true })
            .count(),
          3,
        );
        const projectA = matrix.locator('[data-project="p-a"]');
        assert.equal(await projectA.count(), 5);
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
        const projectACell = projectA
          .first()
          .locator(".progress-matrix-assessment");
        const projectBCell = matrix.locator(
          '[data-project="p-b"] .progress-matrix-assessment',
        );
        assert.equal(
          await projectACell
            .getByText("Kalan iş: %30", { exact: true })
            .isVisible(),
          false,
        );
        await showDetails(projectACell, "plan");
        assert.equal(
          await projectACell
            .locator('details[data-section="evaluation"][open]')
            .count(),
          0,
        );
        await showDetails(projectBCell, "plan");
        await showDetails(projectACell, "evaluation");
        await showDetails(projectBCell, "evaluation");
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
        await projectA
          .first()
          .getByText("Kalan iş: %30", { exact: true })
          .waitFor();
        await projectA
          .first()
          .getByText("Kaynak planı yeniden değerlendirilebilir", {
            exact: true,
          })
          .waitFor();
        await projectBStatus
          .getByText("Gecikmeyi kapatma planı incelenmeli", { exact: true })
          .waitFor();
        await projectBStatus
          .getByText(
            "Ayrılan kaynağın gecikmeyi kapatıp kapatmayacağını ve teslim tarihlerini gözden geçir.",
            { exact: true },
          )
          .waitFor();
        assert(!(await projectBStatus.innerText()).includes("Perf."));
        const typography = await projectBStatus
          .locator(
            ".progress-assessment-content span, .progress-resource-action, .progress-assessment-reasons li",
          )
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const style = getComputedStyle(node);
              return {
                font: style.fontFamily,
                size: style.fontSize,
                fits: node.scrollWidth <= node.clientWidth + 1,
              };
            }),
          );
        assert.equal(new Set(typography.map((item) => item.font)).size, 1);
        assert.equal(new Set(typography.map((item) => item.size)).size, 1);
        assert(
          typography.every((item) => item.fits),
          "Detail text wraps inside the narrower column",
        );
        await f.capture(page, "management-assessment-open-details");
        await showDetails(projectACell, "plan", false);
        assert.equal(
          await projectACell
            .getByText("Kalan iş: %30", { exact: true })
            .isVisible(),
          false,
        );
        assert.equal(
          await projectACell
            .getByText("Önümüzdeki 3 ay kaynak planı: 0,6 kişi-ay", {
              exact: true,
            })
            .isVisible(),
          true,
        );
        await page
          .getByText("İlerleme ve kaynak kararları nasıl değerlendirilir?", {
            exact: true,
          })
          .click();
        const guide = page.locator(".progress-report-help");
        await guide
          .getByRole("table", {
            name: "Kaynak değerlendirme kuralları",
            exact: true,
          })
          .getByText("İş devam ediyor, kaynak planı yok", { exact: true })
          .waitFor();
        await f.capture(page, "management-assessment-guide");
        await page
          .getByText("İlerleme ve kaynak kararları nasıl değerlendirilir?", {
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
            name: "İlerleme ve kaynak değerlendirmesi Eki 2026",
            exact: true,
          })
          .waitFor();
        await projectA
          .first()
          .locator(".progress-matrix-assessment")
          .getByText("Değerlendirme bekliyor", { exact: true })
          .waitFor();
        await page
          .getByRole("combobox", { name: "Ay", exact: true })
          .selectOption("2026-09");
        const topicRow = matrix.locator(
          `[data-project="${extra.id}"][data-metric="topics"]`,
        );
        await topicRow
          .getByRole("rowheader", { name: "Kritik konular", exact: true })
          .waitFor();
        assert.equal(await topicRow.locator("td").count(), 12);
        const septemberTopics = topicRow.locator('td[data-month="2026-09"]');
        assert.equal(
          await septemberTopics.locator(".progress-topic-bar").count(),
          1,
        );
        assert.equal(await septemberTopics.locator("b").innerText(), "◆");
        assert.equal(
          await topicRow
            .locator('td[data-month="2026-08"] .progress-topic-bar')
            .count(),
          1,
        );
        assert.equal(
          await topicRow
            .locator('td[data-month="2026-10"] .progress-topic-bar')
            .count(),
          1,
        );
        assert.equal(
          await topicRow
            .locator('td[data-month="2026-11"] .progress-topic-bar')
            .count(),
          1,
        );
        const accessibleTopics =
          await septemberTopics.getAttribute("aria-label");
        assert(!accessibleTopics.includes("Gizli kritik konu"));
        await septemberTopics.scrollIntoViewIfNeeded();
        await septemberTopics.focus();
        const tooltip = page.getByRole("tooltip");
        await tooltip
          .getByText("Tasarım dokümanları kontrol edilecek", { exact: true })
          .waitFor();
        await tooltip
          .getByText("25.08.2026 – 15.09.2026", { exact: true })
          .waitFor();
        await tooltip.getByText("21.09.2026", { exact: true }).waitFor();
        await f.capture(page, "management-critical-topics-tooltip");
        await page
          .getByRole("tab", {
            name: "Hedef Plan / Gerçekleşen Plan Giriş",
            exact: true,
          })
          .click();
        const planTopicCell = page
          .getByRole("region", {
            name: extra.name + " · " + f.teamA.lead,
            exact: true,
          })
          .locator('.progress-grid-topics td[data-month="2026-09"]');
        assert.equal(
          await planTopicCell.getAttribute("aria-label"),
          accessibleTopics,
        );
        await planTopicCell.scrollIntoViewIfNeeded();
        await planTopicCell.focus();
        await page
          .getByRole("tooltip")
          .getByText("Tasarım dokümanları kontrol edilecek", { exact: true })
          .waitFor();
        await page
          .getByRole("tab", { name: "Proje İlerleme Raporu", exact: true })
          .click();
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
        assert.match(entries["xl/worksheets/sheet2.xml"], /Fark %/);
        assert.match(entries["xl/worksheets/sheet3.xml"], /Fark %/);
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
          .getByText("Değerlendirme bekliyor", { exact: true })
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
                name: "Fark %",
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
    await f.check(
      "progress management: resource decisions distinguish unallocated work, recovery and completion",
      async () => {
        const selectProject = async (id) => {
          await page.reload();
          await open();
          await page
            .getByRole("combobox", { name: "Liderlik", exact: true })
            .selectOption(f.teamA.lead);
          await page
            .getByRole("combobox", { name: "Proje", exact: true })
            .selectOption(id);
        };
        const setFuture = async (value) =>
          f.store.mutate(f.actor, (d, u) =>
            applyChanges(
              d,
              u,
              ["2026-10", "2026-11", "2026-12"].map((m) => {
                const id = `${f.teamA.id}|p-b|${m}`;
                return {
                  kind: "allocation",
                  id,
                  value,
                  revision: d.revisions["allocation:" + id] || 0,
                };
              }),
            ),
          );
        await setFuture(0);
        await selectProject("p-b");
        const decisionCell = matrix.locator(
          ".progress-project-row .progress-matrix-assessment",
        );
        await decisionCell
          .getByText("İş devam ediyor, kaynak planı yok", { exact: true })
          .waitFor();
        assert.equal(await decisionCell.locator("details[open]").count(), 0);
        await showDetails(decisionCell, "plan");
        await showDetails(decisionCell, "evaluation");
        await decisionCell
          .getByText("Kalan iş: %70", { exact: true })
          .waitFor();
        await decisionCell
          .getByText("Önümüzdeki 3 ay kaynak planı: Yok", { exact: true })
          .waitFor();
        await decisionCell
          .getByText("Kaynak ayır veya proje takvimini güncelle.", {
            exact: true,
          })
          .waitFor();
        await decision.selectOption("needsPlan");
        assert.equal(await matrix.locator(".progress-project-row").count(), 1);
        const bytes = await download(
          page,
          page.getByRole("button", { name: "Excel’e Aktar", exact: true }),
          path.join(f.dir, "resource-decision.xlsx"),
        );
        const entries = zipEntries(bytes);
        await validateXml(page, entries);
        assert.match(
          entries["xl/worksheets/sheet2.xml"],
          /İş devam ediyor, kaynak planı yok/,
        );
        assert.match(entries["xl/worksheets/sheet2.xml"], /Kalan iş %/);
        await f.capture(page, "management-no-resource-plan");
        await setFuture(0.2);
        await selectProject("p-b");
        await decisionCell
          .getByText("Gecikmeyi kapatma planı incelenmeli", { exact: true })
          .waitFor();
        await f.store.mutate(f.actor, (d, u) => {
          const record = d.projectProgress.find(
            (r) => r.projectId === "p-a" && r.leader === f.teamA.lead,
          );
          return applyChanges(d, u, [
            {
              kind: "progress",
              id: record.id,
              revision: d.revisions["progress:" + record.id] || 0,
              value: {
                ...record,
                actuals: {
                  ...record.actuals,
                  "2026-09": { pct: 100, note: "Tamamlanan test işi" },
                },
              },
            },
          ]);
        });
        await selectProject("p-a");
        await decisionCell.getByText("Tamamlandı", { exact: true }).waitFor();
        assert.equal(await decisionCell.locator("details[open]").count(), 0);
        await showDetails(decisionCell, "plan");
        await showDetails(decisionCell, "evaluation");
        await decisionCell.getByText("Kalan iş: %0", { exact: true }).waitFor();
        await decisionCell
          .getByText("Tamamlanan işte kaynak planı sürüyor", { exact: true })
          .waitFor();
        await decision.selectOption("completed");
        assert.equal(await matrix.locator(".progress-project-row").count(), 1);
        await f.capture(page, "management-completed-resource-review");
      },
    );
  } finally {
    await context.close();
  }
}
