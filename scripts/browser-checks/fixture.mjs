import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { chromium } from "playwright";
import { Store } from "../../backend/store.mjs";
import { createApp } from "../../backend/app.mjs";
import { hashPassword } from "../../backend/auth.mjs";
import { syntheticDirectory } from "../../tests/directory-fixture.mjs";
import { applyChanges } from "../../backend/operations.mjs";

export async function fixture({ mutationLimits } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-browser-checks-"));
  // Deliberately never read .env, DB_* or an application database/URL argument.
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
    },
  });
  const server = http.createServer();
  let app, browser;
  const contexts = [],
    errors = [],
    checks = [];
  const password = "Browser-check-only-347!";
  async function close() {
    await Promise.allSettled(contexts.map((context) => context.close()));
    await browser?.close();
    app?.locals.close();
    if (server.listening) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await store.close();
    await fs.rm(path.join(dir, "synthetic.sqlite"), { force: true });
  }
  try {
    await store.connect();
    const data = (await store.read()).data;
    const teamA = data.teams.find((team) => team.lead);
    const teamB = data.teams.find(
      (team) => team.lead && team.lead !== teamA.lead,
    );
    assert(teamA && teamB);
    const hashed = await hashPassword(password);
    const accounts = [
      ["root-admin", "admin", "", []],
      ["employee", "normal", "r-own", [teamA.lead]],
      ["other", "normal", "r-other", [teamB.lead]],
      ["unmapped", "normal", "", []],
      ["manager", "manager", "", [teamA.lead]],
      ["admin-edit", "admin", "", []],
    ];
    for (const [id, role, resourceId, leaders] of accounts.slice(0, 1))
      await store.bootstrapUser({
        _id: id,
        username: "qa." + id,
        name: "Browser " + id,
        role,
        resourceId,
        leaders,
        active: true,
        password: hashed,
        version: 1,
        revision: 1,
      });
    const actor = await store.findUser({ id: "root-admin" });
    const projects = ["a", "b"].map((id) => ({
      id: "p-" + id,
      name: "Browser Project " + id.toUpperCase(),
      responsibleName: "Synthetic owner",
      start: "2026-01",
      end: "2026-12",
      phases: { "2026-01": "Design" },
      phaseColors: { "2026-01": "blue" },
      milestones: [],
    }));
    const resources = [
      ["r-own", "Browser Employee", teamA],
      ["r-other", "Browser Other Employee", teamB],
    ].map(([id, name, team]) => ({
      id,
      name,
      note: "PRIVATE_HR_TEST_NOTE",
      versions: [
        {
          effective: "2026-01",
          start: "2026-01-01",
          end: "",
          team: team.id,
          lead: team.lead,
          status: "Aktif Çalışan",
          included: true,
          amount: 1,
        },
      ],
    }));
    await store.mutate(actor, (d, u) =>
      applyChanges(d, u, [
        ...projects.map((value) => ({
          kind: "project",
          id: value.id,
          value,
          revision: 0,
        })),
        ...resources.map((value) => ({
          kind: "resource",
          id: value.id,
          value,
          revision: 0,
        })),
      ]),
    );
    for (const [id, role, resourceId, leaders] of accounts.slice(1))
      await store.bootstrapUser({
        _id: id,
        username: "qa." + id,
        name: "Browser " + id,
        role,
        resourceId,
        leaders,
        active: true,
        password: hashed,
        version: 1,
        revision: 1,
      });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = "http://127.0.0.1:" + server.address().port;
    const directory = syntheticDirectory(password);
    directory.add({
      id: "f".repeat(32),
      username: "qa.new-manager",
      name: "Directory New Account",
      email: "new.manager@example.test",
    });
    app = createApp(store, { origin, mutationLimits, directory });
    server.on("request", app);
    const options = { headless: true };
    if (process.env.UI_BROWSER_EXECUTABLE)
      options.executablePath = process.env.UI_BROWSER_EXECUTABLE;
    else if (process.platform === "darwin") options.channel = "chrome";
    browser = await chromium.launch(options);
    async function client(id, { login = true } = {}) {
      const context = await browser.newContext({
        viewport: { width: 1800, height: 1050 },
        acceptDownloads: true,
      });
      contexts.push(context);
      if (login) {
        const response = await context.request.post(
          origin + "/api/auth/login",
          {
            headers: { Origin: origin, "X-Requested-With": "KaynakPortal" },
            data: { username: "qa." + id, password },
          },
        );
        assert.equal(response.status(), 200);
      }
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      await page.clock.setFixedTime(new Date("2026-10-02T09:00:00Z"));
      page.on("pageerror", (error) =>
        errors.push({ user: id, message: error.message }),
      );
      await page.goto(origin);
      if (login)
        await page
          .getByRole("tab", {
            name: "AA Mühendislik Liderliği Projeler",
            exact: true,
          })
          .waitFor();
      return { context, page, id };
    }
    async function wait(fn, label) {
      const until = Date.now() + 10000;
      while (Date.now() < until) {
        if (await fn()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw Error("Timed out: " + label);
    }
    async function check(name, fn) {
      await fn();
      checks.push(name);
      console.log("PASS " + name);
    }
    async function capture(page, name) {
      await page.screenshot({
        path: path.join(dir, name + ".png"),
        animations: "disabled",
        caret: "hide",
      });
    }
    async function report(status, cause) {
      await fs.writeFile(
        path.join(dir, "result.json"),
        JSON.stringify(
          {
            status,
            checks,
            errors,
            ...(cause ? { error: cause.message } : {}),
          },
          null,
          2,
        ),
      );
    }
    return {
      dir,
      store,
      actor,
      teamA,
      teamB,
      password,
      origin,
      client,
      wait,
      check,
      checks,
      errors,
      capture,
      report,
      close,
      state: async () => (await store.read()).data,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function selectWorkspaceTab(page, name) {
  const employee = name === "Çalışan & Yetki Tanımlama";
  const directory =
    name === "Liderlik ve Takımlar" || name === "Organizasyon Yapısı";
  if (employee || directory) {
    await page
      .getByRole("tab", {
        name: "Organizasyon & Çalışan & Yetki",
        exact: true,
      })
      .click();
    await page
      .getByRole("tab", {
        name: employee ? "Çalışan & Yetki Tanımlama" : "Organizasyon Yapısı",
        exact: true,
      })
      .click();
  } else {
    await page.getByRole("tab", { name, exact: true }).click();
  }
}

/** Reveal an offscreen record through the real scroll viewport, as a user would.
 * A locator cannot scrollIntoView until its virtual section has been mounted. */
export async function revealTableItem(container, item) {
  if (await item.count()) {
    await item.scrollIntoViewIfNeeded();
    return;
  }
  await container.evaluate((c) => {
    c.scrollTop = 0;
  });
  let edges = 0;
  for (let attempt = 0; attempt < 100; attempt++) {
    await container.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    if (await item.count()) {
      await item.scrollIntoViewIfNeeded();
      return;
    }
    const moved = await container.evaluate((c) => {
      const old = c.scrollTop;
      c.scrollTop += Math.max(100, c.clientHeight * 0.75);
      return Math.abs(c.scrollTop - old) > 1;
    });
    edges = moved ? 0 : edges + 1;
    if (edges >= 3) break;
  }
  throw Error("Record was not reachable through the table viewport");
}
