import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";

// Proje İlerlemesi: a leader sees the projects of the leaderships granted in
// "Kaynak Planlama Yetkisi" grouped by leadership, proposes a baseline, an
// admin approves it and the report lists the project. Ordinary users never
// see the tab. (Monthly actuals need a past tracked month; tests/progress-store
// covers them.)
export async function checkProjectProgress(f) {
  const tab = (page) =>
    page.getByRole("tab", { name: "Proje İlerlemesi", exact: true });
  const name = "Browser Project A · " + f.teamA.lead;
  const otherName = "Browser Project B · " + f.teamA.lead;
  const otherProject = (await f.state()).projects.find((p) => p.id === "p-b");
  // Two projects in one leadership exercise named and unassigned owners.
  const planned = ["p-a", "p-b"].flatMap((id) =>
    ["2026-11", "2026-12"].map((month) => ({
      kind: "allocation",
      id: `${f.teamA.id}|${id}|${month}`,
      value: 1,
      revision: 0,
    })),
  );
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(d, u, [
      ...planned,
      {
        kind: "project",
        id: otherProject.id,
        value: { ...otherProject, responsibleName: "" },
        revision: d.revisions["project:" + otherProject.id] || 0,
      },
    ]),
  );
  const leader = await f.client("manager");
  const admin = await f.client("root-admin");
  const employee = await f.client("employee");
  try {
    await f.check(
      "progress: a leader sees its leadership's projects and proposes a baseline",
      async () => {
        const { page } = leader;
        await tab(page).click();
        assert.equal(
          await page
            .getByRole("tab", { name: /Plan ve Giriş/ })
            .getAttribute("aria-selected"),
          "true",
        );
        assert.equal(
          await page
            .getByText(
              /Liderlik bazında hedeflenen|Aylık gerçekleşen girişi Kas 2026|Şimdilik projelerin hedef eğrilerini/,
            )
            .count(),
          0,
        );
        const group = page.getByRole("region", {
          name: f.teamA.lead + " liderliği",
          exact: true,
        });
        // Only the granted leadership is listed.
        assert.deepEqual(
          await page
            .locator(".progress-leader-group")
            .evaluateAll((nodes) =>
              nodes.map((n) => n.getAttribute("aria-label")),
            ),
          [f.teamA.lead + " liderliği"],
        );
        const card = group.getByRole("region", { name, exact: true });
        const otherCard = group.getByRole("region", {
          name: otherName,
          exact: true,
        });
        await card
          .getByText("Proje Sorumlusu : Synthetic owner", { exact: true })
          .waitFor();
        await otherCard
          .getByText("Proje Sorumlusu : —", { exact: true })
          .waitFor();
        const ownerFilter = page.getByRole("combobox", {
          name: "Proje sorumlusu",
          exact: true,
        });
        await ownerFilter.selectOption({ label: "Synthetic owner" });
        assert.equal(await group.locator(".progress-card").count(), 1);
        await card.waitFor();
        await ownerFilter.selectOption({ label: "Atanmamış" });
        assert.equal(await group.locator(".progress-card").count(), 1);
        await otherCard.waitFor();
        await ownerFilter.selectOption({ label: "Tümü" });
        await card
          .getByText("Hedef Plan Giriş Durumu: Hedef Plan Girişi Bekliyor", {
            exact: true,
          })
          .waitFor();
        await card
          .getByText(
            /Geçekleşme Giriş Durumu.*Hedef Plan Proje Onayı Bekleniyor/,
          )
          .waitFor();
        const target = (month) => card.getByLabel(`${name} · ${month} hedef %`);
        await card
          .getByLabel(`${name} · başlangıç ayı`)
          .selectOption("2026-09");
        // Targets start empty; the suggestion needs the opening value first.
        assert.equal(await target("Kas 2026").inputValue(), "");
        const apply = card.getByRole("button", { name: "Önerileni Uygula" });
        assert(await apply.isDisabled());
        await card.getByLabel(`${name} · başlangıç %`).fill("0");
        const groupToggle = group.getByRole("button", {
          name: f.teamA.lead + " projeleri",
          exact: true,
        });
        await groupToggle.click();
        assert.equal(await groupToggle.getAttribute("aria-expanded"), "false");
        assert.equal(await card.isVisible(), false);
        await groupToggle.click();
        assert.equal(await groupToggle.getAttribute("aria-expanded"), "true");
        assert.equal(
          await card.getByLabel(`${name} · başlangıç %`).inputValue(),
          "0",
        );
        await page
          .getByRole("button", { name: "Tümünü Kapat", exact: true })
          .click();
        assert.equal(await card.isVisible(), false);
        assert.equal(await otherCard.isVisible(), false);
        await f.capture(page, "progress-groups-collapsed");
        await page
          .getByRole("button", { name: "Tümünü Aç", exact: true })
          .click();
        assert.equal(await otherCard.isVisible(), true);
        assert.equal(
          await card.getByLabel(`${name} · başlangıç %`).inputValue(),
          "0",
        );
        await apply.click();
        // Opening 0 %, the remainder follows the planned resource (1 + 1).
        assert.equal(await target("Kas 2026").inputValue(), "50");
        assert.equal(await target("Ara 2026").inputValue(), "100");
        // Editing October above November rebuilds the remaining curve and preview.
        await target("Eki 2026").fill("80");
        assert.equal(await target("Eyl 2026").inputValue(), "0");
        assert.equal(await target("Eki 2026").inputValue(), "80");
        assert.equal(await target("Kas 2026").inputValue(), "90");
        assert.equal(await target("Ara 2026").inputValue(), "100");
        const recommendation = card.getByRole("row", {
          name: /^Önerilen hedef %/,
        });
        await recommendation.getByText("90", { exact: true }).waitFor();
        await apply.click();
        assert.equal(await target("Eki 2026").inputValue(), "80");
        assert.equal(await target("Kas 2026").inputValue(), "90");
        await f.capture(page, "progress-recalculated-targets");
        // Restart the suggestion from November for the approval flow below.
        await card
          .getByLabel(`${name} · başlangıç ayı`)
          .selectOption("2026-11");
        await apply.click();
        assert.equal(await target("Kas 2026").inputValue(), "50");
        // Done early: 100 % in November clears December, and the curve can
        // still be submitted with the empty month.
        await target("Kas 2026").fill("100");
        assert.equal(await target("Ara 2026").inputValue(), "");
        assert(
          await card
            .getByRole("button", { name: "Hedef Planını Onaya Gönder" })
            .isEnabled(),
        );
        await apply.click();
        assert.equal(await target("Kas 2026").inputValue(), "100");
        assert.equal(await target("Ara 2026").inputValue(), "");
        await target("Kas 2026").fill("50");
        // A falling curve cannot be submitted.
        await target("Ara 2026").fill("40");
        await card.getByText(/önceki hedeften küçük olamaz/).waitFor();
        const submit = card.getByRole("button", {
          name: "Hedef Planını Onaya Gönder",
        });
        assert(await submit.isDisabled());
        await target("Ara 2026").fill("100");
        await submit.click();
        await card
          .getByText("Hedef planı proje ekibi onayına gönderildi.")
          .waitFor();
        await f.wait(
          async () =>
            (await f.state()).projectProgress?.[0]?.proposal?.status ===
            "pending",
          "proposal pending",
        );
        // Only an admin approves.
        assert.equal(
          await card
            .getByRole("button", { name: "Hedef Planını Onayla" })
            .count(),
          0,
        );
        await otherCard.getByLabel(`${otherName} · başlangıç %`).fill("0");
        await otherCard.getByRole("button", { name: "Taslağı Kaydet" }).click();
        await otherCard.getByText("Hedef planı taslağı kaydedildi.").waitFor();
      },
    );
    await f.check(
      "progress: an admin approves the baseline and the report lists the project",
      async () => {
        const { page } = admin;
        await page.reload();
        await tab(page).click();
        assert.equal(
          await page
            .getByRole("tab", { name: /Plan ve Giriş/ })
            .getAttribute("aria-selected"),
          "true",
        );
        // The pending proposal comes first in its leadership group.
        const group = page.getByRole("region", {
          name: f.teamA.lead + " liderliği",
          exact: true,
        });
        assert.equal(
          await group
            .locator(".progress-card")
            .first()
            .getAttribute("aria-label"),
          name,
        );
        const card = group.getByRole("region", { name, exact: true });
        await card
          .getByRole("button", { name: "Hedef Planını Onayla" })
          .click();
        await card.getByText("Hedef planı onaylandı.").waitFor();
        const record = (await f.state()).projectProgress.find(
          (r) => r.projectId === "p-a" && r.leader === f.teamA.lead,
        );
        assert.equal(record.baselines.length, 1);
        assert.equal(record.baselines[0].approvedByName, "Browser root-admin");
        assert.deepEqual(record.baselines[0].targets, {
          "2026-11": 50,
          "2026-12": 100,
        });
        await card
          .getByText("Hedef Plan Giriş Durumu: Onaylandı", { exact: true })
          .waitFor();
        await card
          .getByText("Geçekleşme Giriş Durumu: Henüz girişe açık değil", {
            exact: true,
          })
          .waitFor();
        const entryFilter = page.getByRole("combobox", {
          name: "Geçekleşme Giriş Durumu",
          exact: true,
        });
        assert.equal(
          await entryFilter.locator('option[value="entered"]').textContent(),
          "Kaydedildi (0)",
        );
        // Approved: the targets are fixed and the actual row appears.
        await card.getByRole("rowheader", { name: "Gerçekleşen %" }).waitFor();
        assert.equal(
          await card.getByLabel(`${name} · Kas 2026 hedef %`).count(),
          0,
        );
        await page.getByRole("tab", { name: "İlerleme Raporu" }).click();
        await page
          .getByRole("table", { name: "Proje ilerleme raporu" })
          .getByRole("button", { name: "Browser Project A", exact: true })
          .waitFor();
        const ownerFilter = page.getByRole("combobox", {
          name: "Proje sorumlusu",
          exact: true,
        });
        const report = page.getByRole("table", {
          name: "Proje ilerleme raporu",
        });
        await ownerFilter.selectOption({ label: "Synthetic owner" });
        assert.equal(await report.locator(".progress-project-row").count(), 1);
        await report
          .getByText("Proje Sorumlusu : Synthetic owner", { exact: true })
          .waitFor();
        await ownerFilter.selectOption({ label: "Atanmamış" });
        assert.equal(await report.locator(".progress-project-row").count(), 1);
        await report
          .getByRole("button", { name: "Browser Project B", exact: true })
          .waitFor();
        await page.getByRole("tab", { name: /Plan ve Giriş/ }).click();
        assert.equal(await page.locator(".progress-card").count(), 1);
        await page
          .getByRole("region", { name: otherName, exact: true })
          .waitFor();
        await ownerFilter.selectOption({ label: "Tümü" });
        await f.capture(page, "progress-plan-and-entry");
        await page.getByRole("tab", { name: "İlerleme Raporu" }).click();
        await f.capture(page, "progress-report-owners");
      },
    );
    await f.check(
      "progress: independent plan, entry and lock states stay correct through a revision",
      async () => {
        const { page } = admin;
        await page.getByRole("tab", { name: /Plan ve Giriş/ }).click();
        const otherCard = page.getByRole("region", {
          name: otherName,
          exact: true,
        });
        await otherCard
          .getByLabel(`${otherName} · Ara 2026 hedef %`)
          .fill("100");
        await otherCard
          .getByRole("button", { name: "Hedef Planını Onayla", exact: true })
          .click();
        await otherCard
          .getByText("Hedef planı onaylandı.", { exact: true })
          .waitFor();
        await page
          .getByRole("combobox", { name: "Ay", exact: true })
          .selectOption("2026-09");
        const entryFilter = page.getByRole("combobox", {
          name: "Geçekleşme Giriş Durumu",
          exact: true,
        });
        const planFilter = page.getByRole("combobox", {
          name: "Hedef Plan Giriş Durumu",
          exact: true,
        });
        await entryFilter.selectOption("closed");
        assert.equal(await page.locator(".progress-card").count(), 1);
        await page.getByRole("region", { name, exact: true }).waitFor();
        await entryFilter.selectOption("entered");
        assert.equal(await page.locator(".progress-card").count(), 0);
        await entryFilter.selectOption("waiting");
        assert.equal(await page.locator(".progress-card").count(), 1);
        await otherCard
          .getByText(
            "Geçekleşme Giriş Durumu (Eyl 2026): Gerçekleşen Durum Girişi Bekleniyor",
            {
              exact: true,
            },
          )
          .waitFor();
        await otherCard
          .getByLabel(`${otherName} · Eyl 2026 gerçekleşen %`)
          .fill("35");
        await otherCard
          .getByLabel(`${otherName} · açıklama`)
          .fill("Eylül sonu tamamlanma durumu");
        await otherCard
          .getByRole("button", { name: "Gerçekleşeni Kaydet", exact: true })
          .click();
        await f.wait(
          async () =>
            (await f.state()).projectProgress.find((r) => r.projectId === "p-b")
              ?.actuals["2026-09"]?.pct === 35,
          "September actual saved",
        );
        await entryFilter.selectOption("entered");
        await otherCard
          .getByText("Geçekleşme Giriş Durumu (Eyl 2026): Kaydedildi", {
            exact: true,
          })
          .waitFor();
        await page
          .getByRole("tab", { name: "İlerleme Raporu", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: "Eyl 2026 Ayını Değişikliğe Kapat",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", {
            name: "Eyl 2026 Ayını Değişikliğe Aç",
            exact: true,
          })
          .waitFor();
        await page.getByRole("tab", { name: /Plan ve Giriş/ }).click();
        await otherCard
          .getByText("Geçekleşme Giriş Durumu (Eyl 2026): Kaydedildi", {
            exact: true,
          })
          .waitFor();
        await otherCard
          .getByText("Ay kilidi: Değişikliğe kapalı", { exact: true })
          .waitFor();
        assert.equal(
          await otherCard
            .getByLabel(`${otherName} · Eyl 2026 gerçekleşen %`)
            .count(),
          0,
        );
        assert(
          await otherCard.getByLabel(`${otherName} · açıklama`).isDisabled(),
        );
        assert.equal(
          await otherCard
            .getByRole("button", { name: "Gerçekleşeni Kaydet", exact: true })
            .count(),
          0,
        );
        await otherCard
          .getByRole("button", { name: "Hedef Planını Revize Et", exact: true })
          .click();
        await otherCard
          .getByLabel(`${otherName} · revizyon gerekçesi`)
          .fill("Teslim takvimi güncellendi");
        await otherCard
          .getByRole("button", { name: "Önerileni Uygula", exact: true })
          .click();
        await otherCard
          .getByRole("button", { name: "Taslağı Kaydet", exact: true })
          .click();
        await otherCard
          .getByText("Hedef planı taslağı kaydedildi.", { exact: true })
          .waitFor();
        await otherCard
          .getByText("Hedef Plan Giriş Durumu: Onaylandı", { exact: true })
          .waitFor();
        await otherCard
          .getByText("Revizyon Giriş Durumu: Taslak", { exact: true })
          .waitFor();
        await planFilter.selectOption("draft");
        await entryFilter.selectOption("entered");
        assert.equal(await page.locator(".progress-card").count(), 1);
        await otherCard.waitFor();
        await planFilter.selectOption("");
        await otherCard
          .getByRole("button", {
            name: "Hedef Planını Onaya Gönder",
            exact: true,
          })
          .click();
        await otherCard
          .getByText("Revizyon Giriş Durumu: Proje Ekibi Onayında", {
            exact: true,
          })
          .waitFor();
        await otherCard
          .getByRole("button", {
            name: "Düzeltme İçin Geri Gönder",
            exact: true,
          })
          .click();
        await otherCard
          .getByText("Revizyon Giriş Durumu: Taslak", { exact: true })
          .waitFor();
        await otherCard
          .getByText("Geçekleşme Giriş Durumu (Eyl 2026): Kaydedildi", {
            exact: true,
          })
          .waitFor();
        const record = (await f.state()).projectProgress.find(
          (r) => r.projectId === "p-b",
        );
        assert.equal(record.baselines.length, 1);
        assert.equal(record.actuals["2026-09"].pct, 35);
        await f.capture(page, "progress-independent-statuses");
        await page
          .getByText("Durumlar ve süreç nasıl işler?", { exact: true })
          .click();
        await f.capture(page, "progress-process-help");
        await page
          .getByRole("tab", { name: "İlerleme Raporu", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: "Eyl 2026 Ayını Değişikliğe Aç",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", {
            name: "Eyl 2026 Ayını Değişikliğe Kapat",
            exact: true,
          })
          .waitFor();
      },
    );
    await f.check("progress: ordinary users do not see the tab", async () => {
      assert.equal(await tab(employee.page).count(), 0);
    });
  } finally {
    await Promise.all([leader, admin, employee].map((c) => c.context.close()));
    // Leave the shared fixture as it was for the checks that follow.
    await f.store.mutate(f.actor, (d, u) =>
      applyChanges(d, u, [
        {
          kind: "project",
          id: otherProject.id,
          value: otherProject,
          revision: d.revisions["project:" + otherProject.id] || 0,
        },
        ...planned.map((change) => ({
          ...change,
          value: null,
          operation: "delete",
          revision: d.revisions["allocation:" + change.id] || 0,
        })),
        ...(d.projectProgress || []).map((record) => ({
          kind: "progress",
          id: record.id,
          value: null,
          operation: "delete",
          revision: d.revisions["progress:" + record.id] || 0,
        })),
      ]),
    );
  }
}
