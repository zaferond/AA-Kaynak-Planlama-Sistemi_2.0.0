import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { applyChanges } from "../../backend/operations.mjs";
import { REQUEST_DEADLINES } from "../../frontend/src/http-transport.ts";
import { openRisks, acceptRiskSaveConfirmations } from "./risk.mjs";

async function installFault(page, initialMode = "committed") {
  await page.evaluate(
    ({ deadline, initialMode }) => {
      const timers = new Map();
      const schedule = window.setTimeout.bind(window),
        clear = window.clearTimeout.bind(window);
      window.setTimeout = (callback, ms, ...args) => {
        const id = schedule(callback, ms, ...args);
        if (ms === deadline)
          timers.set(id, () => {
            clear(id);
            callback(...args);
          });
        return id;
      };
      window.clearTimeout = (id) => {
        timers.delete(id);
        clear(id);
      };
      window.__expireWrite = () => {
        for (const callback of [...timers.values()]) callback();
      };
      const fetch = window.fetch.bind(window);
      window.__transportMode = initialMode;
      window.__transportReady = false;
      window.__posts = 0;
      window.fetch = async (url, init) => {
        if (url !== "/api/changes" || init?.method !== "POST")
          return fetch(url, init);
        window.__posts++;
        const mode = window.__transportMode;
        window.__transportMode = "normal";
        if (mode === "not-sent") {
          window.__heldWrite = { body: init.body, headers: init.headers };
          window.__transportReady = true;
          return new Promise(() => {}); // Simulate a stalled, non-cooperative network.
        }
        const result = await fetch(url, init);
        if (mode !== "committed") return result;
        const body = await result.json(); // Confirm the real synthetic POST committed.
        window.__transportReady = true;
        return new Response(
          new ReadableStream({
            start(controller) {
              window.__finishLateBody = () => {
                controller.enqueue(
                  new TextEncoder().encode(JSON.stringify(body)),
                );
                controller.close();
              };
            },
          }),
          { status: result.status, headers: result.headers },
        );
      };
    },
    { deadline: REQUEST_DEADLINES.write, initialMode },
  );
}

// Separate synthetic fixture: never a running application, account or DB.
export async function checkTransportRecovery(report) {
  const f = await fixture();
  try {
    const risk = {
      id: "transport-risk",
      projectId: "p-a",
      reportedBy: "Synthetic",
      category: "Teknik",
      reportedAt: "2026-10-02",
      system: "",
      description: "Original transport risk",
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
      createdBy: "",
      createdByName: "",
      createdAt: "",
      updatedAt: "",
    };
    await f.store.mutate(f.actor, (d, u) =>
      applyChanges(d, u, [
        { kind: "risk", id: risk.id, value: risk, revision: 0 },
      ]),
    );
    const { page, context } = await f.client("root-admin");
    const stopConfirm = acceptRiskSaveConfirmations(page);
    await openRisks(page);
    await installFault(page);
    const field = () =>
      page.locator('.risk-editing-row [data-risk-input="description"]');
    const posts = () => page.evaluate(() => window.__posts);
    async function edit(text) {
      await page
        .locator(
          `tr[data-risk-id="${risk.id}"] [data-risk-column="description"]`,
        )
        .click();
      await field().fill(text);
      await field().press("Enter");
      await page.waitForFunction(() => window.__transportReady);
      await page.evaluate(() => window.__expireWrite());
      await page.locator(".write-recovery-notice").waitFor();
      await page
        .locator(".risk-scroll-hint")
        .filter({ hasText: "Sonuç belirsiz" })
        .waitFor();
    }
    async function inspectGlobal(target = page) {
      await target
        .getByRole("button", {
          name: "Sunucu Verilerini Kontrol Et",
          exact: true,
        })
        .click();
      await target
        .getByRole("button", { name: "Kontrol Ettim, Devam Et", exact: true })
        .waitFor();
      await target
        .getByRole("button", { name: "Kontrol Ettim, Devam Et", exact: true })
        .click();
      await target
        .locator(".write-recovery-notice")
        .waitFor({ state: "hidden" });
    }
    await report.check(
      "transport: committed POST with a stalled body preserves its risk draft and never automatically resends",
      async () => {
        await edit("Committed response lost");
        assert.equal(
          (await f.state()).risks.find((r) => r.id === risk.id).description,
          "Committed response lost",
        );
        assert.equal(await field().inputValue(), "Committed response lost");
        await field().press("Enter");
        assert.equal(await posts(), 1);
        await inspectGlobal();
        assert.equal(await field().inputValue(), "Committed response lost");
        await page
          .getByRole("button", {
            name: "Sunucu Kaydını Kontrol Et",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", { name: "Güncel Kaydı Yükle", exact: true })
          .waitFor();
        await field().press("Enter");
        assert.equal(await posts(), 1);
        await page.evaluate(() => window.__finishLateBody());
        await page.waitForTimeout(30);
        assert.equal(await field().inputValue(), "Committed response lost");
        page.once("dialog", (dialog) => dialog.accept());
        await page
          .getByRole("button", { name: "Güncel Kaydı Yükle", exact: true })
          .click();
        await page
          .locator(".risk-conflict-actions")
          .waitFor({ state: "hidden" });
        await field().press("Escape");
      },
    );
    await report.check(
      "transport: failed inspection keeps the draft and write fence; a late original commit makes an explicit old-revision retry conflict",
      async () => {
        const openingRevision = (await f.state()).revisions["risk:" + risk.id];
        const auditBefore = (await f.store.auditLog(f.actor)).total;
        await page.evaluate(() => {
          window.__transportMode = "not-sent";
          window.__transportReady = false;
        });
        await edit("Delayed original request");
        assert.equal(
          (await f.state()).revisions["risk:" + risk.id],
          openingRevision,
        );
        await page.route(
          "**/api/data",
          (route) =>
            route.fulfill({
              status: 503,
              json: { error: "Synthetic inspection failure" },
            }),
          { times: 1 },
        );
        await page
          .getByRole("button", {
            name: "Sunucu Verilerini Kontrol Et",
            exact: true,
          })
          .click();
        await page
          .locator(".write-recovery-notice")
          .filter({ hasText: "Synthetic inspection failure" })
          .waitFor();
        assert.equal(await field().inputValue(), "Delayed original request");
        assert.equal(
          await page
            .getByRole("button", {
              name: "Kontrol Ettim, Devam Et",
              exact: true,
            })
            .count(),
          0,
        );
        await inspectGlobal();
        await page
          .getByRole("button", {
            name: "Sunucu Kaydını Kontrol Et",
            exact: true,
          })
          .click();
        await page
          .locator(".risk-inline-error")
          .filter({ hasText: "açılış sürümü" })
          .waitFor();
        const held = await page.evaluate(() => window.__heldWrite);
        // Simulate server-side delivery after the earlier GET: abort/read do not
        // establish cancellation. Only CAS guarantees a single resulting commit.
        const delayed = await context.request.post(f.origin + "/api/changes", {
          headers: { ...held.headers, Origin: f.origin },
          data: JSON.parse(held.body),
        });
        assert.equal(delayed.status(), 200);
        const reply = page.waitForResponse((r) =>
          r.url().endsWith("/api/changes"),
        );
        await field().press("Enter");
        const conflict = await reply;
        assert.equal(conflict.status(), 409);
        assert.equal(
          conflict.request().postDataJSON().changes[0].revision,
          openingRevision,
        );
        assert.equal(
          (await f.state()).revisions["risk:" + risk.id],
          openingRevision + 1,
        );
        assert.equal((await f.store.auditLog(f.actor)).total, auditBefore + 1);
        assert.equal(await field().inputValue(), "Delayed original request");
        await field().press("Escape");
      },
    );
    stopConfirm();
    const planKey = `${f.teamA.id}|p-a|2026-01`;
    await f.store.mutate(f.actor, (d, u) =>
      applyChanges(d, u, [
        { kind: "allocation", id: planKey, value: 0.2, revision: 0 },
      ]),
    );
    const plan = await f.client("root-admin");
    const query = new URLSearchParams({
      allocation: "full",
      view: "project",
      start: "2026-01",
      count: "12",
      team: f.teamA.id,
      project: "p-a",
    });
    await plan.page.goto(f.origin + "/?" + query);
    const planInput = plan.page.locator(`[data-plan-cell="${planKey}"] input`);
    await planInput.waitFor();
    await installFault(plan.page, "not-sent");
    await report.check(
      "transport: planning cell retains its value and opening revision through inspection",
      async () => {
        const revision = (await f.state()).revisions["allocation:" + planKey];
        await planInput.fill("0,75");
        await planInput.press("Enter");
        await plan.page.waitForFunction(() => window.__transportReady);
        await plan.page.evaluate(() => window.__expireWrite());
        await plan.page.locator(".write-recovery-notice").waitFor();
        await f.store.mutate(f.actor, (d, u) =>
          applyChanges(d, u, [
            { kind: "allocation", id: planKey, value: 0.5, revision },
          ]),
        );
        await inspectGlobal(plan.page);
        assert.equal(await planInput.inputValue(), "0,75");
        assert.equal(await plan.page.evaluate(() => window.__posts), 1);
        const reply = plan.page.waitForResponse((r) =>
          r.url().endsWith("/api/changes"),
        );
        await planInput.press("Enter");
        const conflict = await reply;
        assert.equal(conflict.status(), 409);
        assert.equal(
          conflict.request().postDataJSON().changes[0].revision,
          revision,
        );
        assert.equal((await f.state()).allocations[planKey], 0.5);
        assert.equal(await planInput.inputValue(), "0,75");
        await planInput.press("Escape");
        assert.equal(await planInput.inputValue(), "0,5");
      },
    );
    const actualKey = "r-own|p-a|2026-01";
    await f.store.mutate(f.actor, (d, u) =>
      applyChanges(d, u, [
        { kind: "actual", id: actualKey, value: 0.1, revision: 0 },
      ]),
    );
    const actual = await f.client("employee");
    await actual.page
      .getByRole("tab", {
        name: "AA Gerçekleşen Kaynak Dağılımı",
        exact: true,
      })
      .click();
    const actualInput = actual.page.getByRole("textbox", {
      name: "Browser Employee / Browser Project A / 2026-01 / %",
      exact: true,
    });
    await actualInput.waitFor();
    await installFault(actual.page, "not-sent");
    await report.check(
      "transport: actual percent draft retains its opening revision after a remote change",
      async () => {
        const revision = (await f.state()).revisions["actual:" + actualKey];
        await actualInput.fill("25");
        await actualInput.press("Enter");
        await actual.page.waitForFunction(() => window.__transportReady);
        await actual.page.evaluate(() => window.__expireWrite());
        await actual.page.locator(".write-recovery-notice").waitFor();
        await f.store.mutate(f.actor, (d, u) =>
          applyChanges(d, u, [
            {
              kind: "actual",
              id: actualKey,
              value: { unit: "percent", value: 40 },
              revision,
            },
          ]),
        );
        await actualInput.evaluate(
          (element) => (window.__actualDraftElement = element),
        );
        await actual.page.evaluate(() => {
          const fetch = window.fetch.bind(window);
          let release;
          const hold = new Promise((resolve) => (release = resolve));
          window.__actualRefreshReady = false;
          window.fetch = async (url, init) => {
            if (String(url).startsWith("/api/actual-view?")) {
              window.__actualRefreshReady = true;
              await hold;
            }
            return fetch(url, init);
          };
          window.__releaseActualRefresh = () => {
            window.fetch = fetch;
            release();
          };
        });
        try {
          await inspectGlobal(actual.page);
          await actual.page.waitForFunction(() => window.__actualRefreshReady);
          assert.equal(await actualInput.inputValue(), "%25");
          assert(
            await actualInput.evaluate(
              (element) => element === window.__actualDraftElement,
            ),
            "same-scope refresh must not remount the draft input",
          );
          await f.wait(
            () => actualInput.isDisabled(),
            "old view is read-only during refresh",
          );
        } finally {
          await actual.page.evaluate(() => window.__releaseActualRefresh());
        }
        await f.wait(
          async () => !(await actualInput.isDisabled()),
          "actual refresh settled",
        );
        assert.equal(await actualInput.inputValue(), "%25");
        assert.equal(await actual.page.evaluate(() => window.__posts), 1);
        const reply = actual.page.waitForResponse((r) =>
          r.url().endsWith("/api/changes"),
        );
        await actualInput.press("Enter");
        const conflict = await reply;
        assert.equal(conflict.status(), 409);
        assert.equal(
          conflict.request().postDataJSON().changes[0].revision,
          revision,
        );
        assert.equal((await f.state()).actualPercentEntries[actualKey], 40);
        assert.equal(await actualInput.inputValue(), "%25");
      },
    );
    await actual.page.reload();
    await actual.page
      .getByRole("tab", {
        name: "AA Gerçekleşen Kaynak Dağılımı",
        exact: true,
      })
      .click();
    await actualInput.click();
    const hoursInput = actual.page.getByRole("textbox", {
      name: "Browser Employee / 2026-01 çalışılan saat",
      exact: true,
    });
    await hoursInput.waitFor();
    await installFault(actual.page, "not-sent");
    await report.check(
      "transport: worked-hours draft and selection survive recovery controls without rebasing",
      async () => {
        const key = "r-own|2026-01";
        const revision = (await f.state()).revisions["workedHours:" + key] || 0;
        await hoursInput.fill("180");
        await hoursInput.press("Enter");
        await actual.page.waitForFunction(() => window.__transportReady);
        await actual.page.evaluate(() => window.__expireWrite());
        await actual.page.locator(".write-recovery-notice").waitFor();
        await f.store.mutate(f.actor, (d, u) =>
          applyChanges(d, u, [
            { kind: "workedHours", id: key, value: 189, revision },
          ]),
        );
        await actual.page.route(
          "**/api/actual-view?**",
          (route) =>
            route.fulfill({
              status: 503,
              json: { error: "Synthetic actual view read failure" },
            }),
          { times: 1 },
        );
        await inspectGlobal(actual.page);
        await actual.page
          .getByRole("alert")
          .filter({ hasText: "Synthetic actual view read failure" })
          .waitFor();
        assert.equal(await hoursInput.inputValue(), "180");
        assert(await hoursInput.isDisabled());
        await actual.page
          .getByRole("button", { name: "Tekrar Dene", exact: true })
          .click();
        await f.wait(
          async () => !(await hoursInput.isDisabled()),
          "failed actual read retried without losing selected hours",
        );
        assert.equal(await hoursInput.inputValue(), "180");
        assert.equal(await actual.page.evaluate(() => window.__posts), 1);
        const reply = actual.page.waitForResponse((r) =>
          r.url().endsWith("/api/changes"),
        );
        await hoursInput.press("Enter");
        const conflict = await reply;
        assert.equal(conflict.status(), 409);
        assert.equal(
          conflict.request().postDataJSON().changes[0].revision,
          revision,
        );
        assert.equal((await f.state()).actualWorkedHours[key], 189);
        assert.equal(await hoursInput.inputValue(), "180");
      },
    );
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
}
