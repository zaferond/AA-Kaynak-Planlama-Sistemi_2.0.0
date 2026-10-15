import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";
import { openRisks, acceptRiskSaveConfirmations } from "./risk.mjs";

export async function checkWorkspaceNavigation(f) {
  await f.check(
    "workspace navigation: repeated exit clicks send one request; failed exit keeps the session and permits an explicit retry",
    async () => {
      const { page, context } = await f.client("root-admin");
      let release;
      const gate = new Promise((resolve) => (release = resolve));
      let writes = 0;
      const hold = async (route) => {
        writes++;
        await gate;
        await route.fulfill({
          status: 503,
          json: { error: "Synthetic navigation logout failure" },
        });
      };
      try {
        const before = await f.state();
        await page.route("**/api/auth/logout", hold);
        const exit = page.getByRole("button", { name: "Çıkış", exact: true });
        await exit.click();
        await f.wait(() => writes > 0, "first exit request held");
        await exit.click();
        await page.waitForTimeout(100);
        assert.equal(writes, 1, "An exit in flight must be shared");
        release();
        await page
          .getByRole("alert")
          .filter({ hasText: "Synthetic navigation logout failure" })
          .waitFor();
        await exit.waitFor();
        assert.deepEqual(await f.state(), before);
        await page.unroute("**/api/auth/logout", hold);
        const [response] = await Promise.all([
          page.waitForResponse((r) => r.url().endsWith("/api/auth/logout")),
          exit.click(),
        ]);
        assert.equal(response.status(), 200);
        await page.getByLabel("Kullanıcı Adı", { exact: true }).waitFor();
        assert.deepEqual(await f.state(), before);
      } finally {
        release();
        await context.close();
      }
    },
  );

  await f.check(
    "workspace navigation: only the latest tab wins after one held draft save; failed saves and declined exit preserve the draft",
    async () => {
      const { page, context } = await f.client("root-admin");
      const stopConfirming = acceptRiskSaveConfirmations(page);
      const openingRisks = (await f.state()).risks;
      let id;
      let release;
      const gate = new Promise((resolve) => (release = resolve));
      let writes = 0,
        exits = 0;
      const count = (request) => {
        if (request.url().endsWith("/api/auth/logout")) exits++;
      };
      page.on("request", count);
      const field = () =>
        page.locator('.risk-editing-row [data-risk-input="description"]');
      const hold = async (route) => {
        writes++;
        await gate;
        await route.fulfill({ response: await route.fetch() });
      };
      try {
        await openRisks(page);
        await page
          .getByRole("button", { name: "Risk Ekle", exact: true })
          .click();
        await field().fill("Synthetic held navigation draft");
        await page.locator('[data-risk-input="likelihood"]').selectOption("2");
        await page.locator('[data-risk-input="impact"]').selectOption("3");
        id = await page
          .locator(".risk-editing-row")
          .getAttribute("data-risk-id");
        const before = await f.state();
        await page.route("**/api/changes", hold, { times: 1 });
        await page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .click();
        await f.wait(() => writes === 1, "draft save held");
        await page
          .getByRole("tab", {
            name: "AA Mühendislik Liderliği Projeler",
            exact: true,
          })
          .click();
        assert.equal(
          await field().inputValue(),
          "Synthetic held navigation draft",
        );
        assert.deepEqual(await f.state(), before);
        release();
        await f.wait(
          async () =>
            (await page
              .getByRole("tab", {
                name: "AA Mühendislik Liderliği Projeler",
                exact: true,
              })
              .getAttribute("aria-selected")) === "true",
          "latest tab selected after save",
        );
        assert.equal(writes, 1);
        assert.equal(
          (await f.state()).risks.find((r) => r.id === id).description,
          "Synthetic held navigation draft",
        );
        await openRisks(page);
        await page
          .locator(`tr[data-risk-id="${id}"] [data-risk-column="description"]`)
          .click();
        await field().fill("Synthetic failed navigation draft");
        await page.route(
          "**/api/changes",
          (route) =>
            route.fulfill({
              status: 503,
              json: { error: "Synthetic navigation save failure" },
            }),
          { times: 1 },
        );
        const committed = await f.state();
        await page.getByRole("button", { name: "Çıkış", exact: true }).click();
        await page
          .locator(".risk-inline-error")
          .filter({ hasText: "Synthetic navigation save failure" })
          .waitFor();
        assert.equal(exits, 0);
        assert.equal(
          await field().inputValue(),
          "Synthetic failed navigation draft",
        );
        assert.deepEqual(await f.state(), committed);
        stopConfirming();
        page.once("dialog", (dialog) => dialog.dismiss());
        await page.getByRole("button", { name: "Çıkış", exact: true }).click();
        await page.evaluate(
          () => new Promise((resolve) => setTimeout(resolve, 0)),
        );
        assert.equal(exits, 0);
        assert.equal(
          await field().inputValue(),
          "Synthetic failed navigation draft",
        );
        assert.deepEqual(await f.state(), committed);
      } finally {
        release();
        stopConfirming();
        page.off("request", count);
        await context.close();
        // The shared CI fixture is reused by the risk numbering/export checks.
        // Remove only this check's synthetic record; retain real revision tombstones.
        const state = await f.state();
        if (id && state.risks.some((risk) => risk.id === id))
          await f.store.mutate(f.actor, (data, actor) =>
            applyChanges(data, actor, [
              {
                kind: "risk",
                id,
                operation: "delete",
                value: null,
                revision: state.revisions["risk:" + id],
              },
            ]),
          );
        assert.deepEqual((await f.state()).risks, openingRisks);
      }
    },
  );
}
