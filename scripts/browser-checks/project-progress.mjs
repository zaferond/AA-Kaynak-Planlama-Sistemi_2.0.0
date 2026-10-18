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
  // The leadership plans resource on project A, so it is one of its projects.
  const planned = ["2026-11", "2026-12"].map((month) => ({
    kind: "allocation",
    id: `${f.teamA.id}|p-a|${month}`,
    value: 1,
    revision: 0,
  }));
  await f.store.mutate(f.actor, (d, u) => applyChanges(d, u, planned));
  const leader = await f.client("manager");
  const admin = await f.client("root-admin");
  const employee = await f.client("employee");
  try {
    await f.check(
      "progress: a leader sees its leadership's projects and proposes a baseline",
      async () => {
        const { page } = leader;
        await tab(page).click();
        // Tracking starts in November: nothing to enter in October.
        await page
          .getByText(/Aylık gerçekleşen girişi Kas 2026 ile başlar/)
          .waitFor();
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
        const target = (month) => card.getByLabel(`${name} · ${month} hedef %`);
        // Targets start empty; the suggestion needs the opening value first.
        assert.equal(await target("Kas 2026").inputValue(), "");
        const apply = card.getByRole("button", { name: "Önerileni Uygula" });
        assert(await apply.isDisabled());
        await card.getByLabel(`${name} · açılış %`).fill("0");
        await apply.click();
        // Opening 0 %, the remainder follows the planned resource (1 + 1).
        assert.equal(await target("Kas 2026").inputValue(), "50");
        assert.equal(await target("Ara 2026").inputValue(), "100");
        // Done early: 100 % in November clears December, and the curve can
        // still be submitted with the empty month.
        await target("Kas 2026").fill("100");
        assert.equal(await target("Ara 2026").inputValue(), "");
        assert(
          await card.getByRole("button", { name: "Onaya Gönder" }).isEnabled(),
        );
        await apply.click();
        assert.equal(await target("Kas 2026").inputValue(), "50");
        // A falling curve cannot be submitted.
        await target("Ara 2026").fill("40");
        await card.getByText(/önceki hedeften küçük olamaz/).waitFor();
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
        await page.getByRole("tab", { name: /Plan ve Giriş/ }).click();
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
        await card.getByRole("button", { name: "Onayla" }).click();
        await card.getByText("Temel plan onaylandı.").waitFor();
        const record = (await f.state()).projectProgress[0];
        assert.equal(record.baselines.length, 1);
        assert.equal(record.baselines[0].approvedByName, "Browser root-admin");
        assert.deepEqual(record.baselines[0].targets, {
          "2026-11": 50,
          "2026-12": 100,
        });
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
