import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";

export async function checkRemainingReportTotals(f) {
  const state = await f.state();
  const surplus = state.teams.find(
    (t) =>
      t.lead &&
      t.lead === f.teamA.lead &&
      t.id !== f.teamA.id &&
      t.kind !== "leadership",
  );
  assert(surplus);
  await f.store.mutate(f.actor, (data, actor) =>
    applyChanges(data, actor, [
      ...[
        [f.teamA.id, 21],
        [f.teamB.id, 11],
      ].map(([id, value]) => ({
        kind: "allocation",
        id: `${id}|p-a|2026-01`,
        value,
        revision: 0,
      })),
      ...[
        ["2026-03", 7.7],
        ["2026-04", 7.701],
      ].map(([month, value]) => ({
        kind: "allocation",
        id: `${f.teamA.id}|p-a|${month}`,
        value,
        revision: 0,
      })),
      {
        kind: "resource",
        id: "report-surplus-person",
        revision: 0,
        value: {
          id: "report-surplus-person",
          name: "Synthetic surplus",
          note: "",
          versions: [
            {
              effective: "2026-01",
              start: "2026-01-01",
              end: "",
              team: surplus.id,
              lead: surplus.lead,
              status: "Aktif Çalışan",
              included: true,
              amount: 5,
            },
          ],
        },
      },
    ]),
  );
  const { page } = await f.client("root-admin");
  try {
    await page
      .getByRole("tab", { name: "AA Kaynak Planlama Raporları", exact: true })
      .click();
    await page
      .locator('.planning-filterbar input[type="month"]')
      .fill("2026-01");
    await page.locator(".planning-filterbar .period select").selectOption("12");
    for (const type of ["leader", "team"]) {
      const table = page.locator(`.remaining-report.${type}-report`),
        container = table.locator("..");
      await f.check(
        `reports ${type}: net total includes surplus and matches between team and leadership grouping`,
        async () => {
          assert.equal(
            await table.locator('[data-total-month="2026-01"]').innerText(),
            "-25",
          );
          assert.equal(
            await table.locator('[data-total-month="2026-02"]').innerText(),
            "7",
          );
          for (const [month, expected] of [
            ["2026-01", "over-critical"],
            ["2026-02", "within-capacity"],
            ["2026-03", "over-warning"],
            ["2026-04", "over-critical"],
          ]) {
            const cell = table.locator(`[data-total-month="${month}"]`);
            assert((await cell.getAttribute("class")).includes(expected));
          }
          const warning = await table
            .locator('[data-total-month="2026-03"]')
            .evaluate((c) => getComputedStyle(c).backgroundColor);
          const critical = await table
            .locator('[data-total-month="2026-04"]')
            .evaluate((c) => getComputedStyle(c).backgroundColor);
          assert.equal(warning, "rgb(255, 240, 214)");
          assert.equal(critical, "rgb(255, 228, 228)");
          const lines = await table.locator("tbody td").evaluateAll((cells) =>
            cells.map((c) => {
              const s = getComputedStyle(c);
              return [
                s.borderBottomStyle,
                s.borderBottomWidth,
                s.borderBottomColor,
              ];
            }),
          );
          assert(lines.length > 0);
          assert(
            lines.every(
              (line) =>
                line[0] === "solid" && Number.parseFloat(line[1]) >= 0.9,
            ),
          );
          assert.equal(new Set(lines.map((line) => line.join("|"))).size, 1);
          assert.equal(await table.locator("tfoot td").count(), 13);
          assert.equal(
            await container.evaluate((c) => getComputedStyle(c).maxHeight),
            "672px",
          );
        },
      );
      await f.check(
        `reports ${type}: total stays above horizontal scrollbar at the bottom and labels stay fixed`,
        async () => {
          // Force both native scrollbar axes to reproduce the small-window case.
          await container.evaluate((c) => {
            c.style.maxHeight = "240px";
            c.style.width = "650px";
            c.scrollTop = c.scrollHeight;
            c.scrollLeft = 450;
          });
          await container.scrollIntoViewIfNeeded();
          await f.wait(
            async () =>
              await container.evaluate(
                (c) => c.scrollTop > 0 && c.scrollLeft > 0,
              ),
            "both report scrollbars active",
          );
          const label = table.locator(".remaining-total-label");
          const geometry = await container.evaluate((c) => {
            const zoom =
              Number.parseFloat(
                getComputedStyle(document.documentElement).zoom,
              ) || 1;
            const cr = c.getBoundingClientRect(),
              row = c.querySelector("tfoot").getBoundingClientRect(),
              label = c
                .querySelector(".remaining-total-label")
                .getBoundingClientRect();
            const month = [
              ...c.querySelectorAll("tfoot [data-total-month]"),
            ].find((cell) => {
              const r = cell.getBoundingClientRect();
              return r.left > label.right && r.right < cr.right;
            });
            const mr = month.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(month.querySelector("strong"));
            const textBottom = range.getBoundingClientRect().bottom;
            const top = document.elementFromPoint(
              mr.left + mr.width / 2,
              mr.top + mr.height / 2,
            );
            return {
              rowTop: row.top,
              rowBottom: row.bottom,
              textBottom,
              contentBottom: cr.top + c.clientHeight * zoom,
              left: cr.left,
              labelLeft: label.left,
              painted: month.contains(top),
            };
          });
          assert(
            geometry.textBottom <= geometry.contentBottom - 15,
            JSON.stringify(geometry),
          );
          assert(
            Math.abs(geometry.labelLeft - geometry.left) < 2,
            JSON.stringify(geometry),
          );
          assert(geometry.painted, JSON.stringify(geometry));
          await f.capture(page, `remaining-${type}-total`);
          await container.evaluate((c) => {
            c.style.maxHeight = "";
            c.style.width = "";
            c.scrollLeft = 0;
            c.scrollTop = 0;
          });
          assert((await label.innerText()).includes("Toplam Eksik Kaynak"));
        },
      );
    }
    await f.check("reports totals follow selected team filter", async () => {
      await page.getByRole("button", { name: "Takım", exact: true }).click();
      const panel = page.locator('.pickerpanel[data-state="open"]');
      await panel
        .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
        .click();
      await panel
        .getByRole("checkbox", { name: f.teamA.name, exact: true })
        .check();
      await page.keyboard.press("Escape");
      for (const type of ["leader", "team"])
        assert.equal(
          await page
            .locator(`.${type}-report [data-total-month="2026-01"]`)
            .innerText(),
          "-20",
        );
    });
  } finally {
    await page.close();
  }
}
