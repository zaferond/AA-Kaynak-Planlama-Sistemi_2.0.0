import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixture } from "./browser-checks/fixture.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { createDeploymentPackage } from "./deployment-package.mjs";
// Never reads .env or opens a real database. The fixture uses a temporary SQL.js
// database, synthetic accounts and a loopback HTTP server. Only verified static
// build files are served from a temporary deployment copy.
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-table-benchmark-"));
const copy = path.join(dir, "package");
await createDeploymentPackage(source, copy);
const f = await fixture();
console.log("Benchmark directory: " + dir);
try {
  const months = Array.from(
    { length: 60 },
    (_, i) =>
      `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
  );
  for (let start = 0; start < 1000; start += 100) {
    const changes = Array.from({ length: 100 }, (_, j) => {
      const i = start + j;
      return {
        kind: "project",
        id: "perf-" + i,
        revision: 0,
        value: {
          id: "perf-" + i,
          name: "Synthetic performance project " + String(i).padStart(4, "0"),
          start: "2026-01",
          end: "2030-12",
          phases: Object.fromEntries(months.map((m) => [m, "Design"])),
          phaseColors: {},
          milestones: [],
        },
      };
    });
    await f.store.mutate(f.actor, (d, u) => applyChanges(d, u, changes));
  }
  const { page, context } = await f.client("root-admin");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const results = [];
  {
    const cap = "windowed";
    await context.unroute("**/*");
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== f.origin || url.pathname.startsWith("/api/"))
        return route.continue();
      if (
        url.pathname === "/" ||
        /^\/assets\/[a-zA-Z0-9._-]+$/.test(url.pathname)
      ) {
        const file = path.join(
          copy,
          "site",
          url.pathname === "/" ? "index.html" : url.pathname.slice(1),
        );
        return route.fulfill({
          body: await fs.readFile(file),
          contentType: file.endsWith(".html")
            ? "text/html"
            : file.endsWith(".js")
              ? "application/javascript"
              : file.endsWith(".css")
                ? "text/css"
                : "image/svg+xml",
        });
      }
      return route.continue();
    });
    await page.goto(f.origin);
    await page
      .getByRole("tab", {
        name: "AA Mühendislik Liderliği Projeler",
        exact: true,
      })
      .waitFor();
    // One synthetic team keeps planned data representative and ensures all projects are reachable.
    await page.getByRole("button", { name: "Takım", exact: true }).click();
    const panel = page.locator('.pickerpanel[data-state="open"]');
    await panel
      .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
      .click();
    await panel
      .getByRole("checkbox", { name: f.teamA.name, exact: true })
      .check();
    await page.keyboard.press("Escape");
    for (const mode of [
      "project-monthly",
      "project-weekly",
      "plan-monthly",
      "plan-team-monthly",
    ]) {
      const planned = mode.startsWith("plan"),
        tab = planned
          ? "AA Planlanan Kaynak Dağılımı"
          : "AA Mühendislik Liderliği Projeler";
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await page
        .locator('.planning-filterbar input[type="month"]')
        .fill("2026-01");
      await page
        .locator(".planning-filterbar .period select")
        .selectOption("12");
      if (!planned) {
        const sw = page.getByRole("switch", {
          name: "Haftalık proje görünümü",
        });
        if (mode.endsWith("weekly")) await sw.check();
        else await sw.uncheck();
      }
      if (planned)
        await page
          .getByRole("tab", {
            name:
              mode === "plan-team-monthly"
                ? "Takım → Projeler"
                : "Proje → Takımlar",
            exact: true,
          })
          .click();
      const sel = planned
        ? '.workspace-dock > [data-slot="table-container"] > .allocation-grid'
        : ".projectmatrix";
      for (let trial = 0; trial < 3; trial++) {
        await page.getByRole("tab", { name: "Raporlar", exact: true }).click();
        await page.evaluate(() =>
          document.addEventListener(
            "mousedown",
            () => {
              window.benchmarkStart = performance.now();
            },
            { once: true, capture: true },
          ),
        );
        await page.getByRole("tab", { name: tab, exact: true }).click();
        await page.locator(sel).waitFor();
        const elapsed = await page.evaluate(async () => {
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          return performance.now() - window.benchmarkStart;
        });
        await cdp.send("HeapProfiler.collectGarbage");
        const metrics = await cdp.send("Performance.getMetrics");
        const dom = await page.locator(sel).evaluate((t) => ({
          rows: t.querySelectorAll("tbody tr").length,
          cells: t.querySelectorAll("tbody td").length,
          nodes: t.querySelectorAll("*").length,
          height: t.offsetHeight,
        }));
        const scroll = await page.locator(sel).evaluate(async (t) => {
          const c = t.parentElement;
          const times = [];
          let last = performance.now();
          for (let i = 0; i < 30; i++) {
            c.scrollTop = ((c.scrollHeight - c.clientHeight) * i) / 29;
            await new Promise(requestAnimationFrame);
            const now = performance.now();
            times.push(now - last);
            last = now;
          }
          c.scrollTop = 0;
          await new Promise(requestAnimationFrame);
          times.sort((a, b) => a - b);
          return { p95: times[28], max: times[29] };
        });
        await page.locator(sel).evaluate((t) => {
          t.parentElement.scrollTop = t.parentElement.scrollHeight;
        });
        const lastProject = (await f.state()).projects.at(-1);
        const lastId = lastProject.id;
        if (planned) {
          await page
            .locator(sel)
            .getByRole("textbox", { name: new RegExp(lastProject.name) })
            .first()
            .waitFor();
        } else {
          await page
            .locator(sel + ` tbody[data-project-group="${lastId}"]`)
            .waitFor();
        }
        await page.locator(sel).evaluate((t) => {
          t.parentElement.scrollTop = 0;
        });
        const result = {
          cap: cap,
          mode,
          trial,
          renderMs: Math.round(elapsed),
          heapMb: Math.round(
            metrics.metrics.find((m) => m.name === "JSHeapUsedSize").value /
              1048576,
          ),
          ...dom,
          scrollP95Ms: Math.round(scroll.p95),
          scrollMaxMs: Math.round(scroll.max),
        };
        results.push(result);
        console.log(JSON.stringify(result));
        await fs.writeFile(
          path.join(dir, "results.json"),
          JSON.stringify(
            {
              environment: {
                node: process.version,
                platform: process.platform,
                viewport: "1800x1050",
                projects: 1002,
                months: 12,
                details: false,
              },
              errors: f.errors,
              results,
            },
            null,
            2,
          ),
        );
      }
    }
  }
  await fs.writeFile(
    path.join(dir, "results.json"),
    JSON.stringify(
      {
        environment: {
          node: process.version,
          platform: process.platform,
          viewport: "1800x1050",
          projects: 1002,
          months: 12,
          details: false,
        },
        errors: f.errors,
        results,
      },
      null,
      2,
    ),
  );
  assert.deepEqual(
    f.errors,
    [],
    "Synthetic benchmark must not contain browser errors",
  );
  console.log("Results: " + path.join(dir, "results.json"));
} finally {
  await f.close();
}
