import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";
import { initialRiskSystems } from "../../shared/risk-system-seed.ts";
import { acceptRiskSaveConfirmations, openRisks } from "./risk.mjs";

export async function checkRiskSystems(f) {
  const admin = await f.client("root-admin");
  const normal = await f.client("employee");
  const manager = await f.client("manager");
  const stopConfirming = acceptRiskSaveConfirmations(normal.page);
  const { page } = admin;
  const dialog = page.getByRole("dialog", {
    name: "Sistem / Alt Sistem Yönetimi",
    exact: true,
  });
  const firstName = "Synthetic <Subsystem> & katalog";
  const renamed = "Synthetic revised subsystem";
  let systemId, riskId;
  try {
    await openRisks(page);
    await f.check(
      "risk systems: 75 Epic names, adjacent toolbar button and searchable scrollable management list",
      async () => {
        const add = page.getByRole("button", {
          name: "Risk Ekle",
          exact: true,
        });
        const manage = page.getByRole("button", {
          name: "Sistem / Alt Sistem Ekle",
          exact: true,
        });
        assert(
          await add.evaluate((element) =>
            element.nextElementSibling?.textContent.includes(
              "Sistem / Alt Sistem Ekle",
            ),
          ),
        );
        await manage.click();
        await dialog.waitFor();
        assert.equal(await dialog.locator(".directory-record").count(), 75);
        await dialog.getByRole("searchbox").fill(initialRiskSystems[0].name);
        assert.equal(await dialog.locator(".directory-record").count(), 1);
        await dialog.getByRole("searchbox").fill("");
        const scrollable = await dialog
          .locator(".directory-manager-records")
          .evaluate(
            (element) =>
              element.scrollHeight > element.clientHeight &&
              ["auto", "scroll"].includes(getComputedStyle(element).overflowY),
          );
        assert(scrollable);
        await f.capture(page, "risk-systems-management");
      },
    );
    await f.check(
      "risk systems: create through shared directory editor, duplicate protection and unchanged draft on failed save",
      async () => {
        await dialog
          .getByRole("button", {
            name: "Yeni Sistem / Alt Sistem Ekle",
            exact: true,
          })
          .click();
        await dialog
          .getByLabel("Sistem / Alt Sistem Adı", { exact: true })
          .fill(firstName);
        await dialog.getByRole("button", { name: "Ekle", exact: true }).click();
        await f.wait(async () => {
          systemId = (await f.state()).riskSystems.find(
            (item) => item.name === firstName,
          )?.id;
          return !!systemId;
        }, "new system saved");
        await dialog
          .getByRole("button", {
            name: "Yeni Sistem / Alt Sistem Ekle",
            exact: true,
          })
          .click();
        await dialog
          .getByLabel("Sistem / Alt Sistem Adı", { exact: true })
          .fill(firstName);
        await dialog.getByRole("button", { name: "Ekle", exact: true }).click();
        await dialog.getByRole("alert").waitFor();
        assert((await dialog.getByRole("alert").innerText()).includes("zaten"));
        assert.equal(
          await dialog
            .getByLabel("Sistem / Alt Sistem Adı", { exact: true })
            .inputValue(),
          firstName,
        );
        page.once("dialog", (prompt) => void prompt.accept());
        await dialog
          .getByRole("button", { name: "Kapat", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
      },
    );
    await f.check(
      "risk systems: every role selects catalog entries; normal user saves stable ID and cannot manage catalog",
      async () => {
        await normal.page.reload();
        await manager.page.reload();
        await openRisks(normal.page);
        await openRisks(manager.page);
        for (const viewer of [normal.page, manager.page])
          assert.equal(
            await viewer
              .getByRole("button", {
                name: "Sistem / Alt Sistem Ekle",
                exact: true,
              })
              .count(),
            0,
          );
        await normal.page
          .getByRole("button", { name: "Risk Ekle", exact: true })
          .click();
        const edit = normal.page.locator(".risk-editing-row");
        const systems = edit.locator('[data-risk-input="system"]');
        await systems.waitFor();
        assert.equal(await systems.locator("option").count(), 77);
        await systems.selectOption(systemId);
        await edit
          .locator('[data-risk-input="description"]')
          .fill("Synthetic selected system risk");
        await edit.locator('[data-risk-input="likelihood"]').selectOption("2");
        await edit.locator('[data-risk-input="impact"]').selectOption("3");
        await edit.locator('[data-risk-input="description"]').press("Enter");
        await edit.waitFor({ state: "hidden" });
        const risk = (await f.state()).risks.find(
          (item) => item.description === "Synthetic selected system risk",
        );
        riskId = risk.id;
        assert.equal(risk.systemId, systemId);
        assert.equal(risk.system, firstName);
        assert.equal(risk.createdBy, "employee");
        await f.capture(normal.page, "risk-system-selection");
      },
    );
    await f.check(
      "risk systems: rename propagates to linked risks and stale open risk draft cannot overwrite it",
      async () => {
        await normal.page
          .locator(`tr[data-risk-id="${riskId}"]`)
          .locator('[data-risk-column="description"] button')
          .click();
        await normal.page
          .locator('[data-risk-input="description"]')
          .fill("Synthetic stale local draft");
        await page
          .getByRole("button", {
            name: "Sistem / Alt Sistem Ekle",
            exact: true,
          })
          .click();
        await dialog
          .getByRole("button", {
            name: "Sistem / alt sistem: " + firstName,
            exact: true,
          })
          .click();
        await dialog
          .getByLabel("Sistem / Alt Sistem Adı", { exact: true })
          .fill(renamed);
        await dialog
          .getByRole("button", { name: "Değişiklikleri Kaydet", exact: true })
          .click();
        await f.wait(
          async () =>
            (await f.state()).risks.find((item) => item.id === riskId)
              ?.system === renamed,
          "risk label cascaded",
        );
        await normal.page
          .locator('[data-risk-input="description"]')
          .press("Enter");
        await normal.page.locator(".risk-inline-error").waitFor();
        assert.equal(
          await normal.page
            .locator('[data-risk-input="description"]')
            .inputValue(),
          "Synthetic stale local draft",
        );
        assert.equal(
          (await f.state()).risks.find((item) => item.id === riskId)
            .description,
          "Synthetic selected system risk",
        );
        await normal.page
          .locator('[data-risk-input="description"]')
          .press("Escape");
      },
    );
    await f.check(
      "risk systems: used definition deletion is blocked, unused deletion persists after reload",
      async () => {
        page.once("dialog", (prompt) => void prompt.accept());
        await dialog
          .getByRole("button", { name: "Tanımı Sil", exact: true })
          .click();
        await dialog.getByRole("alert").waitFor();
        assert(
          (await dialog.getByRole("alert").innerText()).includes("silinemez"),
        );
        assert(
          (await f.state()).riskSystems.some((item) => item.id === systemId),
        );
        await dialog
          .getByRole("button", { name: "Kapat", exact: true })
          .click();
        await f.store.mutate(f.actor, (data, actor) =>
          applyChanges(data, actor, [
            {
              kind: "risk",
              id: riskId,
              value: null,
              operation: "delete",
              revision: data.revisions["risk:" + riskId],
            },
          ]),
        );
        await page.reload();
        await openRisks(page);
        await page
          .getByRole("button", {
            name: "Sistem / Alt Sistem Ekle",
            exact: true,
          })
          .click();
        await dialog
          .getByRole("button", {
            name: "Sistem / alt sistem: " + renamed,
            exact: true,
          })
          .click();
        page.once("dialog", (prompt) => void prompt.accept());
        await dialog
          .getByRole("button", { name: "Tanımı Sil", exact: true })
          .click();
        await f.wait(
          async () =>
            !(await f.state()).riskSystems.some((item) => item.id === systemId),
          "unused system removed",
        );
        await page.reload();
        await openRisks(page);
        await page
          .getByRole("button", {
            name: "Sistem / Alt Sistem Ekle",
            exact: true,
          })
          .click();
        assert.equal(await dialog.locator(".directory-record").count(), 75);
      },
    );
  } finally {
    stopConfirming();
    await f.store.mutate(f.actor, (data, actor) => {
      const changes = [];
      if (riskId && data.risks.some((item) => item.id === riskId))
        changes.push({
          kind: "risk",
          id: riskId,
          value: null,
          operation: "delete",
          revision: data.revisions["risk:" + riskId],
        });
      if (systemId && data.riskSystems.some((item) => item.id === systemId))
        changes.push({
          kind: "riskSystem",
          id: systemId,
          value: null,
          operation: "delete",
          revision: data.revisions["riskSystem:" + systemId],
        });
      if (changes.length) applyChanges(data, actor, changes);
    });
    await Promise.allSettled([
      admin.context.close(),
      normal.context.close(),
      manager.context.close(),
    ]);
  }
}
