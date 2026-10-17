import assert from "node:assert/strict";

// Proje İlerlemesi: a leader proposes a baseline, an admin approves it and the
// report lists the project. Ordinary users never see the tab. (Monthly
// actuals need a past tracked month; tests/progress-store covers them.)
export async function checkProjectProgress(f) {
  const tab = (page) =>
    page.getByRole("tab", { name: "Proje İlerlemesi", exact: true });
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
        await page.getByRole("button", { name: "Aç", exact: true }).click();
        // Opening 0 % spread evenly to the project end (December).
        assert.equal(
          await page.getByLabel("Kas 2026 hedef %").inputValue(),
          "50",
        );
        assert.equal(
          await page.getByLabel("Ara 2026 hedef %").inputValue(),
          "100",
        );
        // A falling curve cannot be submitted.
        await page.getByLabel("Ara 2026 hedef %").fill("40");
        await page.getByText(/bir önceki aydan küçük olamaz/).waitFor();
        assert(
          await page.getByRole("button", { name: "Onaya Gönder" }).isDisabled(),
        );
        await page.getByLabel("Ara 2026 hedef %").fill("100");
        await page.getByRole("button", { name: "Onaya Gönder" }).click();
        await page.getByText("Onaya gönderildi.").waitFor();
        await f.wait(
          async () =>
            (await f.state()).projectProgress?.[0]?.proposal?.status ===
            "pending",
          "proposal pending",
        );
        // Only an admin approves.
        assert.equal(
          await page.getByRole("button", { name: "Onayla" }).count(),
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
        await page.getByRole("button", { name: /Browser Project A/ }).click();
        await page.getByRole("button", { name: "Onayla" }).click();
        await page.getByText("Temel plan onaylandı.").waitFor();
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
