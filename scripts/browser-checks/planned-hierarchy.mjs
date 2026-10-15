import assert from "node:assert/strict";
import { applyLeaderChange, applyChanges } from "../../backend/operations.mjs";
import { directoryRevision } from "../../shared/directory-policy.ts";
export async function checkPlannedHierarchy(f) {
  const child = "QA Zulu Child Leadership",
    grand = "QA Alpha Grandchild Leadership";
  for (const [name, parentName] of [
    [child, f.teamA.lead],
    [grand, child],
  ])
    await f.store.mutate(f.actor, (d, u, c, g) =>
      applyLeaderChange(
        d,
        u,
        {
          action: "create",
          name,
          parentName,
          catalogRevision: directoryRevision(d),
        },
        c,
        g,
      ),
    );
  const seeded = await f.state(),
    rootId = seeded.leadershipUnits[f.teamA.lead],
    childId = seeded.leadershipUnits[child],
    grandId = seeded.leadershipUnits[grand];
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(d, u, [
      {
        kind: "resource",
        id: "direct-child",
        revision: 0,
        value: {
          id: "direct-child",
          name: "QA Direct Child Leader",
          note: "",
          versions: [
            {
              effective: "2026-01",
              team: childId,
              lead: child,
              assignmentRole: "leader",
              status: "Aktif Çalışan",
              included: true,
              amount: 1,
              start: "2026-01-01",
              end: "",
            },
          ],
        },
      },
    ]),
  );
  const { page, context } = await f.client("root-admin");
  const query = new URLSearchParams({
    allocation: "full",
    view: "project",
    start: "2026-01",
    count: "12",
    lead: f.teamA.lead,
    project: "p-a",
  });
  const rows = () => page.locator(".allocation-grid [data-planning-owner]");
  try {
    await f.check(
      "planning hierarchy: filtering parent includes child/grandchild rows in hierarchy order with own capacity",
      async () => {
        await page.goto(f.origin + "/?" + query);
        await page.locator(`[data-planning-owner="${childId}"]`).waitFor();
        const ids = await rows().evaluateAll((nodes) =>
          nodes.map((n) => n.dataset.planningOwner),
        );
        assert.deepEqual(ids.slice(0, 3), [rootId, childId, grandId]);
        assert.equal(new Set(ids).size, ids.length);
        assert(!ids.includes(seeded.leadershipUnits[f.teamB.lead]));
        assert.equal(
          await page
            .locator(`[data-planning-owner="${childId}"]`)
            .getAttribute("data-hierarchy-depth"),
          "1",
        );
        assert.equal(
          await page
            .locator(`[data-planning-owner="${grandId}"]`)
            .getAttribute("data-hierarchy-depth"),
          "2",
        );
        const labels = await page
          .locator(
            `[data-planning-owner="${childId}"] .team-row-block, [data-planning-owner="${grandId}"] .team-row-block, [data-planning-owner="${f.teamA.id}"] .team-row-block`,
          )
          .evaluateAll((nodes) =>
            nodes.map((n) => ({
              x: n.getBoundingClientRect().x,
              padding: getComputedStyle(n).paddingLeft,
              text: n.textContent,
            })),
          );
        assert.equal(labels.length, 3);
        assert(labels.every((label) => label.padding === "0px"));
        assert(labels.every((label) => Math.abs(label.x - labels[0].x) < 1));
        assert(labels.every((label) => !label.text.includes("↳")));
        assert.equal(
          await page
            .locator(
              `[data-planning-owner="${childId}"].leadership-planning-row`,
            )
            .count(),
          0,
        );
        const childNames = await page
          .locator(`[data-planning-owner="${childId}"] .team-member-badge`)
          .getAttribute("aria-label");
        assert.match(childNames, /1/);
        await f.capture(page, "planned-project-hierarchy");
      },
    );
    await f.check(
      "planning hierarchy: editing child allocation persists to child owner only",
      async () => {
        const key = childId + "|p-a|2026-01",
          cell = page.locator(`[data-plan-cell="${key}"]`);
        await cell.getByRole("textbox").fill("0.5");
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/changes") && r.request().method() === "POST",
        );
        await cell.getByRole("textbox").press("Enter");
        assert.equal((await response).status(), 200);
        const saved = await f.state();
        assert.equal(saved.allocations[key], 0.5);
        assert.equal(saved.allocations[rootId + "|p-a|2026-01"] || 0, 0);
        assert.equal(saved.allocations[grandId + "|p-a|2026-01"] || 0, 0);
      },
    );
    await f.check(
      "planning hierarchy: team view preserves grouping, flat labels and explicit child-only filters",
      async () => {
        query.set("view", "team");
        await page.goto(f.origin + "/?" + query);
        await page.locator(`[data-planning-group="${childId}"]`).waitFor();
        const ids = await page
          .locator(".allocation-grid [data-planning-group]")
          .evaluateAll((nodes) => nodes.map((n) => n.dataset.planningGroup));
        assert.deepEqual(ids.slice(0, 3), [rootId, childId, grandId]);
        const headings = await page
          .locator(".allocation-grid [data-planning-group] .team-group-label")
          .evaluateAll((nodes) =>
            nodes.slice(0, 3).map((n) => ({
              x: n.getBoundingClientRect().x,
              padding: getComputedStyle(n).paddingLeft,
            })),
          );
        assert.equal(headings.length, 3);
        assert(
          headings.every(
            (h) => h.padding === "0px" && Math.abs(h.x - headings[0].x) < 1,
          ),
        );
        await f.capture(page, "planned-team-hierarchy");
        query.set("view", "project");
        query.set("team", grandId);
        await page.goto(f.origin + "/?" + query);
        await page.locator(`[data-planning-owner="${grandId}"]`).waitFor();
        assert.equal(await rows().count(), 1);
      },
    );
  } catch (error) {
    await f.capture(page, "planned-hierarchy-failure").catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
