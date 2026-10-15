import assert from "node:assert/strict";
import { loginUI } from "./access.mjs";
import { openRisks, acceptRiskSaveConfirmations } from "./risk.mjs";

const field = (page) =>
  page.locator('.risk-editing-row [data-risk-input="description"]');
const signalKey = "aa-session-change-v1";
export async function checkSessionConsistency(f) {
  async function client(options = {}) {
    const client = await f.client("root-admin");
    if (options.noChannel || options.noStorage) {
      await client.context.addInitScript(({ noChannel, noStorage }) => {
        if (noChannel)
          Object.defineProperty(window, "BroadcastChannel", {
            value: undefined,
          });
        if (noStorage)
          Storage.prototype.setItem = () => {
            throw new DOMException("Storage disabled", "SecurityError");
          };
      }, options);
      await client.page.reload();
      await client.page.locator(".mastuser").waitFor();
    }
    return client;
  }
  async function pair(options = {}) {
    const c = await client(options);
    const peer = await c.context.newPage();
    peer.setDefaultTimeout(10000);
    peer.on("pageerror", (error) =>
      f.errors.push({ user: "session-peer", message: error.message }),
    );
    await peer.goto(f.origin);
    await peer.locator(".mastuser").waitFor();
    return { ...c, peer };
  }
  async function draft(page, text) {
    await openRisks(page);
    await page.getByRole("button", { name: "Risk Ekle", exact: true }).click();
    await field(page).fill(text);
  }
  async function account(page, id, role) {
    await f.wait(
      async () =>
        (
          await page
            .locator(".mastuser")
            .textContent()
            .catch(() => "")
        )?.includes("qa." + id),
      "current account " + id,
    );
    assert((await page.locator(".mastuser").innerText()).includes(role));
    if (id !== "root-admin") {
      assert.equal(
        await page
          .getByRole("tab", {
            name: "Organizasyon & Çalışan & Yetki",
            exact: true,
          })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Veri Yedeği İndir", exact: true })
          .count(),
        0,
      );
    }
  }
  async function directLogin(context, id) {
    const response = await context.request.post(f.origin + "/api/auth/login", {
      headers: { Origin: f.origin, "X-Requested-With": "KaynakPortal" },
      data: { username: "qa." + id, password: f.password },
    });
    assert.equal(response.status(), 200);
    return response.json();
  }

  await f.check(
    "session: another tab's logout/login clears an open draft and mounts only the new account's scoped view",
    async () => {
      const c = await pair();
      try {
        const before = await f.state();
        let writes = 0;
        c.page.on("request", (r) => {
          if (r.url().endsWith("/api/changes")) writes++;
        });
        await draft(c.page, "B6_UNSAVED_PRIVATE_DRAFT");
        await c.peer
          .getByRole("button", { name: "Çıkış", exact: true })
          .click();
        await c.peer.getByLabel("Kullanıcı Adı", { exact: true }).waitFor();
        await c.page.getByLabel("Kullanıcı Adı", { exact: true }).waitFor();
        assert.equal(await c.page.locator(".risk-editing-row").count(), 0);
        await loginUI(c.peer, "employee", f.password);
        await account(c.page, "employee", "Normal Kullanıcı");
        assert.equal(writes, 0);
        assert.deepEqual((await f.state()).risks, before.risks);
        const signal = await c.peer.evaluate(
          (key) => JSON.parse(localStorage.getItem(key)),
          signalKey,
        );
        assert.deepEqual(Object.keys(signal).sort(), [
          "id",
          "source",
          "version",
        ]);
        const me = await c.context.request.get(f.origin + "/api/auth/me");
        const auth = await me.json();
        assert(!JSON.stringify(signal).includes(auth.csrf));
        assert(!JSON.stringify(signal).includes(auth.sessionIdentity));
        assert(!JSON.stringify(signal).includes(f.password));
        await f.capture(c.page, "session-new-account");
      } finally {
        await c.context.close();
      }
    },
  );

  await f.check(
    "session: storage events work without BroadcastChannel; notification contents cannot grant a different role",
    async () => {
      const c = await pair({ noChannel: true });
      try {
        await c.peer
          .getByRole("button", { name: "Çıkış", exact: true })
          .click();
        await c.page.getByLabel("Kullanıcı Adı", { exact: true }).waitFor();
        await loginUI(c.peer, "manager", f.password);
        await account(c.page, "manager", "Yönetici");
        const response = c.page.waitForResponse((r) =>
          r.url().endsWith("/api/auth/me"),
        );
        await c.peer.evaluate(
          (key) =>
            localStorage.setItem(
              key,
              JSON.stringify({
                version: 1,
                id: "spoofed",
                source: "other-code",
                user: { role: "admin" },
                csrf: "fake",
              }),
            ),
          signalKey,
        );
        await response;
        await account(c.page, "manager", "Yönetici");
      } finally {
        await c.context.close();
      }
    },
  );

  await f.check(
    "session: BroadcastChannel works when localStorage writes are disabled",
    async () => {
      const c = await pair({ noStorage: true });
      try {
        await c.peer
          .getByRole("button", { name: "Çıkış", exact: true })
          .click();
        await c.page.getByLabel("Kullanıcı Adı", { exact: true }).waitFor();
        await loginUI(c.peer, "employee", f.password);
        await account(c.page, "employee", "Normal Kullanıcı");
      } finally {
        await c.context.close();
      }
    },
  );

  await f.check(
    "session: version polling detects an external cookie change even with unchanged data generation and an open editor",
    async () => {
      const c = await client({ noChannel: true, noStorage: true });
      try {
        await draft(c.page, "B6_POLLING_DRAFT");
        const generation = (await f.store.read()).generation;
        const response = c.page.waitForResponse(
          (r) => r.url().endsWith("/api/version"),
          { timeout: 20000 },
        );
        const auth = await directLogin(c.context, "employee"); // no UI notification
        const version = await response;
        assert.equal(
          version.headers()["x-session-identity"],
          auth.sessionIdentity,
        );
        // The app cancels a different session's response body. Inspect the
        // generation through an independent authenticated request instead.
        const body = await (
          await c.context.request.get(f.origin + "/api/version")
        ).json();
        assert.equal(body.generation, generation);
        assert.equal(body.sessionIdentity, auth.sessionIdentity);
        await account(c.page, "employee", "Normal Kullanıcı");
        assert.equal(await c.page.locator(".risk-editing-row").count(), 0);
      } finally {
        await c.context.close();
      }
    },
  );

  await f.check(
    "session: a failed focus check preserves the draft; returning to the tab detects a changed account",
    async () => {
      const c = await f.client("root-admin");
      try {
        await draft(c.page, "B6_FOCUS_DRAFT");
        await c.page.route(
          "**/api/auth/me",
          (route) =>
            route.fulfill({
              status: 503,
              json: { error: "Synthetic focus failure" },
            }),
          { times: 1 },
        );
        const failed = c.page.waitForResponse((r) =>
          r.url().endsWith("/api/auth/me"),
        );
        await c.page.evaluate(() => window.dispatchEvent(new Event("focus")));
        assert.equal((await failed).status(), 503);
        assert.equal(await field(c.page).inputValue(), "B6_FOCUS_DRAFT");
        await directLogin(c.context, "employee");
        await c.page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await account(c.page, "employee", "Normal Kullanıcı");
        assert.equal(await c.page.locator(".risk-editing-row").count(), 0);
      } finally {
        await c.context.close();
      }
    },
  );

  await f.check(
    "session: an admin response held before another tab changes account cannot restore its old cache or permissions",
    async () => {
      const c = await pair();
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      try {
        let captured, heldRequest;
        await c.page.route(
          "**/api/data",
          async (route) => {
            heldRequest = route.request();
            captured = await route.fetch();
            await gate;
            await route.fulfill({ response: captured });
          },
          { times: 1 },
        );
        await c.page.evaluate(() =>
          window.dispatchEvent(
            new StorageEvent("storage", { key: "kaynak-planlama-offline-v1" }),
          ),
        );
        await f.wait(() => !!captured, "old admin read captured");
        assert.equal((await captured.json()).user.role, "admin");
        const cancelled = c.page.waitForEvent("requestfailed", {
          predicate: (request) => request === heldRequest,
        });
        await c.peer
          .getByRole("button", { name: "Çıkış", exact: true })
          .click();
        await c.page.getByLabel("Kullanıcı Adı", { exact: true }).waitFor();
        await loginUI(c.peer, "employee", f.password);
        await account(c.page, "employee", "Normal Kullanıcı");
        assert.ok((await cancelled).failure(), "old request must be cancelled");
        release();
        await c.page.waitForTimeout(80);
        await account(c.page, "employee", "Normal Kullanıcı");
      } finally {
        release();
        await c.context.close();
      }
    },
  );

  await f.check(
    "session: signing into the same account creates a fresh editor and refreshes its CSRF token",
    async () => {
      const c = await f.client("root-admin");
      const stopConfirming = acceptRiskSaveConfirmations(c.page);
      try {
        await draft(c.page, "B6_OLD_SAME_ACCOUNT_DRAFT");
        const auth = await directLogin(c.context, "root-admin");
        await c.page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await f.wait(
          async () => (await c.page.locator(".risk-editing-row").count()) === 0,
          "old draft discarded after session rotation",
        );
        await account(c.page, "root-admin", "Admin");
        await draft(c.page, "B6_NEW_SAME_ACCOUNT_DRAFT");
        await c.page
          .locator('.risk-editing-row [data-risk-input="likelihood"]')
          .selectOption("2");
        await c.page
          .locator('.risk-editing-row [data-risk-input="impact"]')
          .selectOption("3");
        await c.page.route(
          "**/api/changes",
          (route) =>
            route.fulfill({
              status: 503,
              headers: { "X-Session-Identity": auth.sessionIdentity },
              json: { error: "Synthetic retry" },
            }),
          { times: 1 },
        );
        const write = c.page.waitForResponse((r) =>
          r.url().endsWith("/api/changes"),
        );
        await field(c.page).press("Enter");
        const response = await write;
        assert.equal(response.request().headers()["x-csrf-token"], auth.csrf);
        await c.page.locator(".risk-inline-error").waitFor();
        assert.equal(
          await field(c.page).inputValue(),
          "B6_NEW_SAME_ACCOUNT_DRAFT",
        );
      } finally {
        stopConfirming();
        await c.context.close();
      }
    },
  );
}
