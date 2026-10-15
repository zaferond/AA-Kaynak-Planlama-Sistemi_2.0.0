import assert from "node:assert/strict";
import path from "node:path";
import { download, zipEntries, validateXml } from "./files.mjs";

export const riskSaveConfirmation =
  "Yaptığınız Değişiklikler Kaydedilecektir. Onaylıyor musunuz ?";

// Existing save/409/503 regressions explicitly approve the new save prompt.
// Delete/reload confirmations retain their individual accept/dismiss handlers.
export function acceptRiskSaveConfirmations(page) {
  const accept = (dialog) => {
    if (dialog.message() === riskSaveConfirmation) {
      assert.equal(dialog.type(), "confirm");
      void dialog.accept();
    }
  };
  page.on("dialog", accept);
  return () => page.off("dialog", accept);
}

export async function openRisks(page, project = "Browser Project A") {
  await page
    .getByRole("tab", { name: "AA Risk Yönetimi", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Risk projeleri", exact: true })
    .click();
  await page.getByRole("checkbox", { name: project, exact: true }).check();
  await page.locator(".mast").click({ position: { x: 10, y: 10 } });
  await page.locator(".risk-table").waitFor();
}
const edit = (page) => page.locator(".risk-editing-row");
const field = (page, key) => edit(page).locator(`[data-risk-input="${key}"]`);
const row = (page, id) => page.locator(`tr[data-risk-id="${id}"]`);

export async function checkRisks(f) {
  const { page } = await f.client("root-admin");
  const stopConfirming = acceptRiskSaveConfirmations(page);
  try {
    await openRisks(page);
    await f.check(
      "risk: cancel a blank new bottom row without a write",
      async () => {
        const before = await f.state();
        await page
          .getByRole("button", { name: "Risk Ekle", exact: true })
          .click();
        await edit(page).waitFor();
        assert.equal(await page.getByRole("dialog").count(), 0);
        await field(page, "description").press("Enter");
        await page.locator(".risk-inline-error").waitFor();
        await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
        assert.deepEqual((await f.state()).risks, before.risks);
      },
    );
    let first, second;
    await f.check(
      "risk: inline create, initial/residual scores, strategy and append numbering",
      async () => {
        await page
          .getByRole("button", { name: "Risk Ekle", exact: true })
          .click();
        await field(page, "description").fill(
          "Browser initial risk — Türkçe <not> & açıklama",
        );
        await field(page, "likelihood").selectOption("5");
        await field(page, "impact").selectOption("5");
        assert.equal(
          (
            await edit(page).locator('[data-risk-column="score"]').innerText()
          ).trim(),
          "25",
        );
        assert(
          (
            await edit(page).locator('[data-risk-column="level"]').innerText()
          ).includes("Tolere Edilemez"),
        );
        await field(page, "control").click();
        await field(page, "implementedAt").fill("2026-09-01");
        await field(page, "residualLikelihood").selectOption("1");
        await field(page, "residualImpact").selectOption("2");
        assert.equal(
          (
            await edit(page)
              .locator('[data-risk-column="residualScore"]')
              .innerText()
          ).trim(),
          "2",
        );
        await field(page, "description").press("Enter");
        await edit(page).waitFor({ state: "hidden" });
        first = (await f.state()).risks[0].id;
        assert.equal((await f.state()).risks[0].strategy, "Kontrol");
        await page
          .getByRole("button", { name: "Risk Ekle", exact: true })
          .click();
        await field(page, "description").fill("Browser second risk");
        await field(page, "likelihood").selectOption("2");
        await field(page, "impact").selectOption("3");
        const ids = await page
          .locator("tr[data-risk-id]")
          .evaluateAll((rows) => rows.map((row) => row.dataset.riskId));
        assert.equal(ids[0], first);
        assert.equal(
          await edit(page).locator(".risk-row-number").innerText(),
          "02",
        );
        await field(page, "description").press("Enter");
        await edit(page).waitFor({ state: "hidden" });
        second = (await f.state()).risks.find((r) => r.id !== first).id;
      },
    );
    await f.check(
      "risk: another row saves the current row; Shift+Enter and Escape retain their meanings",
      async () => {
        await row(page, first)
          .locator('[data-risk-column="description"]')
          .click();
        await field(page, "cause").fill("First cause");
        await field(page, "cause").press("Shift+Enter");
        await field(page, "cause").pressSequentially("Second cause");
        await row(page, second)
          .locator('[data-risk-column="description"]')
          .click();
        await f.wait(
          async () =>
            (await edit(page).getAttribute("data-risk-id")) === second,
          "switch risk row",
        );
        assert.equal(
          (await f.state()).risks.find((r) => r.id === first).cause,
          "First cause\nSecond cause",
        );
        await field(page, "description").fill("Discarded text");
        await field(page, "description").press("Escape");
        assert.equal(
          (await f.state()).risks.find((r) => r.id === second).description,
          "Browser second risk",
        );
      },
    );
    await f.check(
      "risk: Tab/Shift+Tab retain focus; composing Enter and delete-button Enter cannot autosave",
      async () => {
        const before = (await f.state()).risks.find((r) => r.id === second);
        let requests = 0;
        const count = (request) => {
          if (request.url().endsWith("/api/changes")) requests++;
        };
        page.on("request", count);
        try {
          await row(page, second)
            .locator('[data-risk-column="reportedBy"]')
            .click();
          await field(page, "reportedBy").fill("Synthetic composing draft");
          await page.keyboard.press("Tab");
          assert(
            await field(page, "category").evaluate(
              (element) => element === document.activeElement,
            ),
          );
          await page.keyboard.press("Shift+Tab");
          assert(
            await field(page, "reportedBy").evaluate(
              (element) => element === document.activeElement,
            ),
          );
          await field(page, "reportedBy").evaluate((element) =>
            element.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                bubbles: true,
                cancelable: true,
                isComposing: true,
              }),
            ),
          );
          await page.waitForTimeout(100);
          assert.equal(
            await field(page, "reportedBy").inputValue(),
            "Synthetic composing draft",
          );
          assert.deepEqual(
            (await f.state()).risks.find((r) => r.id === second),
            before,
          );
          await page
            .getByRole("button", { name: "Riski Sil", exact: true })
            .focus();
          page.once("dialog", (dialog) => dialog.dismiss());
          await page.keyboard.press("Enter");
          assert.equal(await edit(page).count(), 1);
          await field(page, "reportedBy").press("Escape");
          assert.equal(requests, 0);
          assert.deepEqual(
            (await f.state()).risks.find((r) => r.id === second),
            before,
          );
        } finally {
          page.off("request", count);
        }
      },
    );
    await f.check(
      "risk: failed autosave blocks tab change and retains the draft; retry navigates",
      async () => {
        await row(page, first)
          .locator('[data-risk-column="description"]')
          .click();
        await field(page, "description").fill("Risk preserved after failure");
        await page.route(
          "**/api/changes",
          (route) =>
            route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Synthetic risk save failure" }),
            }),
          { times: 1 },
        );
        await page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .click();
        await page
          .locator(".risk-inline-error")
          .filter({ hasText: "Synthetic risk save failure" })
          .waitFor();
        assert.equal(
          await page
            .getByRole("tab", { name: "AA Risk Yönetimi", exact: true })
            .getAttribute("aria-selected"),
          "true",
        );
        assert.equal(
          await field(page, "description").inputValue(),
          "Risk preserved after failure",
        );
        assert.notEqual(
          (await f.state()).risks.find((r) => r.id === first).description,
          "Risk preserved after failure",
        );
        await page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .click();
        await page
          .getByRole("heading", {
            name: "Aylık Eksik Kaynak Grafiği",
            exact: true,
          })
          .waitFor();
        assert.equal(
          (await f.state()).risks.find((r) => r.id === first).description,
          "Risk preserved after failure",
        );
        await openRisks(page);
      },
    );
    await f.check(
      "risk: failed or invalid save blocks project filtering and keyboard tab navigation",
      async () => {
        await row(page, first)
          .locator('[data-risk-column="description"]')
          .click();
        await field(page, "description").fill("Filter change draft");
        await page.route(
          "**/api/changes",
          (route) =>
            route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Synthetic filter save failure" }),
            }),
          { times: 1 },
        );
        await page
          .getByRole("button", { name: "Risk projeleri", exact: true })
          .click();
        await page
          .getByRole("checkbox", { name: "Browser Project A", exact: true })
          .click();
        await page
          .locator(".risk-inline-error")
          .filter({ hasText: "Synthetic filter save failure" })
          .waitFor();
        assert.equal(
          await page
            .getByRole("checkbox", { name: "Browser Project A", exact: true })
            .isChecked(),
          true,
        );
        await page.locator(".mast").click({ position: { x: 10, y: 10 } });
        await edit(page).waitFor({ state: "hidden" });
        await row(page, first)
          .locator('[data-risk-column="description"]')
          .click();
        await field(page, "description").fill("");
        await page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .focus();
        await page.keyboard.press("Enter");
        assert.equal(
          await page
            .getByRole("tab", { name: "AA Risk Yönetimi", exact: true })
            .getAttribute("aria-selected"),
          "true",
        );
        await field(page, "description").press("Escape");
      },
    );
    await f.check(
      "risk: pending save freezes inputs, coalesces requests and preserves requested navigation",
      async () => {
        await row(page, first)
          .locator('[data-risk-column="description"]')
          .click();
        await field(page, "description").fill("Pending risk save");
        let release,
          held = false,
          requests = 0;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const hold = async (route) => {
          requests++;
          held = true;
          await gate;
          await route.continue();
        };
        await page.route("**/api/changes", hold);
        try {
          await field(page, "description").press("Enter");
          await f.wait(() => held, "risk request held");
          assert(await field(page, "description").isDisabled());
          assert(await field(page, "impact").isDisabled());
          await page
            .getByRole("tab", {
              name: "AA Kaynak Planlama Raporları",
              exact: true,
            })
            .click();
          await page
            .getByRole("tab", {
              name: "AA Mühendislik Liderliği Projeler",
              exact: true,
            })
            .click();
          release();
          await page.locator(".project-main-row").first().waitFor();
          assert.equal(requests, 1);
          assert.equal(
            (await f.state()).risks.find((r) => r.id === first).description,
            "Pending risk save",
          );
        } finally {
          release();
          await page.unrouteAll({ behavior: "wait" });
        }
        await openRisks(page);
      },
    );
    await f.check(
      "risk: Excel export includes the draft saved by clicking export",
      async () => {
        await row(page, first)
          .locator('[data-risk-column="description"]')
          .click();
        await field(page, "description").fill("Export current draft");
        const bytes = await download(
          page,
          page.getByRole("button", { name: "Excel'e Aktar", exact: true }),
          path.join(f.dir, "risk-current-draft.xlsx"),
        );
        const entries = zipEntries(bytes);
        assert(
          Object.values(entries).some((xml) =>
            xml.includes("Export current draft"),
          ),
        );
      },
    );
    await f.check(
      "risk: failed export/logout preserve the draft; JSON backup waits for a successful save",
      async () => {
        await row(page, first).locator('[data-risk-column="owner"]').click();
        await field(page, "owner").fill("Owner pending export");
        let downloads = 0;
        const downloaded = () => downloads++;
        page.on("download", downloaded);
        await page.route(
          "**/api/changes",
          (route) =>
            route.fulfill({
              status: 503,
              json: { error: "Synthetic export save failure" },
            }),
          { times: 1 },
        );
        await page
          .getByRole("button", { name: "Excel'e Aktar", exact: true })
          .click();
        await page
          .locator(".risk-inline-error")
          .filter({ hasText: "Synthetic export save failure" })
          .waitFor();
        assert.equal(
          await field(page, "owner").inputValue(),
          "Owner pending export",
        );
        assert.equal(downloads, 0);
        page.off("download", downloaded);
        const backup = JSON.parse(
          (
            await download(
              page,
              page.getByRole("button", {
                name: "Veri Yedeği İndir",
                exact: true,
              }),
              path.join(f.dir, "risk-saved-backup.json"),
            )
          ).toString("utf8"),
        );
        assert.equal(
          backup.data.risks.find((risk) => risk.id === first).owner,
          "Owner pending export",
        );
        await row(page, first).locator('[data-risk-column="owner"]').click();
        await field(page, "owner").fill("Owner pending logout");
        await page.route(
          "**/api/changes",
          (route) =>
            route.fulfill({
              status: 503,
              json: { error: "Synthetic logout save failure" },
            }),
          { times: 1 },
        );
        await page.getByRole("button", { name: "Çıkış", exact: true }).click();
        await page
          .locator(".risk-inline-error")
          .filter({ hasText: "Synthetic logout save failure" })
          .waitFor();
        assert.equal(
          await field(page, "owner").inputValue(),
          "Owner pending logout",
        );
        assert.equal(
          (await page.request.get(f.origin + "/api/data")).status(),
          200,
        );
        await field(page, "owner").press("Escape");
      },
    );
    await f.check(
      "risk: multi/all-project filters, matrix, Excel download and delete confirmation",
      async () => {
        await page
          .getByRole("button", { name: "Risk projeleri", exact: true })
          .click();
        await page
          .getByRole("checkbox", { name: "Tüm Projeler", exact: true })
          .check();
        await page.locator(".mast").click({ position: { x: 10, y: 10 } });
        assert(
          await page
            .getByRole("combobox", { name: "Yeni riskin projesi" })
            .isVisible(),
        );
        assert(
          await page
            .getByRole("button", { name: "Risk Ekle", exact: true })
            .isDisabled(),
        );
        await page
          .getByRole("combobox", { name: "Yeni riskin projesi" })
          .selectOption("p-b");
        await page.locator(".risk-matrix-panel summary").click();
        assert.equal(
          await page.locator(".risk-matrix-panel tbody td").count(),
          25,
        );
        const file = await download(
          page,
          page.getByRole("button", { name: "Excel'e Aktar", exact: true }),
          path.join(f.dir, "risk-plan.xlsx"),
        );
        const entries = zipEntries(file);
        await validateXml(page, entries);
        assert(
          Object.values(entries).some((xml) =>
            xml.includes("Export current draft"),
          ),
        );
        const sheets = Object.keys(entries).filter((name) =>
          /^xl\/worksheets\/sheet\d+\.xml$/.test(name),
        );
        assert(sheets.length >= 3);
        await row(page, second)
          .locator('[data-risk-column="description"]')
          .click();
        page.once("dialog", (d) => d.dismiss());
        await page
          .getByRole("button", { name: "Riski Sil", exact: true })
          .click();
        assert((await f.state()).risks.some((r) => r.id === second));
        page.once("dialog", (d) => d.accept());
        await page
          .getByRole("button", { name: "Riski Sil", exact: true })
          .click();
        await edit(page).waitFor({ state: "hidden" });
        assert(!(await f.state()).risks.some((r) => r.id === second));
        await f.capture(page, "risk-admin");
      },
    );
    const employee = await f.client("employee"),
      manager = await f.client("manager");
    acceptRiskSaveConfirmations(employee.page);
    acceptRiskSaveConfirmations(manager.page);
    await f.check(
      "risk: normal users edit only their own records; managers can edit others",
      async () => {
        await openRisks(employee.page);
        assert.equal(
          await row(employee.page, first).getAttribute("data-risk-editable"),
          "false",
        );
        await row(employee.page, first).click();
        assert.equal(await edit(employee.page).count(), 0);
        await employee.page
          .getByRole("button", { name: "Risk Ekle", exact: true })
          .click();
        await field(employee.page, "description").fill("Employee owned risk");
        await field(employee.page, "likelihood").selectOption("1");
        await field(employee.page, "impact").selectOption("2");
        await field(employee.page, "description").press("Enter");
        await edit(employee.page).waitFor({ state: "hidden" });
        const own = (await f.state()).risks.find(
          (r) => r.description === "Employee owned risk",
        );
        assert.equal(own.createdBy, "employee");
        await row(employee.page, own.id).click();
        assert.equal(
          await employee.page
            .getByRole("button", { name: "Riski Sil", exact: true })
            .count(),
          0,
        );
        await field(employee.page, "owner").fill("Employee owner");
        await field(employee.page, "owner").press("Enter");
        await edit(employee.page).waitFor({ state: "hidden" });
        await openRisks(manager.page);
        await row(manager.page, first).click();
        await field(manager.page, "owner").fill("Manager review");
        await field(manager.page, "owner").press("Enter");
        await edit(manager.page).waitFor({ state: "hidden" });
        assert.equal(
          (await f.state()).risks.find((r) => r.id === first).owner,
          "Manager review",
        );
        await f.capture(employee.page, "risk-normal");
      },
    );
    await employee.context.close();
    await manager.context.close();
  } catch (error) {
    await f.capture(page, "risk-failure").catch(() => {});
    throw error;
  } finally {
    stopConfirming();
  }
}
