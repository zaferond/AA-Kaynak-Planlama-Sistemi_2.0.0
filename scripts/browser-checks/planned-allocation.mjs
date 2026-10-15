import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";

const selectedKeys = (page) =>
  page
    .locator(".selectedcell[data-plan-cell]")
    .evaluateAll((cells) => cells.map((cell) => cell.dataset.planCell));
const cell = (page, key) => page.locator(`[data-plan-cell="${key}"]`);
async function drag(page, from, to, additive = false) {
  await cell(page, from).scrollIntoViewIfNeeded();
  const first = await cell(page, from).boundingBox();
  const last = await cell(page, to).boundingBox();
  assert(first && last);
  if (additive) await page.keyboard.down("Control");
  try {
    await page.mouse.move(first.x + first.width / 2, first.y + 5);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width / 2, last.y + 5, { steps: 8 });
    await page.mouse.up();
  } finally {
    if (additive) await page.keyboard.up("Control");
  }
}

export async function checkPlannedAllocation(f) {
  const initialAllocations = { ...(await f.state()).allocations };
  const { context, page } = await f.client("root-admin");
  const key = (team, month) => `${team.id}|p-a|2026-${month}`;
  const a = (month) => key(f.teamA, month);
  const b = (month) => key(f.teamB, month);
  const query = new URLSearchParams([
    ["allocation", "full"],
    ["view", "project"],
    ["start", "2026-01"],
    ["count", "12"],
    ["team", f.teamA.id],
    ["team", f.teamB.id],
    ["project", "p-a"],
  ]);
  async function seed(values) {
    const data = await f.state();
    await f.store.mutate(f.actor, (d, u) =>
      applyChanges(
        d,
        u,
        Object.entries(values).map(([id, value]) => ({
          kind: "allocation",
          id,
          value,
          revision: data.revisions["allocation:" + id] || 0,
        })),
      ),
    );
    await page.goto(f.origin + "/?" + query);
    await cell(page, a("01")).waitFor();
  }
  async function saved(values) {
    await f.wait(async () => {
      const data = await f.state();
      return Object.entries(values).every(
        ([key, value]) => (data.allocations[key] || 0) === value,
      );
    }, "planned allocations saved");
  }
  try {
    await seed({ [a("01")]: 0, [a("02")]: 0, [a("03")]: 0, [a("05")]: 0 });
    await f.check(
      "planning: reverse drag and Ctrl selection retain cells; top-left Ctrl+Enter fills, Enter/outside/Escape clear selection",
      async () => {
        await drag(page, a("03"), a("01"));
        assert.deepEqual(await selectedKeys(page), [a("01"), a("02"), a("03")]);
        await f.wait(
          () =>
            cell(page, a("01"))
              .locator("input")
              .evaluate((el) => el === document.activeElement),
          "top-left selection focus",
        );
        await cell(page, a("05")).click({ modifiers: ["Control"] });
        assert.deepEqual(await selectedKeys(page), [
          a("01"),
          a("02"),
          a("03"),
          a("05"),
        ]);
        await cell(page, a("01")).locator("input").fill("0,75");
        await cell(page, a("01")).locator("input").press("Control+Enter");
        await saved(
          Object.fromEntries(["01", "02", "03", "05"].map((m) => [a(m), 0.75])),
        );
        await f.wait(
          async () => (await selectedKeys(page)).length === 0,
          "Ctrl+Enter clears selection",
        );
        await cell(page, a("01")).click();
        await cell(page, a("01")).locator("input").fill("0,6");
        await cell(page, a("01")).locator("input").press("Enter");
        await saved({ [a("01")]: 0.6 });
        await f.wait(
          async () => (await selectedKeys(page)).length === 0,
          "Enter clears selection",
        );
        await drag(page, a("01"), a("02"));
        await page.locator(".tablefoot").click();
        assert.deepEqual(await selectedKeys(page), []);
        await drag(page, a("01"), a("02"));
        await cell(page, a("01")).locator("input").fill("9");
        await page.keyboard.press("Escape");
        assert.deepEqual(await selectedKeys(page), []);
        assert.equal(
          await cell(page, a("01")).locator("input").inputValue(),
          "0,6",
        );
        assert.equal((await f.state()).allocations[a("01")], 0.6);
      },
    );
    await seed({
      [a("01")]: 0.25,
      [a("02")]: 0,
      [b("01")]: 0.5,
      [b("02")]: 0.75,
    });
    await f.check(
      "planning: Ctrl+C/V and context menu paste preserve rectangular team/month offsets and zero values",
      async () => {
        const expected = (first, second) => ({
          [a(first)]: 0.25,
          [a(second)]: 0,
          [b(first)]: 0.5,
          [b(second)]: 0.75,
        });
        await drag(page, a("01"), b("02"));
        assert.equal((await selectedKeys(page)).length, 4);
        await f.wait(
          () =>
            cell(page, a("01"))
              .locator("input")
              .evaluate(
                (el) =>
                  el === document.activeElement &&
                  el.dataset.gridSelectionFocus === "true",
              ),
          "copy selection focus",
        );
        await page.keyboard.press("Control+c");
        await cell(page, a("04")).click();
        await f.wait(
          () =>
            cell(page, a("04"))
              .locator("input")
              .evaluate(
                (el) =>
                  el === document.activeElement &&
                  el.dataset.gridSelectionFocus === "true",
              ),
          "paste selection focus",
        );
        await page.keyboard.press("Control+v");
        await saved(expected("04", "05"));
        await f.wait(
          async () => (await selectedKeys(page)).length === 4,
          "paste target selection",
        );
        await drag(page, a("01"), b("02"));
        await cell(page, b("02")).click({ button: "right" });
        await page
          .getByRole("menuitem", { name: "Değerleri Kopyala", exact: true })
          .click();
        await drag(page, a("06"), b("07"));
        await cell(page, b("07")).click({ button: "right" });
        await page
          .getByRole("menuitem", { name: /Değerleri Yapıştır/ })
          .click();
        await saved(expected("06", "07"));
        assert.equal((await f.state()).allocations[a("01")], 0.25);
        await f.capture(page, "planned-copy-paste");
      },
    );
    await f.check(
      "planning: failed bulk save keeps the draft and selected range; one pending retry saves the original cells only",
      async () => {
        let fail = true,
          requests = 0,
          release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const handler = async (route) => {
          requests++;
          if (fail) {
            fail = false;
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Synthetic planned save failure" }),
            });
          } else {
            await gate;
            await route.continue();
          }
        };
        await page.route("**/api/changes", handler);
        try {
          await drag(page, a("08"), a("09"));
          const input = cell(page, a("08")).locator("input");
          await input.fill("1,25");
          await input.press("Control+Enter");
          await cell(page, a("08"))
            .getByRole("alert")
            .filter({ hasText: "Synthetic planned save failure" })
            .waitFor();
          assert.equal(await input.inputValue(), "1,25");
          assert.deepEqual(await selectedKeys(page), [a("08"), a("09")]);
          assert.equal((await f.state()).allocations[a("08")] || 0, 0);
          await input.press("Control+Enter");
          await f.wait(
            () => Promise.resolve(requests === 2),
            "one pending retry",
          );
          assert(await input.isDisabled());
          assert(await cell(page, a("10")).locator("input").isDisabled());
          release();
          await saved({ [a("08")]: 1.25, [a("09")]: 1.25 });
          await f.wait(
            async () => (await selectedKeys(page)).length === 0,
            "retry selection completion",
          );
          assert.equal(requests, 2);
          assert.equal((await f.state()).allocations[a("10")] || 0, 0);
          await f.capture(page, "planned-save-retry");
        } finally {
          release();
          await page.unroute("**/api/changes", handler);
        }
      },
    );
  } catch (error) {
    await f.capture(page, "planned-allocation-failed").catch(() => {});
    throw error;
  } finally {
    await context.close();
    // Restore only this check's synthetic planning keys, preserving other suites.
    const data = await f.state();
    const ids = Object.keys(data.allocations).filter(
      (id) =>
        id.includes("|p-a|2026-") &&
        (id.startsWith(f.teamA.id + "|") || id.startsWith(f.teamB.id + "|")),
    );
    if (ids.length)
      await f.store.mutate(f.actor, (d, u) =>
        applyChanges(
          d,
          u,
          ids.map((id) => ({
            kind: "allocation",
            id,
            value: initialAllocations[id] || 0,
            revision: data.revisions["allocation:" + id] || 0,
          })),
        ),
      );
  }
}
