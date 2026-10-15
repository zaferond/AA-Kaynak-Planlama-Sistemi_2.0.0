import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";
import { openRisks, riskSaveConfirmation } from "./risk.mjs";

export async function checkRiskSaveConfirmation(f) {
  const ids = ["qa-risk-confirm-a", "qa-risk-confirm-b"];
  const initial = {
    projectId: "p-a",
    reportedBy: "Synthetic reporter",
    category: "Teknik",
    reportedAt: "2026-10-02",
    system: "",
    cause: "",
    actionPlan: "",
    targetAt: "",
    status: "Açık",
    owner: "",
    likelihood: 2,
    impact: 3,
    strategy: "",
    implementedAt: "",
    actionResult: "",
    residualLikelihood: null,
    residualImpact: null,
    createdBy: "root-admin",
    createdByName: "Synthetic reporter",
    createdAt: "",
    updatedAt: "",
  };
  await f.store.mutate(f.actor, (data, actor) =>
    applyChanges(
      data,
      actor,
      ids.map((id) => ({
        kind: "risk",
        id,
        revision: 0,
        value: { ...initial, id, description: id },
      })),
    ),
  );
  const { page, context } = await f.client("root-admin");
  let writes = 0,
    dialogs = 0;
  let openDialog;
  const countWrites = (request) => {
    if (request.url().endsWith("/api/changes") && request.method() === "POST")
      writes++;
  };
  const countDialogs = (dialog) => {
    dialogs++;
    openDialog = dialog;
  };
  page.on("request", countWrites);
  page.on("dialog", countDialogs);
  const editing = () => page.locator(".risk-editing-row");
  const field = (key = "description") =>
    editing().locator(`[data-risk-input="${key}"]`);
  const row = (id) => page.locator(`tr[data-risk-id="${id}"]`);
  const triggers = [
    () => field().press("Enter"),
    () => page.locator(".mast").click({ position: { x: 10, y: 10 } }),
  ];
  async function open(id = ids[0]) {
    await row(id).locator('[data-risk-column="description"]').click();
    await field().waitFor();
  }
  async function respond(action, accepted) {
    const before = writes;
    const seen = page.waitForEvent("dialog");
    const acted = action();
    const dialog = await seen;
    try {
      assert.equal(dialog.type(), "confirm");
      assert.equal(dialog.message(), riskSaveConfirmation);
      assert.equal(writes, before, "No write before approval");
    } catch (error) {
      await dialog.dismiss();
      await acted;
      throw error;
    }
    if (accepted) await dialog.accept();
    else await dialog.dismiss();
    if (openDialog === dialog) openDialog = null;
    await acted;
    // A declined save is coalesced for its original event turn. The next
    // independent user action must start after that turn, including its timer.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  try {
    await openRisks(page);
    await f.check(
      "risk confirmation: unchanged and reverted rows close without prompting or writing on Enter/outside click",
      async () => {
        const before = await f.state();
        for (const trigger of triggers) {
          for (const reverted of [false, true]) {
            await open();
            if (reverted) {
              await field().fill("Temporary edit");
              await field().fill(ids[0]);
            }
            await trigger();
            await editing().waitFor({ state: "hidden" });
          }
        }
        assert.equal(dialogs, 0);
        assert.equal(writes, 0);
        assert.deepEqual((await f.state()).risks, before.risks);
      },
    );
    await f.check(
      "risk confirmation: Enter/outside click prompt once; decline preserves draft/revision, approve writes once",
      async () => {
        for (const [index, trigger] of triggers.entries()) {
          const before = await f.state(),
            requests = writes,
            prompts = dialogs;
          await open();
          const text = "Approved synthetic change " + index;
          await field().fill(text);
          await respond(trigger, false);
          assert.equal(dialogs, prompts + 1);
          assert.equal(writes, requests);
          assert.equal(await field().inputValue(), text);
          assert.deepEqual((await f.state()).risks, before.risks);
          // Observe both promises immediately so a dialog/action failure cannot
          // leave the response wait as an unhandled rejection and hide its cause.
          const [response] = await Promise.all([
            page.waitForResponse((response) =>
              response.url().endsWith("/api/changes"),
            ),
            respond(trigger, true),
          ]);
          assert.equal(response.status(), 200);
          assert.equal(
            response.request().postDataJSON().changes[0].revision,
            before.revisions["risk:" + ids[0]],
          );
          await editing().waitFor({ state: "hidden" });
          assert.equal(writes, requests + 1);
          assert.equal(dialogs, prompts + 2);
          assert.equal(
            (await f.state()).risks.find((risk) => risk.id === ids[0])
              .description,
            text,
          );
        }
      },
    );
    await f.check(
      "risk confirmation: cancelled row/tab navigation keeps the active draft; approval switches rows after save",
      async () => {
        const before = await f.state(),
          requests = writes,
          prompts = dialogs;
        await open();
        await field().fill("Draft stays on declined navigation");
        const otherRow = () =>
          row(ids[1]).locator('[data-risk-column="description"]').click();
        await respond(otherRow, false);
        assert.equal(dialogs, prompts + 1);
        assert.equal(await editing().getAttribute("data-risk-id"), ids[0]);
        await respond(
          () =>
            page
              .getByRole("tab", {
                name: "AA Kaynak Planlama Raporları",
                exact: true,
              })
              .click(),
          false,
        );
        assert.equal(dialogs, prompts + 2);
        assert.equal(
          await page
            .getByRole("tab", { name: "AA Risk Yönetimi", exact: true })
            .getAttribute("aria-selected"),
          "true",
        );
        assert.equal(
          await field().inputValue(),
          "Draft stays on declined navigation",
        );
        assert.equal(writes, requests);
        assert.deepEqual((await f.state()).risks, before.risks);
        await respond(otherRow, true);
        await f.wait(
          async () => (await editing().getAttribute("data-risk-id")) === ids[1],
          "approved risk row switch",
        );
        assert.equal(writes, requests + 1);
        assert.equal(dialogs, prompts + 3);
        await field().press("Escape");
      },
    );
    await f.check(
      "risk confirmation: invalid new rows do not prompt; valid new risks require approval and preserve cancelled input",
      async () => {
        const before = await f.state(),
          requests = writes,
          prompts = dialogs;
        await page
          .getByRole("button", { name: "Risk Ekle", exact: true })
          .click();
        await field().waitFor();
        const id = await editing().getAttribute("data-risk-id");
        ids.push(id);
        await field().press("Enter");
        await page.locator(".risk-inline-error").waitFor();
        assert.equal(dialogs, prompts);
        assert.equal(writes, requests);
        await field().fill("New risk requiring confirmation");
        await field("likelihood").selectOption("2");
        await field("impact").selectOption("3");
        await respond(triggers[0], false);
        assert.equal(
          await field().inputValue(),
          "New risk requiring confirmation",
        );
        assert.deepEqual((await f.state()).risks, before.risks);
        assert.equal(writes, requests);
        await respond(triggers[0], true);
        await editing().waitFor({ state: "hidden" });
        assert.equal(writes, requests + 1);
        assert.equal(
          (await f.state()).risks.find((risk) => risk.id === id).description,
          "New risk requiring confirmation",
        );
      },
    );
  } catch (error) {
    await openDialog?.dismiss().catch(() => {});
    await f.capture(page, "risk-save-confirmation-failed").catch(() => {});
    throw error;
  } finally {
    page.off("request", countWrites);
    page.off("dialog", countDialogs);
    await context.close();
    const state = await f.state();
    const changes = ids
      .filter((id) => state.risks.some((risk) => risk.id === id))
      .map((id) => ({
        kind: "risk",
        id,
        operation: "delete",
        value: null,
        revision: state.revisions["risk:" + id],
      }));
    if (changes.length)
      await f.store.mutate(f.actor, (data, actor) =>
        applyChanges(data, actor, changes),
      );
  }
}
