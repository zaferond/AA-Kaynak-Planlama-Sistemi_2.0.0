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
