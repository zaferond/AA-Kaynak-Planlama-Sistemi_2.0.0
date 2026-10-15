import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { acceptRiskSaveConfirmations, openRisks } from "./risk.mjs";

// Real admission rejection against a separate temporary SQL.js/HTTP fixture.
export async function checkMutationAdmission(report) {
  const f = await fixture({
    mutationLimits: { activeLimit: 1, pendingLimit: 0 },
  });
  let release = () => {},
    blocking,
    stopConfirm = () => {};
  try {
    const { page, context } = await f.client("root-admin");
    stopConfirm = acceptRiskSaveConfirmations(page);
    await openRisks(page);
    const auth = await (
      await context.request.get(f.origin + "/api/auth/me")
    ).json();
    const d = await f.state();
    const project = d.projects.find((p) => p.id === "p-a");
    let entered;
    const ready = new Promise((r) => (entered = r));
    const hold = new Promise((r) => (release = r));
    const original = f.store.mutate.bind(f.store);
    f.store.mutate = async (...args) => {
      entered();
      await hold;
      return original(...args);
    };
    blocking = context.request.post(f.origin + "/api/changes", {
      headers: {
        Origin: f.origin,
        "X-Requested-With": "KaynakPortal",
        "X-CSRF-Token": auth.csrf,
      },
      data: {
        changes: [
          {
            kind: "project",
            id: project.id,
            value: {
              ...project,
              responsibleName: "Admission synthetic update",
            },
            revision: d.revisions["project:" + project.id],
          },
        ],
      },
    });
    await ready;
    await report.check(
      "admission: real busy response preserves a new risk draft; explicit retry commits once without automatic resending",
      async () => {
        let posts = 0;
        page.on("request", (r) => {
          if (r.method() === "POST" && r.url().endsWith("/api/changes"))
            posts++;
        });
        await page
          .getByRole("button", { name: "Risk Ekle", exact: true })
          .click();
        const input = (key) =>
          page.locator(`.risk-editing-row [data-risk-input="${key}"]`);
        await input("description").fill("Synthetic busy draft survives");
        await input("likelihood").selectOption("2");
        await input("impact").selectOption("3");
        const busy = page.waitForResponse(
          (r) => r.url().endsWith("/api/changes") && r.status() === 503,
        );
        await input("description").press("Enter");
        await busy;
        await page
          .locator(".risk-inline-error")
          .filter({ hasText: "Sunucu şu anda yoğun" })
          .waitFor();
        assert.equal(
          await input("description").inputValue(),
          "Synthetic busy draft survives",
        );
        assert.equal((await f.state()).risks.length, 0);
        assert.equal(await page.locator(".write-recovery-notice").count(), 0);
        await page.waitForTimeout(50);
        assert.equal(posts, 1);
        release();
        assert.equal((await blocking).status(), 200);
        blocking = null;
        const saved = page.waitForResponse(
          (r) => r.url().endsWith("/api/changes") && r.status() === 200,
        );
        await input("description").press("Enter");
        await saved;
        await page.locator(".risk-editing-row").waitFor({ state: "hidden" });
        const risks = (await f.state()).risks;
        assert.equal(risks.length, 1);
        assert.equal(risks[0].description, "Synthetic busy draft survives");
        assert.equal(posts, 2);
      },
    );
    assert.deepEqual(f.errors, []);
  } finally {
    release();
    await blocking?.catch(() => {});
    stopConfirm();
    await f.close();
  }
}
