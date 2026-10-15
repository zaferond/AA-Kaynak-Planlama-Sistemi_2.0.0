import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";
import { buildCapacityIndex } from "../../shared/metrics.ts";
import { fmt } from "../../frontend/src/format.ts";

async function choose(page, label, names) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const panel = page.locator('.pickerpanel[data-state="open"]');
  await panel
    .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
    .click();
  for (const name of names)
    await panel.getByRole("checkbox", { name, exact: true }).check();
  await page.keyboard.press("Escape");
}
const selectedCells = (page) => page.locator(".selectedcell[data-plan-cell]");
const startInput = (page) =>
  page.locator('.planning-filterbar input[type="month"]');
const periodInput = (page) =>
  page.locator(".planning-filterbar .period select");

async function assertScrollPair(f, page, tables) {
  const containers = tables.map((table) => table.locator(".."));
  const widths = await Promise.all(
    containers.map((container) =>
      container.evaluate((el) => {
        const old = el.style.width;
        el.style.width = "650px";
        return old;
      }),
    ),
  );
  try {
    for (const [from, to, offset] of [
      [0, 1, 180],
      [1, 0, 360],
    ]) {
      await containers[from].evaluate((el, value) => {
        el.scrollLeft = value;
      }, offset);
      await f.wait(async () => {
        const source = await containers[from].evaluate((el) => el.scrollLeft);
        const target = await containers[to].evaluate((el) => el.scrollLeft);
        return source > 0 && Math.abs(source - target) < 1;
      }, "bidirectional table scroll");
    }
  } finally {
    for (let i = 0; i < containers.length; i++)
      await containers[i].evaluate((el, width) => {
        el.style.width = width;
        el.scrollLeft = 0;
      }, widths[i]);
  }
}

export async function checkWorkspaceFilters(f) {
  const initial = await f.state();
  const values = {
    [f.teamA.id + "|p-a|2026-01"]: 0.25,
    [f.teamA.id + "|p-b|2026-01"]: 0.5,
    [f.teamB.id + "|p-a|2026-01"]: 0.75,
  };
  async function write(values) {
    const snapshot = await f.state();
    await f.store.mutate(f.actor, (data, user) =>
      applyChanges(
        data,
        user,
        Object.entries(values).map(([id, value]) => ({
          kind: "allocation",
          id,
          value,
          revision: snapshot.revisions["allocation:" + id] || 0,
        })),
      ),
    );
  }
  await write(values);
  const { context, page } = await f.client("root-admin");
  const query = (entries = []) =>
    new URLSearchParams([
      ["allocation", "full"],
      ["view", "project"],
      ["start", "2026-01"],
      ["count", "12"],
      ["team", f.teamA.id],
      ["project", "p-a"],
      ...entries,
    ]);
  const summaryValue = (kind) =>
    page
      .locator(".capacitystrip .summary.s" + kind + " td")
      .nth(1)
      .textContent();
  try {
    await f.check(
      "workspace: full-plan URL filters initialize; period/view changes clear selection and reset restores the current year",
      async () => {
        const params = query();
        params.set("view", "team");
        params.set("start", "2026-03");
        params.set("count", "24");
        params.set("density", "compact");
        params.append("lead", f.teamA.lead);
        params.append("team", f.teamB.id);
        await page.goto(f.origin + "/?" + params);
        const cell = page.locator(
          '[data-plan-cell="' + f.teamA.id + '|p-a|2026-03"]',
        );
        await cell.waitFor();
        assert.equal(await startInput(page).inputValue(), "2026-03");
        assert.equal(await periodInput(page).inputValue(), "24");
        assert.equal(
          await page
            .getByLabel("Takvim yoğunluğu", { exact: true })
            .inputValue(),
          "compact",
        );
        assert.equal(
          await page.locator('[data-plan-cell^="' + f.teamB.id + '|"]').count(),
          0,
        );
        await cell.click();
        assert.equal(await selectedCells(page).count(), 1);
        await periodInput(page).selectOption("12");
        await f.wait(
          async () => (await selectedCells(page).count()) === 0,
          "period clears selection",
        );
        await cell.click();
        await page
          .getByRole("tab", { name: "Proje → Takımlar", exact: true })
          .click();
        await f.wait(
          async () => (await selectedCells(page).count()) === 0,
          "view clears selection",
        );
        await page
          .getByRole("button", { name: "Filtreleri Sıfırla", exact: true })
          .click();
        await f.wait(
          () =>
            Promise.resolve(
              new URL(page.url()).searchParams.get("start") === "2026-01",
            ),
          "reset URL",
        );
        assert.equal(await startInput(page).inputValue(), "2026-01");
        assert.equal(await periodInput(page).inputValue(), "12");
        assert.equal(
          await page
            .getByLabel("Takvim yoğunluğu", { exact: true })
            .inputValue(),
          "detail",
        );
        const reset = new URL(page.url()).searchParams;
        for (const key of ["lead", "team", "project"])
          assert.deepEqual(reset.getAll(key), []);
        assert.equal(reset.get("view"), "project");
        await page.reload();
        await page.locator(".project-team-view").waitFor();
        assert.equal(await startInput(page).inputValue(), "2026-01");
        assert.equal(
          await page.locator("[data-project-heading]").count(),
          initial.projects.length,
        );
      },
    );
    await f.check(
      "workspace: selected-project summary changes while active capacity and all-project reports remain intact",
      async () => {
        await page.goto(f.origin + "/?" + query());
        await page.locator(".project-team-view").waitFor();
        const data = await f.state();
        const metric = buildCapacityIndex(data, ["2026-01"])[
          f.teamA.id + "|2026-01"
        ];
        assert.equal(await summaryValue(0), fmt(metric.current));
        assert.equal(await summaryValue(2), fmt(0.25));
        assert.equal(await summaryValue(3), fmt(metric.current - 0.25));
        await choose(page, "Proje", ["Browser Project B"]);
        assert.equal(await summaryValue(0), fmt(metric.current));
        assert.equal(await summaryValue(2), fmt(0.5));
        assert.equal(await summaryValue(3), fmt(metric.current - 0.5));
        assert.equal(
          await page
            .locator("[data-project-heading]")
            .getAttribute("data-project-heading"),
          "p-b",
        );
        await page
          .getByRole("tab", { name: "Takım → Projeler", exact: true })
          .click();
        assert.equal(
          await page
            .locator("table.planning-grid")
            .filter({ has: page.getByText("Takım / Proje", { exact: true }) })
            .locator(
              '[data-team-capacity-month="2026-01"] [data-team-capacity-kind="1"]',
            )
            .textContent(),
          fmt(metric.total),
        );
        assert.equal(await summaryValue(2), fmt(0.5));
        await page.goto(f.origin);
        await page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .click();
        await choose(page, "Liderlik", [f.teamA.lead]);
        await choose(page, "Takım", [f.teamA.name]);
        const reports = page.locator(".remaining-report");
        assert.equal(await reports.count(), 2);
        for (const table of await reports.all()) {
          const month = table.locator("tbody tr").first().locator("td").nth(2);
          assert.equal(
            (await month.textContent()).trim(),
            fmt(metric.current - metric.total),
          );
        }
      },
    );
    await f.check(
      "workspace: scroll pairs attach on direct full-plan load and reattach after summary, tab and period changes",
      async () => {
        await page.goto(f.origin + "/?" + query());
        await page.locator(".project-team-view").waitFor();
        const pair = () => [
          page.locator(".project-team-view"),
          page.locator(".capacitystrip table"),
        ];
        await assertScrollPair(f, page, pair());
        await page.locator(".capacitystrip summary").click();
        await page
          .locator(".capacitystrip table")
          .waitFor({ state: "detached" });
        await page.locator(".capacitystrip summary").click();
        await page.locator(".capacitystrip table").waitFor();
        await assertScrollPair(f, page, pair());
        await periodInput(page).selectOption("24");
        await assertScrollPair(f, page, pair());
        await page.goto(f.origin);
        await page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .click();
        await assertScrollPair(
          f,
          page,
          await page.locator(".remaining-report").all(),
        );
        await page
          .getByRole("tab", {
            name: "AA Mühendislik Liderliği Projeler",
            exact: true,
          })
          .click();
        await page
          .getByRole("switch", { name: "Haftalık proje görünümü", exact: true })
          .check();
        await page
          .getByRole("button", { name: "Filtreleri Sıfırla", exact: true })
          .click();
        assert(
          !(await page
            .getByRole("switch", {
              name: "Haftalık proje görünümü",
              exact: true,
            })
            .isChecked()),
        );
        await page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .click();
        await assertScrollPair(
          f,
          page,
          await page.locator(".remaining-report").all(),
        );
        await page
          .getByLabel("Varsayılan Sekme", { exact: true })
          .selectOption("overview");
        await page.reload();
        await page.locator(".remaining-report").first().waitFor();
        await assertScrollPair(
          f,
          page,
          await page.locator(".remaining-report").all(),
        );
        await f.capture(page, "workspace-synchronized-reports");
      },
    );
  } catch (error) {
    await f.capture(page, "workspace-filters-failed");
    throw error;
  } finally {
    await context.close();
    await write(
      Object.fromEntries(
        Object.keys(values).map((key) => [key, initial.allocations[key] || 0]),
      ),
    );
  }
}
