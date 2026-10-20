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
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(d, u, [
      ...["2026-10", "2026-11", "2026-12"].map((month) => ({
        kind: "allocation",
        id: `${f.teamA.id}|p-b|${month}`,
        value: 0.1,
        revision: d.revisions[`allocation:${f.teamA.id}|p-b|${month}`] || 0,
      })),
      {
        kind: "progressLock",
        id: "2026-09",
        value: { id: "2026-09" },
        revision: 0,
      },
    ]),
  );
  await page.reload();
  try {
    await open();
    const matrix = page.getByRole("table", {
      name: "Proje ilerleme raporu",
      exact: true,
    });
    const projectA = () => matrix.locator('[data-project="p-a"]').first();
    const projectB = () => matrix.locator('[data-project="p-b"]').first();
    await f.check(
      "scenario report: last locked month, decision badges, collapsed details, leadership expansion and critical topics",
      async () => {
        assert.equal(await matrix.locator(".monthhead").count(), 12);
        assert.equal(await matrix.locator(".progress-project-row").count(), 3);
        assert.equal(await matrix.locator(".progress-leader-row").count(), 0);
        await projectA()
          .getByText("Planın İlerisinde", { exact: true })
          .first()
          .waitFor();
        await projectA()
          .getByText("Kaynak serbest bırakılabilir", { exact: true })
          .waitFor();
        await projectB()
          .getByText("Kritik Gecikme", { exact: true })
          .first()
          .waitFor();
        await projectB()
          .getByText("Ek kaynak gerekli veya bitiş tarihi revize edilmeli", {
            exact: true,
          })
          .waitFor();
        assert.equal(await matrix.locator("details[open]").count(), 0);
        await projectA()
          .getByText("Hesap ve diğer uyarılar", { exact: true })
          .click();
        await projectA().getByText("Karşılama", { exact: true }).waitFor();
        await projectA().getByText("%250", { exact: true }).waitFor();
        const typography = await projectA()
          .locator(".scenario-calculation dt, .scenario-calculation dd")
          .evaluateAll((nodes) =>
            nodes.map((node) => ({
              size: getComputedStyle(node).fontSize,
              font: getComputedStyle(node).fontFamily,
              fits: node.scrollWidth <= node.clientWidth + 1,
            })),
          );
        assert.equal(new Set(typography.map((x) => x.size)).size, 1);
        assert.equal(new Set(typography.map((x) => x.font)).size, 1);
        assert(typography.every((x) => x.fits));
        await f.capture(page, "scenario-report-details");
        await page
          .getByRole("combobox", { name: "Ay", exact: true })
          .selectOption("2026-10");
        await projectA()
          .getByText("Planın İlerisinde", { exact: true })
          .first()
          .waitFor();
        await page
          .getByRole("combobox", { name: "Ay", exact: true })
          .selectOption("2026-09");
        const phase = matrix.locator(
          `[data-project="${extra.id}"][data-metric="phase"] td[data-month="2026-09"]`,
        );
        assert.equal(await phase.getAttribute("colspan"), "2");
        const topics = matrix.locator(
          `[data-project="${extra.id}"][data-metric="topics"] td[data-month="2026-09"]`,
        );
        assert.equal(await topics.locator(".progress-topic-bar").count(), 1);
        assert(
          !(await topics.getAttribute("aria-label")).includes(
            "Gizli kritik konu",
          ),
        );
        await topics.scrollIntoViewIfNeeded();
        await topics.focus();
        await page
          .getByRole("tooltip")
          .getByText("Tasarım dokümanları kontrol edilecek", { exact: true })
          .waitFor();
        await matrix
          .getByRole("button", {
            name: "Browser Project A liderliklerini göster",
            exact: true,
          })
          .click();
        assert.equal(await matrix.locator(".progress-leader-row").count(), 3);
        await page
          .getByRole("button", { name: "Liderlikleri Kapat", exact: true })
          .click();
        assert.equal(await matrix.locator(".progress-leader-row").count(), 0);
        await matrix
          .getByRole("button", { name: "Browser Project A", exact: true })
          .click();
        const detail = page.getByRole("region", {
          name: "Browser Project A ayrıntısı",
          exact: true,
        });
        await detail.getByText("Hesap özeti", { exact: true }).waitFor();
        assert.equal(await detail.locator(".progress-chart,svg").count(), 0);
        await detail
          .getByText("Aylık yönetici raporu testi", { exact: true })
          .waitFor();
        const decisions = page.getByRole("combobox", {
          name: "Değerlendirme",
          exact: true,
        });
        await decisions.selectOption("ahead");
        assert.equal(await matrix.locator(".progress-project-row").count(), 1);
        await decisions.selectOption("missing");
        await matrix
          .getByRole("button", { name: extra.name, exact: true })
          .waitFor();
        await decisions.selectOption("");
        await f.capture(page, "scenario-progress-report");
      },
    );
    await f.check(
      "scenario report: Excel contains current matrix decisions and numeric monthly progress",
      async () => {
        const project = page.getByRole("combobox", {
          name: "Proje",
          exact: true,
        });
        await project.selectOption("p-a");
        const bytes = await download(
          page,
          page.getByRole("button", { name: "Excel’e Aktar", exact: true }),
          path.join(f.dir, "scenario-progress.xlsx"),
        );
        const entries = zipEntries(bytes);
        await validateXml(page, entries);
        assert.match(entries["xl/worksheets/sheet2.xml"], /S-08/);
        assert.match(
          entries["xl/worksheets/sheet2.xml"],
          /Kaynak serbest bırakılabilir/,
        );
        assert.match(entries["xl/worksheets/sheet2.xml"], /<v>250<\/v>/);
        assert.match(entries["xl/worksheets/sheet3.xml"], /Kritik konular/);
        assert(
          !entries["xl/worksheets/sheet2.xml"].includes("Browser Project B"),
        );
        await project.selectOption("");
      },
    );
    await f.check(
      "scenario alerts: lifecycle requires an explanation; filters, history, CSV and Excel preserve it",
      async () => {
        await page
          .getByRole("tab", { name: "Senaryo Uyarıları", exact: true })
          .click();
        const panel = page.getByRole("region", {
          name: "Senaryo Uyarıları",
          exact: true,
        });
        await panel
          .getByRole("combobox", { name: "Proje", exact: true })
          .selectOption("p-a");
        const row = panel
          .getByRole("table", { name: "Senaryo uyarı listesi", exact: true })
          .locator("tbody tr");
        assert.equal(await row.count(), 1);
        await row.getByText("S-08", { exact: true }).waitFor();
        await row
          .getByRole("button", { name: "Görüldü İşaretle", exact: true })
          .click();
        await row
          .getByRole("button", { name: "Aksiyon Gir", exact: true })
          .click();
        const acted = row.getByRole("button", {
          name: "Aksiyon Alındı",
          exact: true,
        });
        assert.equal(await acted.isEnabled(), false);
        await row
          .getByRole("textbox", { name: "Aksiyon açıklaması", exact: true })
          .fill("Fazla kaynak için ekip değerlendirmesi yapıldı.");
        await acted.click();
        await row
          .getByText("Aksiyon Alındı", { exact: true })
          .first()
          .waitFor();
        await panel
          .getByRole("combobox", { name: "Durum", exact: true })
          .selectOption("acted");
        const csv = await download(
          page,
          panel.getByRole("button", { name: "CSV’ye Aktar", exact: true }),
          path.join(f.dir, "scenario-alerts.csv"),
        );
        assert.match(
          csv.toString("utf8"),
          /Fazla kaynak için ekip değerlendirmesi yapıldı/,
        );
        assert(!csv.toString("utf8").includes("Browser Project B"));
        const bytes = await download(
          page,
          panel.getByRole("button", { name: "Excel’e Aktar", exact: true }),
          path.join(f.dir, "scenario-alerts.xlsx"),
        );
        const entries = zipEntries(bytes);
        await validateXml(page, entries);
        assert.match(entries["xl/worksheets/sheet1.xml"], /Aksiyon Alındı/);
        await row.getByText("Hesap ve geçmiş", { exact: true }).click();
        await row
          .getByText("Browser root-admin", { exact: false })
          .first()
          .waitFor();
        await f.capture(page, "scenario-alert-history");
      },
    );
    await f.check(
      "scenario settings: admin changes recalculate alerts; managers cannot see settings",
      async () => {
        await page
          .getByRole("tab", { name: "Uyarı Ayarları", exact: true })
          .click();
        const settings = page.getByRole("region", {
          name: "Uyarı Ayarları",
          exact: true,
        });
        await settings
          .getByRole("spinbutton", {
            name: "Yeterli kaynak: en fazla karşılama (%)",
            exact: true,
          })
          .fill("260");
        await settings
          .getByRole("button", { name: "Ayarları Kaydet", exact: true })
          .click();
        await settings.getByRole("status").waitFor();
        const d = (await f.store.read()).data;
        assert.equal(
          d.warningAssessments.find((a) => a.id === "p-a").warning2,
          "",
        );
        assert.equal(
          d.scenarioWarnings.find(
            (w) => w.projectId === "p-a" && w.code === "S-08",
          ).status,
          "closed",
        );
        await settings
          .getByRole("button", { name: "Varsayılanları Getir", exact: true })
          .click();
        await settings
          .getByRole("button", { name: "Ayarları Kaydet", exact: true })
          .click();
        await settings.getByRole("status").waitFor();
        const next = (await f.store.read()).data;
        assert.equal(
          next.scenarioWarnings.filter(
            (w) => w.projectId === "p-a" && w.code === "S-08",
          ).length,
          1,
        );
        assert.equal(
          next.scenarioWarnings.find(
            (w) => w.projectId === "p-a" && w.code === "S-08",
          ).status,
          "open",
        );
        await f.capture(page, "scenario-warning-settings");
        const manager = await f.client("manager");
        try {
          await manager.page
            .getByRole("tab", { name: "Proje İlerlemesi", exact: true })
            .click();
          assert.equal(
            await manager.page
              .getByRole("tab", { name: "Uyarı Ayarları", exact: true })
              .count(),
            0,
          );
          await manager.page
            .getByRole("tab", { name: "Senaryo Uyarıları", exact: true })
            .click();
          await manager.page
            .getByRole("table", { name: "Senaryo uyarı listesi", exact: true })
            .waitFor();
        } finally {
          await manager.context.close();
        }
      },
    );
  } finally {
    await context.close();
  }
}
