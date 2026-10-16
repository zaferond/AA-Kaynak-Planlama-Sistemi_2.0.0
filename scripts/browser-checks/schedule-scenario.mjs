import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";
import { selectWorkspaceTab } from "./fixture.mjs";

export async function checkScheduleScenario(f) {
  const state = await f.state();
  const [pa, pb] = state.projects;
  const team = f.teamA.id;
  const changes = [
    {
      kind: "project",
      id: pa.id,
      revision: state.revisions["project:" + pa.id] || 0,
      value: { ...pa, start: "2026-01", end: "2027-03" },
    },
    {
      kind: "project",
      id: pb.id,
      revision: state.revisions["project:" + pb.id] || 0,
      value: { ...pb, start: "2026-01", end: "2027-06" },
    },
  ];
  // Project A fills Oct 2026 – Mar 2027, project B Apr – Jun 2027 on Team A.
  for (const m of [
    "2026-10",
    "2026-11",
    "2026-12",
    "2027-01",
    "2027-02",
    "2027-03",
  ])
    changes.push({
      kind: "allocation",
      id: `${team}|${pa.id}|${m}`,
      value: 1,
      revision: 0,
    });
  for (const m of ["2027-04", "2027-05", "2027-06"])
    changes.push({
      kind: "allocation",
      id: `${team}|${pb.id}|${m}`,
      value: 1,
      revision: 0,
    });
  await f.store.mutate(f.actor, (d, u) => applyChanges(d, u, changes));
  const before = await f.state();

  const { page } = await f.client("root-admin");
  try {
    await f.check(
      "scenario: +3 and +5 month delays are compared without saving and export to Excel",
      async () => {
        await selectWorkspaceTab(page, "Planlanan Kaynak Dağılımı");
        await page
          .getByRole("button", { name: "Erteleme Senaryosu", exact: true })
          .click();
        const dialog = page.locator(".schedule-scenario-dialog");
        await dialog.waitFor();
        await dialog
          .getByLabel("Proje", { exact: true })
          .first()
          .selectOption(pa.id);
        // Copying a scenario adds two months: Senaryo B is +5.
        await dialog
          .getByRole("button", { name: "Senaryo A senaryosunu çoğalt" })
          .click();
        const rows = await dialog
          .locator(".schedule-summary-table tr")
          .evaluateAll((list) =>
            list.map((r) => [...r.cells].map((c) => c.innerText.trim())),
          );
        const row = (label) => rows.find((r) => r[0].startsWith(label));
        assert.deepEqual(rows[0].slice(1), [
          "Mevcut",
          "Senaryo A",
          "Senaryo B",
        ]);
        assert.deepEqual(row(pa.name).slice(1), [
          "Mar 2027",
          "Haz 2027",
          "Ağu 2027",
        ]);
        // Delaying A collides with B in Apr – Jun 2027: 3 person-months short.
        assert.deepEqual(row("Toplam kaynak açığı").slice(1), ["0", "3", "3"]);
        assert.deepEqual(row("Kaydırılan planlanan kayıt").slice(1), [
          "—",
          "6",
          "6",
        ]);
        // Leadership rows (as in Liderlik Bazında Eksik Raporu) sit above teams.
        const blocks = dialog.locator(".schedule-impact-block");
        assert.equal(
          await blocks.first().locator("h4").textContent(),
          "Liderlik bazında",
        );
        assert((await blocks.first().locator("tbody tr").count()) >= 2);
        assert.match(
          await blocks.first().locator("tbody tr").last().innerText(),
          /^Toplam/,
        );
        await dialog
          .getByRole("button", { name: "Senaryo B", exact: true })
          .click();
        const cells = dialog
          .locator(".schedule-impact-table tbody tr")
          .first()
          .locator("td");
        assert.equal(await cells.first().innerText(), "1"); // Oct 2026 is freed
        assert.match(
          (await cells.first().getAttribute("class")) || "",
          /is-better/,
        );
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          dialog.getByRole("button", { name: "Excel'e Aktar" }).click(),
        ]);
        assert.equal(download.suggestedFilename(), "erteleme-senaryosu.xlsx");
        assert.deepEqual((await f.state()).allocations, before.allocations);
        assert.deepEqual((await f.state()).projects, before.projects);
      },
    );
    await f.check(
      "scenario: resource reports are drawn for a scenario with changed cells marked",
      async () => {
        await page
          .locator(".schedule-scenario-dialog")
          .getByRole("button", { name: "Raporlarda Göster" })
          .click();
        const bar = page.locator(".scenario-report-bar");
        await bar.waitFor();
        assert.match((await bar.getAttribute("class")) || "", /is-active/);
        // The delay frees Team A in Oct – Dec 2026 (the visible year).
        const better = page.locator(
          '#rapor-takim-eksik td[data-scenario-change="better"]',
        );
        assert((await better.count()) >= 3);
        assert.match(
          (await better.first().getAttribute("title")) || "",
          /Mevcut: /,
        );
        assert(
          (await page
            .locator("#rapor-liderlik-eksik td[data-scenario-change]")
            .count()) > 0,
        );
        await bar.getByRole("button", { name: "Mevcut", exact: true }).click();
        assert.equal(await page.locator("td[data-scenario-change]").count(), 0);
        assert.deepEqual((await f.state()).allocations, before.allocations);
        await bar.getByRole("button", { name: "Senaryoları Düzenle" }).click();
        await page.locator(".schedule-scenario-dialog").waitFor();
      },
    );
    await f.check(
      "scenario: pulling a project into months before the start month is refused",
      async () => {
        const dialog = page.locator(".schedule-scenario-dialog");
        await dialog
          .getByLabel("Kaydırılacak ay", { exact: true })
          .first()
          .fill("-2");
        await dialog
          .getByRole("alert")
          .filter({ hasText: "öne çekme" })
          .first()
          .waitFor();
      },
    );
  } finally {
    await page.close();
  }
  const employee = await f.client("employee");
  try {
    await f.check(
      "scenario: normal users do not get the scenario tool",
      async () => {
        await selectWorkspaceTab(
          employee.page,
          "Mühendislik Liderliği Projeler",
        );
        assert.equal(
          await employee.page
            .getByRole("button", { name: "Erteleme Senaryosu", exact: true })
            .count(),
          0,
        );
      },
    );
  } finally {
    await employee.page.close();
  }
}

export async function checkScheduleScenarioApproval(f) {
  const state = await f.state();
  const [project] = state.projects;
  const team = f.teamA.id;
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(d, u, [
      {
        kind: "project",
        id: project.id,
        revision: state.revisions["project:" + project.id] || 0,
        value: {
          ...project,
          start: "2026-01",
          end: "2026-12",
          phases: { "2026-10": "Prototip" },
        },
      },
      ...["2026-09", "2026-10", "2026-11", "2026-12"].map((m) => ({
        kind: "allocation",
        id: `${team}|${project.id}|${m}`,
        value: 1,
        revision: 0,
      })),
    ]),
  );
  const months = async () =>
    Object.keys((await f.state()).allocations)
      .filter((k) => k.includes("|" + project.id + "|"))
      .map((k) => k.slice(-7))
      .sort();
  const before = await months();

  const manager = await f.client("manager");
  try {
    await f.check(
      "scenario: a manager saves a draft but cannot approve",
      async () => {
        await selectWorkspaceTab(manager.page, "Planlanan Kaynak Dağılımı");
        await manager.page
          .getByRole("button", { name: "Erteleme Senaryosu", exact: true })
          .click();
        const dialog = manager.page.locator(".schedule-scenario-dialog");
        await dialog
          .getByLabel("Proje", { exact: true })
          .first()
          .selectOption(project.id);
        await dialog.getByLabel("Senaryo A senaryosunu kaydet").click();
        await dialog.locator(".scenario-message").waitFor();
        assert.equal((await f.state()).scheduleScenarios[0].status, "draft");
        assert.equal(
          await dialog.getByRole("button", { name: "Onayla" }).count(),
          0,
        );
      },
    );
  } finally {
    await manager.page.close();
  }

  const { page } = await f.client("root-admin");
  page.on("dialog", (d) => d.accept());
  try {
    await f.check(
      "scenario: admin approves, transfers to the calendar and undoes the transfer",
      async () => {
        // A saved draft is offered in the reports without opening the
        // dialog, and the admin sees how many wait for a decision.
        await selectWorkspaceTab(page, "Kaynak Planlama Raporları");
        await page
          .locator(".scenario-report-bar")
          .getByRole("button", { name: "Senaryo A · Taslak" })
          .click();
        assert.match(
          (await page.locator(".scenario-report-bar").getAttribute("class")) ||
            "",
          /is-active/,
        );
        assert.equal(
          await page.locator(".scenario-pending-badge").innerText(),
          "1",
        );
        await page
          .locator(".scenario-report-bar")
          .getByRole("button", { name: "Mevcut", exact: true })
          .click();
        await selectWorkspaceTab(page, "Planlanan Kaynak Dağılımı");
        await page
          .getByRole("button", { name: "Erteleme Senaryosu", exact: true })
          .click();
        const dialog = page.locator(".schedule-scenario-dialog");
        // The empty working card does not reuse the saved scenario's name.
        assert.equal(
          await dialog.getByLabel("Senaryo adı").first().inputValue(),
          "Senaryo B",
        );
        // A competing +5 scenario on the same project.
        const card = dialog.locator(".schedule-scenario-card").first();
        await card
          .getByLabel("Proje", { exact: true })
          .selectOption(project.id);
        await card.getByLabel("Kaydırılacak ay", { exact: true }).fill("5");
        await card.getByLabel("Senaryo B senaryosunu kaydet").click();
        await dialog
          .locator(".scenario-message")
          .filter({ hasText: "Senaryo B" })
          .waitFor();
        // By the name in the row heading: a closed row names its successor.
        const saved = (name) =>
          dialog
            .locator(".saved-scenarios li")
            .filter({ has: page.getByText(name, { exact: true }) });
        const item = saved("Senaryo A");
        await item.getByRole("button", { name: "Onayla" }).click();
        await item.getByRole("button", { name: "Takvime Aktar" }).click();
        await item.getByRole("button", { name: "Geri Al" }).waitFor();
        assert.deepEqual(await months(), [
          "2026-09",
          "2027-01",
          "2027-02",
          "2027-03",
        ]);
        const moved = (await f.state()).projects.find(
          (p) => p.id === project.id,
        );
        assert.equal(moved.end, "2027-03");
        assert.equal(moved.phases["2027-01"], "Prototip");
        assert.match(await item.innerText(), /Aktaran: /);
        // B is closed: hidden as history until asked for, then it says why
        // and offers neither approval nor transfer.
        assert.equal(await saved("Senaryo B").count(), 0);
        await dialog.getByLabel(/Geçmişi göster/).check();
        const other = saved("Senaryo B");
        assert.match(await other.innerText(), /Kapatıldı/);
        assert.match(await other.innerText(), /Yerine “Senaryo A” aktarıldı/);
        assert.equal(
          await other.getByRole("button", { name: "Onayla" }).count(),
          0,
        );
        await item.getByRole("button", { name: "Geri Al" }).click();
        await dialog
          .locator(".scenario-message")
          .filter({ hasText: "geri alındı" })
          .waitFor();
        assert.deepEqual(await months(), before);
        const restored = (await f.state()).projects.find(
          (p) => p.id === project.id,
        );
        assert.equal(restored.end, "2026-12");
        const statuses = Object.fromEntries(
          (await f.state()).scheduleScenarios.map((s) => [s.name, s.status]),
        );
        assert.deepEqual(statuses, {
          "Senaryo A": "reverted",
          "Senaryo B": "draft",
        });
        // Finished and draft scenarios can be deleted.
        for (const name of ["Senaryo A", "Senaryo B"]) {
          await saved(name).getByRole("button", { name: "Sil" }).click();
          await dialog
            .locator(".scenario-message")
            .filter({ hasText: "silindi" })
            .waitFor();
        }
        assert.equal((await f.state()).scheduleScenarios, undefined);
      },
    );
  } finally {
    await page.close();
  }
}
