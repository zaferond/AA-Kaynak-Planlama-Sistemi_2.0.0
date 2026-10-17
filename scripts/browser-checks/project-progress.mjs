import assert from "node:assert/strict";

// Proje İlerlemesi: a leader proposes a baseline, an admin approves it and the
// report lists the project. Ordinary users never see the tab. (Monthly
// actuals need a past tracked month; tests/progress-store covers them.)
export async function checkProjectProgress(f) {
  const tab = (page) =>
    page.getByRole("tab", { name: "Proje İlerlemesi", exact: true });
  const name = "Browser Project A · " + f.teamA.lead;
  const leader = await f.client("manager");
  const admin = await f.client("root-admin");
  const employee = await f.client("employee");
  try {
    await f.check(
      "progress: a leader proposes a baseline and sends it for approval",
      async () => {
        const { page } = leader;
        await tab(page).click();
        // Tracking starts in November: nothing to enter in October.
        await page.getByText(/Aylık giriş Kas 2026 ile başlar/).waitFor();
        await page.getByRole("tab", { name: "Temel Plan" }).click();
        await page
          .getByLabel("Yeni kayıt projesi")
          .selectOption({ label: "Browser Project A" });
        await page
          .getByLabel("Yeni kayıt liderliği")
          .selectOption(f.teamA.lead);
        await page.getByRole("button", { name: "Ekle", exact: true }).click();
        const card = page.getByRole("region", { name, exact: true });
        const target = (month) => card.getByLabel(`${name} · ${month} hedef %`);
        // Targets start empty; the suggestion needs the opening value first.
        assert.equal(await target("Kas 2026").inputValue(), "");
        const apply = card.getByRole("button", { name: "Önerileni Uygula" });
        assert(await apply.isDisabled());
        await card.getByLabel(`${name} · açılış %`).fill("0");
        await apply.click();
        // Opening 0 % spread evenly to the project end (December).
        assert.equal(await target("Kas 2026").inputValue(), "50");
        assert.equal(await target("Ara 2026").inputValue(), "100");
        // A falling curve cannot be submitted.
        await target("Ara 2026").fill("40");
        await card.getByText(/bir önceki aydan küçük olamaz/).waitFor();
        const submit = card.getByRole("button", { name: "Onaya Gönder" });
        assert(await submit.isDisabled());
        await target("Ara 2026").fill("100");
        await submit.click();
        await card.getByText("Onaya gönderildi.").waitFor();
        await f.wait(
          async () =>
            (await f.state()).projectProgress?.[0]?.proposal?.status ===
            "pending",
          "proposal pending",
        );
        // Only an admin approves.
        assert.equal(
          await card.getByRole("button", { name: "Onayla" }).count(),
          0,
        );
      },
    );
    await f.check(
      "progress: an admin approves the baseline and the report lists the project",
      async () => {
        const { page } = admin;
        await page.reload();
        await tab(page).click();
        await page.getByRole("tab", { name: /Temel Plan/ }).click();
        // Every record is open; the pending proposal comes first.
        assert.equal(
          await page
            .locator(".progress-card")
            .first()
            .getAttribute("aria-label"),
          name,
        );
        const card = page.getByRole("region", { name, exact: true });
        await card.getByRole("button", { name: "Onayla" }).click();
        await card.getByText("Temel plan onaylandı.").waitFor();
        const record = (await f.state()).projectProgress[0];
        assert.equal(record.baselines.length, 1);
        assert.equal(record.baselines[0].approvedByName, "Browser root-admin");
        assert.deepEqual(record.baselines[0].targets, {
          "2026-11": 50,
          "2026-12": 100,
        });
        await page.getByRole("tab", { name: "İlerleme Raporu" }).click();
        await page
          .getByRole("table", { name: "Proje ilerleme raporu" })
          .getByRole("button", { name: "Browser Project A", exact: true })
          .waitFor();
      },
    );
    await f.check("progress: ordinary users do not see the tab", async () => {
      assert.equal(await tab(employee.page).count(), 0);
    });
  } finally {
    await Promise.all([leader, admin, employee].map((c) => c.context.close()));
  }
}
