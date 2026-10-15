import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";

async function checkFreeze(page, tableSelector, capture) {
  const table = page.locator(tableSelector);
  const container = table.locator("..");
  assert((await table.locator("tbody[data-project-group]").count()) >= 2);
  const geometry = async () =>
    table.evaluate((table) => {
      const c = table.parentElement,
        cr = c.getBoundingClientRect();
      const headerBottom = Math.max(
        ...[...table.querySelectorAll("thead th")].map(
          (cell) => cell.getBoundingClientRect().bottom,
        ),
      );
      const rows = [...table.querySelectorAll("[data-project-heading]")].map(
        (r) => {
          const rect = r.getBoundingClientRect();
          return {
            id: r.dataset.projectHeading,
            top: rect.top,
            bottom: rect.bottom,
            labelLeft: r.cells[0].getBoundingClientRect().left,
          };
        },
      );
      return { headerBottom, left: cr.left, rows };
    });
  await table.evaluate((table) => {
    const c = table.parentElement,
      first = table.querySelector("tbody[data-project-group]");
    const zoom =
      Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    c.scrollTop +=
      (first.getBoundingClientRect().top - c.getBoundingClientRect().top) /
        zoom +
      120;
  });
  await page.waitForTimeout(60);
  let g = await geometry();
  assert(Math.abs(g.rows[0].top - g.headerBottom) < 2, JSON.stringify(g));
  const firstId = g.rows[0].id;
  let nextId;
  for (let attempt = 0; attempt < 30; attempt++) {
    nextId = (await geometry()).rows.find((row) => row.id !== firstId)?.id;
    if (nextId) break;
    await container.evaluate((c) => {
      c.scrollTop += 300;
    });
    await page.waitForTimeout(50);
  }
  assert(
    nextId,
    "Next project becomes mounted while scrolling through virtual chunks",
  );
  await table.evaluate((table, nextId) => {
    const c = table.parentElement,
      next = [...table.querySelectorAll("[data-project-heading]")].find(
        (row) => row.dataset.projectHeading === nextId,
      );
    const zoom =
      Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    c.scrollTop +=
      (next.getBoundingClientRect().top -
        Math.max(
          ...[...table.querySelectorAll("thead th")].map(
            (cell) => cell.getBoundingClientRect().bottom,
          ),
        )) /
        zoom +
      5;
  }, nextId);
  await page.waitForTimeout(60);
  g = await geometry();
  const nextRow = g.rows.find((row) => row.id === nextId);
  const previousRow = g.rows.find((row) => row.id === firstId);
  assert(Math.abs(nextRow.top - g.headerBottom) < 2, JSON.stringify(g));
  assert(
    !previousRow || previousRow.bottom <= nextRow.top + 2,
    "Previous project must leave its group's sticky area: " + JSON.stringify(g),
  );
  const oldWidth = await container.evaluate((c) => {
    const old = c.style.width;
    c.style.width = "650px";
    return old;
  });
  await container.evaluate((c) => {
    c.scrollLeft = 400;
  });
  await page.waitForTimeout(60);
  assert(
    (await container.evaluate((c) => c.scrollLeft)) > 0,
    "The horizontal freeze check must actually scroll",
  );
  g = await geometry();
  assert(
    Math.abs(g.rows.find((row) => row.id === nextId).labelLeft - g.left) < 2,
    JSON.stringify(g),
  );
  await container.evaluate((c, width) => {
    c.style.width = width;
  }, oldWidth);
  await page.waitForTimeout(60);
  await capture();
  await container.evaluate((c) => {
    c.scrollLeft = 0;
    c.scrollTop = 0;
  });
}

export async function checkProjectTables(f) {
  const state = await f.state();
  const projects = state.projects.slice(0, 2);
  assert.equal(projects.length, 2);
  const resources = Array.from({ length: 12 }, (_, i) => ({
    id: "table-person-" + i,
    name: "Table Person " + i,
    note: "",
    versions: [
      {
        effective: "2026-01",
        start: "2026-01-01",
        end: "",
        team: f.teamA.id,
        lead: f.teamA.lead,
        status: "Aktif Çalışan",
        included: true,
        amount: 1,
      },
    ],
  }));
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(d, u, [
      ...projects.map((p) => ({
        kind: "project",
        id: p.id,
        revision: state.revisions["project:" + p.id] || 0,
        value: {
          ...p,
          milestones: Array.from({ length: 28 }, (_, i) => ({
            id: "heading-" + i,
            name: "Heading " + i,
            start: "2026-02-01",
            end: "2026-02-02",
            hasCriticalTopics: false,
            barStyle: "outline",
          })),
        },
      })),
      ...resources.map((value) => ({
        kind: "resource",
        id: value.id,
        value,
        revision: 0,
      })),
    ]),
  );
  const { page } = await f.client("root-admin");
  try {
    await page
      .getByRole("tab", {
        name: "AA Mühendislik Liderliği Projeler",
        exact: true,
      })
      .click();
    await page
      .getByRole("switch", { name: "Detayları Göster", exact: true })
      .check();
    await f.check(
      "projects: each frozen project heading stays below calendar headers and is replaced by the next project",
      async () => {
        await checkFreeze(page, ".projectmatrix", () =>
          f.capture(page, "projects-freeze"),
        );
      },
    );
    await f.check(
      "planning: project headings replace each other while labels remain fixed horizontally",
      async () => {
        await page
          .getByRole("tab", {
            name: "AA Planlanan Kaynak Dağılımı",
            exact: true,
          })
          .click();
        await checkFreeze(page, ".project-team-view", () =>
          f.capture(page, "planning-project-freeze"),
        );
      },
    );
    await f.check(
      "actual: project headings replace each other while labels remain fixed horizontally",
      async () => {
        await page
          .getByRole("tab", {
            name: "AA Gerçekleşen Kaynak Dağılımı",
            exact: true,
          })
          .click();
        await checkFreeze(page, ".person-allocation .allocation-grid", () =>
          f.capture(page, "actual-project-freeze"),
        );
      },
    );
    await f.check(
      "projects: pointer reorder saves, preserves phases/notes/allocations and survives reload; Alt+arrow also reorders",
      async () => {
        await page
          .getByRole("tab", {
            name: "AA Mühendislik Liderliği Projeler",
            exact: true,
          })
          .click();
        const before = await f.state();
        const [first, second] = before.projects;
        await page
          .locator(
            `[data-project-heading="${second.id}"] .project-reorder-handle`,
          )
          .dragTo(page.locator(`[data-project-heading="${first.id}"]`), {
            targetPosition: { x: 80, y: 5 },
          });
        await f.wait(
          async () => (await f.state()).projects[0].id === second.id,
          "project drag saved",
        );
        const after = await f.state();
        for (const p of before.projects) {
          const saved = after.projects.find((q) => q.id === p.id);
          const { sortOrder, ...old } = p;
          const { sortOrder: nextSort, ...updated } = saved;
          assert.deepEqual(updated, old);
        }
        assert.deepEqual(after.allocations, before.allocations);
        assert.deepEqual(after.actualAllocations, before.actualAllocations);
        await page.reload();
        await page
          .getByRole("tab", {
            name: "AA Mühendislik Liderliği Projeler",
            exact: true,
          })
          .click();
        assert.deepEqual(
          await page
            .locator(".projectmatrix [data-project-heading]")
            .evaluateAll((rows) => rows.map((r) => r.dataset.projectHeading)),
          after.projects.map((p) => p.id),
        );
        await page
          .locator(
            `[data-project-heading="${second.id}"] .project-reorder-handle`,
          )
          .press("Alt+ArrowDown");
        await f.wait(
          async () => (await f.state()).projects[0].id === first.id,
          "keyboard project order saved",
        );
        await f.wait(
          async () =>
            (await page
              .locator(".project-reorder-handle")
              .first()
              .isEnabled()) &&
            (await page
              .locator(".projectmatrix [data-project-heading]")
              .first()
              .getAttribute("data-project-heading")) === first.id,
          "keyboard save response applied and controls re-enabled",
        );
      },
    );
    await f.check(
      "projects: rejected reorder keeps the stored and visible project order",
      async () => {
        const before = (await f.state()).projects.map((p) => p.id);
        await page.route("**/api/changes", (route) =>
          route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({ error: "Synthetic project order conflict" }),
          }),
        );
        await page
          .locator(
            `[data-project-heading="${before[0]}"] .project-reorder-handle`,
          )
          .press("Alt+ArrowDown");
        await page
          .getByRole("alert")
          .filter({ hasText: "Synthetic project order conflict" })
          .waitFor();
        assert.deepEqual(
          (await f.state()).projects.map((p) => p.id),
          before,
        );
        assert.deepEqual(
          await page
            .locator(".projectmatrix [data-project-heading]")
            .evaluateAll((rows) => rows.map((r) => r.dataset.projectHeading)),
          before,
        );
        await page.unroute("**/api/changes");
      },
    );
  } catch (error) {
    await f.capture(page, "project-tables-failed");
    throw error;
  } finally {
    await page.close();
  }
}
