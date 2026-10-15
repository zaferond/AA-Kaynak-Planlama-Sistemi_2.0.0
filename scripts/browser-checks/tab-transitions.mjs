import { orderedPlanningUnits } from "../../shared/leadership-planning.ts";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { applyChanges } from "../../backend/operations.mjs";
import { selectWorkspaceTab, revealTableItem } from "./fixture.mjs";

export async function seedTransitionData(f) {
  const data = await f.state();
  const teams = data.teams.filter((team) => team.kind !== "leadership");
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(d, u, [
      ...Array.from({ length: 14 }, (_, i) => ({
        kind: "project",
        id: "qa-tab-" + i,
        revision: 0,
        value: {
          id: "qa-tab-" + i,
          name: "Synthetic tab project " + i,
          start: "2026-01",
          end: "2027-12",
          phases: {},
          milestones: [],
        },
      })),
      ...Array.from({ length: 118 }, (_, i) => {
        const team = teams[i % teams.length];
        return {
          kind: "resource",
          id: "qa-tab-r" + i,
          revision: 0,
          value: {
            id: "qa-tab-r" + i,
            name: "Synthetic tab employee " + i,
            note: "",
            versions: [
              {
                effective: "2026-01",
                start: "2026-01-01",
                end: "",
                team: team.id,
                lead: team.lead,
                status: "Aktif Çalışan",
                assignmentRole: "member",
                included: true,
                amount: 1,
              },
            ],
          },
        };
      }),
    ]),
  );
}
export async function measureTabTransitions(page, cycles = 2) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const results = [];
  const specs = [
    [
      "AA Planlanan Kaynak Dağılımı",
      ".workspace-dock > [data-slot=table-container] > .allocation-grid",
    ],
    ["AA Mühendislik Liderliği Projeler", ".projectmatrix"],
    ["AA Gerçekleşen Kaynak Dağılımı", ".person-allocation .allocation-grid"],
    ["AA Aylık Aktivite Raporu", ".activity-matrix"],
    ["AA Kritik Proje Konuları", ".project-info-report"],
    ["AA Kaynak Planlama Raporları", ".remaining-report"],
    ["Çalışan & Yetki Tanımlama", ".employee-access-table"],
    ["Organizasyon Yapısı", ".team-directory table"],
  ];
  try {
    await selectWorkspaceTab(page, "AA Mühendislik Liderliği Projeler");
    for (let cycle = 0; cycle < cycles; cycle++)
      for (const [tab, selector] of specs) {
        const requests = [];
        const onRequest = (r) => {
          if (r.url().includes("/api/"))
            requests.push(new URL(r.url()).pathname);
        };
        page.on("request", onRequest);
        await page.evaluate(() => {
          window.__tabStart = 0;
          document.addEventListener(
            "pointerdown",
            () => {
              window.__tabStart = performance.now();
            },
            { once: true, capture: true },
          );
        });
        const prior = Object.fromEntries(
          (await cdp.send("Performance.getMetrics")).metrics.map((m) => [
            m.name,
            m.value,
          ]),
        );
        try {
          await selectWorkspaceTab(page, tab);
          await page.locator(selector).first().waitFor();
          const ready = await page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() =>
                    resolve(performance.now() - window.__tabStart),
                  ),
                ),
              ),
          );
          const current = Object.fromEntries(
            (await cdp.send("Performance.getMetrics")).metrics.map((m) => [
              m.name,
              m.value,
            ]),
          );
          results.push({
            tab,
            cycle,
            readyMs: Math.round(ready),
            scriptMs: Math.round(
              (current.ScriptDuration - prior.ScriptDuration) * 1000,
            ),
            layoutMs: Math.round(
              (current.LayoutDuration - prior.LayoutDuration) * 1000,
            ),
            domCells: await page
              .locator(selector)
              .first()
              .locator("td")
              .count(),
            inputs: await page
              .locator(selector)
              .first()
              .locator("input")
              .count(),
            requests,
          });
        } finally {
          page.off("request", onRequest);
        }
      }
    return results;
  } finally {
    await cdp.detach();
  }
}
export async function checkTabTransitions(f) {
  await seedTransitionData(f);
  const before = await f.state();
  const { page, context } = await f.client("root-admin");
  try {
    await f.check(
      "tab transitions: all available tabs load; planning and actual mount a bounded window without changing records",
      async () => {
        const results = await measureTabTransitions(page);
        for (const result of results)
          if (
            [
              "AA Planlanan Kaynak Dağılımı",
              "AA Gerçekleşen Kaynak Dağılımı",
            ].includes(result.tab)
          ) {
            assert(
              result.inputs > 0 && result.inputs < 1000,
              JSON.stringify(result),
            );
            assert(
              !result.requests.includes("/api/data"),
              "switching a local tab must not reload the full snapshot",
            );
          }
        await fs.writeFile(
          f.dir + "/tab-transition-metrics.json",
          JSON.stringify(results, null, 2),
        );
        console.log(JSON.stringify({ tabTransitionMetrics: results }));
      },
    );
    assert.deepEqual(await f.state(), before);
    await f.check(
      "windowed planning: a single filtered project's final team and total remain reachable and editable",
      async () => {
        await page.goto(
          f.origin +
            "/?" +
            new URLSearchParams({
              allocation: "full",
              view: "project",
              start: "2026-01",
              count: "12",
              project: "p-a",
            }),
        );
        const table = page.locator(
          ".workspace-dock > [data-slot=table-container] > .allocation-grid",
        );
        await table.waitFor();
        assert((await table.locator("input").count()) < 700);
        const last = orderedPlanningUnits(before, before.teams).at(-1);
        const key = last.id + "|p-a|2026-01";
        const input = table.locator(`[data-plan-cell="${key}"] input`);
        await revealTableItem(table.locator(".."), input);
        assert(await input.isEnabled());
        await input.fill("0,25");
        await input.press("Enter");
        await f.wait(
          async () => (await f.state()).allocations[key] === 0.25,
          "last team saves in a virtual chunk",
        );
        assert.equal(await table.locator(".summary.s2").count(), 1);
      },
    );
    await f.check(
      "windowed actuals: failed draft stays mounted while scrolling; all rows on the current page remain reachable",
      async () => {
        await page.goto(f.origin);
        await selectWorkspaceTab(page, "AA Gerçekleşen Kaynak Dağılımı");
        const table = page.locator(".person-allocation .allocation-grid");
        const input = table
          .locator(".person-amount input:not(:disabled)")
          .first();
        const label = await input.getAttribute("aria-label");
        await page.route(
          "**/api/changes",
          (route) =>
            route.fulfill({
              status: 409,
              contentType: "application/json",
              body: JSON.stringify({
                error: "Synthetic virtual draft conflict",
              }),
            }),
          { times: 1 },
        );
        await input.fill("17");
        await input.press("Enter");
        const draft = table.getByRole("textbox", { name: label, exact: true });
        await table
          .getByRole("alert")
          .filter({ hasText: "Synthetic virtual draft conflict" })
          .waitFor();
        const oldKey = await draft
          .locator("xpath=ancestor::tbody")
          .getAttribute("data-window-key");
        await table.locator("..").evaluate((c) => {
          c.scrollTop = c.scrollHeight;
        });
        await f.wait(
          async () =>
            (await table.locator("tbody[data-window-key]").count()) > 1,
          "later actual chunks appear",
        );
        assert.equal(await draft.inputValue(), "%17");
        assert.equal(
          await table.locator(`tbody[data-window-key="${oldKey}"]`).count(),
          1,
        );
        const person = before.resources
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "tr"))[99];
        const final = table.getByRole("textbox", {
          name: person.name + " / Browser Project A / 2026-01 / %",
          exact: true,
        });
        await revealTableItem(table.locator(".."), final);
        assert(await final.isEnabled());
        assert.equal(await draft.inputValue(), "%17");
        assert.deepEqual(
          (await f.state()).actualAllocations,
          before.actualAllocations,
        );
      },
    );
  } finally {
    await context.close();
  }
}
