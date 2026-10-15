import { revealTableItem } from "./fixture.mjs";
import assert from "node:assert/strict";
import { applyLeaderChange } from "../../backend/operations.mjs";
import { directoryRevision } from "../../shared/directory-policy.ts";
export async function checkPlanningPermissions(f) {
  const child = "QA Planning Child",
    grand = "QA Planning Grand";
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
  await f.store.mutate(f.actor, (d) => {
    d.teams.push({
      id: "qa-grand-team",
      name: "QA Grand Team",
      lead: grand,
      excelCapacity: 0,
    });
    return d;
  });
  const state = await f.state();
  const owner = state.leadershipUnits[grand];
  const query = new URLSearchParams({
    allocation: "full",
    view: "project",
    start: "2026-01",
    count: "12",
    project: "p-a",
  });
  const { page, context } = await f.client("manager");
  const input = (id, month = "01") =>
    page.locator(`[data-plan-cell="${id}|p-a|2026-${month}"] input`);
  try {
    await page.goto(f.origin + "/?" + query);
    await f.check(
      "manager planning: all teams visible, descendants editable, outside team read-only",
      async () => {
        await revealTableItem(
          page.locator(".workspace-dock > [data-slot=table-container]"),
          input(owner),
        );
        assert.equal(await input(owner).isEnabled(), true);
        assert.equal(await input("qa-grand-team").isEnabled(), true);
        await revealTableItem(
          page.locator(".workspace-dock > [data-slot=table-container]"),
          input(f.teamB.id),
        );
        assert.equal(await input(f.teamB.id).isDisabled(), true);
        await revealTableItem(
          page.locator(".workspace-dock > [data-slot=table-container]"),
          input(owner),
        );
        await input(owner).fill("0,5");
        await input(owner).press("Enter");
        await f.wait(
          async () =>
            (await f.state()).allocations[owner + "|p-a|2026-01"] === 0.5,
          "descendant single-cell saved",
        );
        await f.wait(
          async () => await input(owner).isEnabled(),
          "write completed",
        );
        await revealTableItem(
          page.locator(".workspace-dock > [data-slot=table-container]"),
          input(f.teamB.id),
        );
        assert.equal(await input(f.teamB.id).isDisabled(), true);
      },
    );
    await f.check(
      "manager planning: Ctrl+Enter applies a selection within descendant grants",
      async () => {
        const cell = (m) =>
          page.locator(`[data-plan-cell="${owner}|p-a|2026-${m}"]`);
        await revealTableItem(
          page.locator(".workspace-dock > [data-slot=table-container]"),
          cell("02"),
        );
        await cell("02").click();
        await cell("03").click({ modifiers: ["Control"] });
        await f.wait(
          async () =>
            (await page.locator(".selectedcell[data-plan-cell]").count()) === 2,
          "two descendant cells selected",
        );
        await input(owner, "02").fill("0,7");
        await input(owner, "02").press("Control+Enter");
        await f.wait(async () => {
          const d = await f.state();
          return ["02", "03"].every(
            (m) => d.allocations[owner + "|p-a|2026-" + m] === 0.7,
          );
        }, "bulk descendant save");
        await revealTableItem(
          page.locator(".workspace-dock > [data-slot=table-container]"),
          input(f.teamB.id),
        );
        assert.equal(await input(f.teamB.id).isDisabled(), true);
        await f.capture(page, "manager-planning-permissions");
        await page.reload();
        await revealTableItem(
          page.locator(".workspace-dock > [data-slot=table-container]"),
          input(owner),
        );
        assert.equal(await input(owner).inputValue(), "0,5");
        await revealTableItem(
          page.locator(".workspace-dock > [data-slot=table-container]"),
          input(f.teamB.id),
        );
        assert.equal(await input(f.teamB.id).isDisabled(), true);
      },
    );
  } finally {
    await context.close();
  }
}
