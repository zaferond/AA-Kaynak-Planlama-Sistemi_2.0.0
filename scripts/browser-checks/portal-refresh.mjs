import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";

// Drive only the application's 15-second interval; transport deadlines and DOM timers stay native.
async function pollingClient(f) {
  const c = await f.client("root-admin");
  await c.page.addInitScript(() => {
    const interval = window.setInterval.bind(window);
    window.setInterval = (callback, delay, ...args) => {
      if (delay === 15000 && typeof callback === "function") {
        window.__qaRefreshPoll = () => callback(...args);
        return interval(() => {}, delay);
      }
      return interval(callback, delay, ...args);
    };
  });
  await c.page.reload();
  await c.page.getByRole("tab", { name: /AA Mühendislik.*Projeler/ }).click();
  await c.page.locator('[data-project-heading="p-a"]').waitFor();
  return c;
}
const changed = (page) =>
  page.evaluate(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: "kaynak-planlama-offline-v1" }),
    ),
  );
async function remoteOwner(f, owner) {
  const state = await f.state();
  await f.store.mutate(f.actor, (data, actor) =>
    applyChanges(data, actor, [
      {
        kind: "project",
        id: "p-a",
        revision: state.revisions["project:p-a"],
        value: {
          ...data.projects.find((p) => p.id === "p-a"),
          responsibleName: owner,
        },
      },
    ]),
  );
}
async function restoreProject(f, original) {
  await f.store.mutate(f.actor, (data, actor) =>
    applyChanges(data, actor, [
      {
        kind: "project",
        id: original.id,
        revision: data.revisions["project:" + original.id],
        value: original,
      },
    ]),
  );
}

export async function checkPortalRefresh(f) {
  await f.check(
    "portal refresh: a version check started before opening an editor waits for the current draft to close",
    async () => {
      const original = (await f.state()).projects.find((p) => p.id === "p-a");
      const c = await pollingClient(f),
        page = c.page;
      let release,
        started = false,
        reads = 0;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const hold = async (route) => {
        started = true;
        await gate;
        await route.fulfill({ response: await route.fetch() });
      };
      const count = (request) => {
        if (request.url().endsWith("/api/data")) reads++;
      };
      page.on("request", count);
      try {
        await page.route("**/api/version", hold, { times: 1 });
        await page.evaluate(() => window.__qaRefreshPoll());
        await f.wait(() => started, "version check held before editing");
        const heading = page.locator('[data-project-heading="p-a"]');
        await heading.locator(".project-name-copy button").click();
        const dialog = page.getByRole("dialog");
        await dialog
          .getByLabel("Proje Adı", { exact: true })
          .fill("Synthetic refresh draft");
        await dialog
          .getByRole("button", { name: "Kaydet", exact: true })
          .focus();
        await remoteOwner(f, "Synthetic deferred refresh owner");
        const response = page.waitForResponse((r) =>
          r.url().endsWith("/api/version"),
        );
        release();
        await response;
        await page.waitForTimeout(150);
        assert.equal(
          reads,
          0,
          "A late version response must use current editor state",
        );
        assert.equal(
          await dialog.getByLabel("Proje Adı", { exact: true }).inputValue(),
          "Synthetic refresh draft",
        );
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await f.wait(
          async () =>
            (await heading.innerText()).includes(
              "Synthetic deferred refresh owner",
            ),
          "deferred read after editor closes",
        );
        assert.equal(reads, 1);
        assert.equal(
          (await f.state()).projects.find((p) => p.id === "p-a").name,
          original.name,
        );
      } finally {
        release();
        page.off("request", count);
        await c.context.close();
        await restoreProject(f, original);
      }
    },
  );

  await f.check(
    "portal refresh: notification bursts share one read and one follow-up without losing a newer snapshot",
    async () => {
      const original = (await f.state()).projects.find((p) => p.id === "p-a");
      const c = await pollingClient(f),
        page = c.page;
      let release,
        captured,
        reads = 0;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const hold = async (route) => {
        captured = await route.fetch();
        await gate;
        await route.fulfill({ response: captured });
      };
      const count = (request) => {
        if (request.url().endsWith("/api/data")) reads++;
      };
      page.on("request", count);
      try {
        await page.route("**/api/data", hold, { times: 1 });
        await changed(page);
        await f.wait(() => !!captured, "old read captured");
        await remoteOwner(f, "Synthetic coalesced refresh owner");
        for (let i = 0; i < 5; i++) await changed(page);
        await page.waitForTimeout(100);
        assert.equal(
          reads,
          1,
          "Notifications must not start parallel full reads",
        );
        release();
        await f.wait(
          async () =>
            (
              await page.locator('[data-project-heading="p-a"]').innerText()
            ).includes("Synthetic coalesced refresh owner"),
          "latest snapshot after coalesced follow-up",
        );
        assert.equal(reads, 2);
      } finally {
        release();
        page.off("request", count);
        await c.context.close();
        await restoreProject(f, original);
      }
    },
  );
}
