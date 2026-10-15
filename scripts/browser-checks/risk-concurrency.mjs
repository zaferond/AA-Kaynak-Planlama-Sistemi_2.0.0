import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";
import { openRisks, acceptRiskSaveConfirmations } from "./risk.mjs";

const id = "concurrent-risk";
const row = (page) => page.locator(`tr[data-risk-id="${id}"]`);
const field = (page, key) =>
  page.locator(`.risk-editing-row [data-risk-input="${key}"]`);
const changed = (page) =>
  page.evaluate(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: "kaynak-planlama-offline-v1" }),
    ),
  );

export async function checkRiskConcurrency(f) {
  const actor = await f.store.findUser({ id: "admin-edit" });
  async function remote(patch, remove = false) {
    const state = await f.state(),
      current = state.risks.find((r) => r.id === id);
    await f.store.mutate(actor, (d, u) =>
      applyChanges(d, u, [
        {
          kind: "risk",
          id,
          revision: state.revisions["risk:" + id] || 0,
          value: remove ? null : { ...current, ...patch },
          ...(remove ? { operation: "delete" } : {}),
        },
      ]),
    );
  }
  const initial = {
    id,
    projectId: "p-a",
    reportedBy: "Synthetic Admin",
    category: "Teknik",
    reportedAt: "2026-10-02",
    system: "",
    description: "Original concurrency risk",
    cause: "Original cause",
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
    createdByName: "Synthetic Admin",
    createdAt: "",
    updatedAt: "",
  };
  const state = await f.state();
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(d, u, [
      {
        kind: "risk",
        id,
        value: initial,
        revision: state.revisions["risk:" + id] || 0,
      },
    ]),
  );
  const { page } = await f.client("root-admin");
  const stopConfirming = acceptRiskSaveConfirmations(page);
  await openRisks(page);
  // Start the read BEFORE opening the row. It returns a newer snapshot AFTER
  // the draft is opened; merely pausing future refreshes cannot fix this race.
  async function incoming(edit, mutate, failure = "") {
    let release,
      started = false;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const hold = async (route) => {
      started = true;
      await gate;
      if (failure)
        await route.fulfill({ status: 503, json: { error: failure } });
      else await route.fulfill({ response: await route.fetch() });
    };
    await page.route("**/api/data", hold, { times: 1 });
    try {
      await changed(page);
      await f.wait(() => started, "background read started before editing");
      await row(page).locator('[data-risk-column="description"]').click();
      await field(page, "description").waitFor();
      await edit();
      await mutate();
      const response = page.waitForResponse((r) =>
        r.url().endsWith("/api/data"),
      );
      release();
      await response;
      // Verify App has rendered the newer snapshot (summary counters change).
      await f.wait(
        async () =>
          (await page.locator(".risk-summary strong").first().textContent()) ===
          String(
            (await f.state()).risks.filter((r) => r.projectId === "p-a").length,
          ),
        "fresh snapshot rendered",
      );
      await page.waitForTimeout(60);
    } finally {
      release();
      await page.unroute("**/api/data", hold);
    }
  }
  async function conflict(action, revision) {
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/api/changes"),
    );
    await action();
    const result = await response;
    assert.equal(result.request().postDataJSON().changes[0].revision, revision);
    assert.equal(result.status(), 409);
    await page.locator(".risk-conflict-actions").waitFor();
  }
  try {
    await f.check(
      "risk: an in-flight refresh cannot rebase a changed draft; conflicts preserve both users' values and block navigation",
      async () => {
        const revision = (await f.state()).revisions["risk:" + id];
        await incoming(
          async () => {
            await field(page, "description").fill(
              "Local draft survives conflict",
            );
            await field(page, "likelihood").focus();
          },
          () => remote({ cause: "Remote cause must survive" }),
        );
        await conflict(
          () => field(page, "description").press("Enter"),
          revision,
        );
        assert.equal(
          await field(page, "description").inputValue(),
          "Local draft survives conflict",
        );
        assert.equal(await field(page, "cause").inputValue(), "Original cause");
        assert.equal(
          (await f.state()).risks.find((r) => r.id === id).cause,
          "Remote cause must survive",
        );
        assert.equal(
          (await f.state()).risks.find((r) => r.id === id).description,
          initial.description,
        );
        await page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .click();
        assert.equal(
          await page
            .getByRole("tab", { name: "AA Risk Yönetimi", exact: true })
            .getAttribute("aria-selected"),
          "true",
        );
        await f.capture(page, "risk-conflict-draft-preserved");
      },
    );
    await f.check(
      "risk: declined/failed reload keeps the draft; confirmed reload captures the latest revision and saves safely",
      async () => {
        const reload = page.getByRole("button", {
          name: "Güncel Kaydı Yükle",
          exact: true,
        });
        page.once("dialog", (d) => d.dismiss());
        await reload.click();
        assert.equal(
          await field(page, "description").inputValue(),
          "Local draft survives conflict",
        );
        await page.route(
          "**/api/data",
          (route) =>
            route.fulfill({
              status: 503,
              json: { error: "Synthetic reload failure" },
            }),
          { times: 1 },
        );
        page.once("dialog", (d) => d.accept());
        await reload.click();
        await page
          .locator(".risk-inline-error")
          .filter({ hasText: "Synthetic reload failure" })
          .waitFor();
        assert.equal(
          await field(page, "description").inputValue(),
          "Local draft survives conflict",
        );
        page.once("dialog", (d) => d.accept());
        await reload.click();
        await page
          .locator(".risk-conflict-actions")
          .waitFor({ state: "hidden" });
        assert.equal(
          await field(page, "cause").inputValue(),
          "Remote cause must survive",
        );
        const revision = (await f.state()).revisions["risk:" + id];
        await field(page, "description").fill("Safely reapplied local change");
        const response = page.waitForResponse((r) =>
          r.url().endsWith("/api/changes"),
        );
        await field(page, "description").press("Enter");
        const result = await response;
        assert.equal(result.status(), 200);
        assert.equal(
          result.request().postDataJSON().changes[0].revision,
          revision,
        );
        await field(page, "description").waitFor({ state: "hidden" });
        assert.equal(
          (await f.state()).risks.find((r) => r.id === id).cause,
          "Remote cause must survive",
        );
      },
    );
    await f.check(
      "risk: an unchanged stale draft closes without writing over a remote update",
      async () => {
        let requests = 0;
        const count = (request) => {
          if (request.url().endsWith("/api/changes")) requests++;
        };
        page.on("request", count);
        try {
          await incoming(
            async () => {},
            () => remote({ cause: "Second remote cause" }),
          );
          await field(page, "description").press("Enter");
          await field(page, "description").waitFor({ state: "hidden" });
          assert.equal(requests, 0);
          assert.equal(
            (await f.state()).risks.find((r) => r.id === id).cause,
            "Second remote cause",
          );
        } finally {
          page.off("request", count);
        }
      },
    );
    await f.check(
      "risk: delete uses the opening revision and cannot delete another user's newer edit",
      async () => {
        const revision = (await f.state()).revisions["risk:" + id];
        await incoming(
          async () => {},
          () => remote({ owner: "Remote risk owner" }),
        );
        page.once("dialog", (d) => d.accept());
        await conflict(
          () =>
            page
              .getByRole("button", { name: "Riski Sil", exact: true })
              .click(),
          revision,
        );
        assert.equal(
          (await f.state()).risks.find((r) => r.id === id).owner,
          "Remote risk owner",
        );
        await page
          .getByRole("button", { name: "Düzenlemeyi İptal Et", exact: true })
          .click();
        await field(page, "description").waitFor({ state: "hidden" });
      },
    );
    await f.check(
      "risk: open drafts defer external refresh even with select focus or blur; closing the draft resumes refresh",
      async () => {
        await row(page).locator('[data-risk-column="description"]').click();
        await field(page, "likelihood").focus();
        await remote({ cause: "Deferred refresh cause" });
        let reads = 0;
        const count = (request) => {
          if (request.url().endsWith("/api/data")) reads++;
        };
        page.on("request", count);
        try {
          await changed(page);
          await page.waitForResponse((r) => r.url().endsWith("/api/version"), {
            timeout: 25000,
          });
          assert.equal(reads, 0);
          await page.evaluate(() => document.activeElement.blur());
          await page.waitForTimeout(100);
          assert.equal(reads, 0);
          assert.equal(
            await field(page, "cause").inputValue(),
            "Second remote cause",
          );
          const response = page.waitForResponse((r) =>
            r.url().endsWith("/api/data"),
          );
          await field(page, "description").press("Escape");
          await response;
          await row(page)
            .locator('[data-risk-column="cause"]')
            .filter({ hasText: "Deferred refresh cause" })
            .waitFor();
        } finally {
          page.off("request", count);
        }
      },
    );
    await f.check(
      "risk: a background read that fails after editing starts cannot discard the draft; save can be retried",
      async () => {
        await incoming(
          async () =>
            field(page, "description").fill(
              "Draft survives background failure",
            ),
          async () => {},
          "Synthetic background read failure",
        );
        await page
          .getByRole("alert")
          .filter({ hasText: "Synthetic background read failure" })
          .waitFor();
        assert.equal(
          await field(page, "description").inputValue(),
          "Draft survives background failure",
        );
        await field(page, "description").press("Enter");
        await field(page, "description").waitFor({ state: "hidden" });
        assert.equal(
          (await f.state()).risks.find((r) => r.id === id).description,
          "Draft survives background failure",
        );
      },
    );
    await f.check(
      "risk: remote deletion preserves the visible draft and cannot recreate the deleted record",
      async () => {
        const revision = (await f.state()).revisions["risk:" + id];
        await incoming(
          async () =>
            field(page, "description").fill("Keep deleted-risk draft"),
          () => remote({}, true),
        );
        assert.equal(
          await field(page, "description").inputValue(),
          "Keep deleted-risk draft",
        );
        await conflict(
          () => field(page, "description").press("Enter"),
          revision,
        );
        assert(!(await f.state()).risks.some((r) => r.id === id));
        page.once("dialog", (d) => d.accept());
        await page
          .getByRole("button", { name: "Güncel Kaydı Yükle", exact: true })
          .click();
        await row(page).waitFor({ state: "hidden" });
        await page
          .locator(".risk-inline-error")
          .filter({ hasText: "Risk kaydı silinmiş" })
          .waitFor();
      },
    );
  } catch (error) {
    await f.capture(page, "risk-concurrency-failed");
    throw error;
  } finally {
    stopConfirming();
    await page.close();
  }
}
