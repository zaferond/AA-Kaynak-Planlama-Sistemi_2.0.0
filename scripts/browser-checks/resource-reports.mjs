import { selectWorkspaceTab } from "./fixture.mjs";
import assert from "node:assert/strict";
import path from "node:path";
import { applyChanges } from "../../backend/operations.mjs";

export async function checkResourceReports(f) {
  const team = {
    ...f.teamA,
    id: "qa-report-team",
    name: "Synthetic Report Team",
  };
  const noCapacity = {
    ...f.teamA,
    id: "qa-report-empty-team",
    name: "Synthetic Zero Capacity",
  };
  const base = {
    effective: "2026-01",
    team: team.id,
    lead: team.lead,
    status: "Aktif Çalışan",
    included: true,
    start: "2026-01-01",
    end: "",
    amount: 1,
  };
  await f.store.mutate(f.actor, (data, actor) =>
    applyChanges(data, actor, [
      { kind: "team", id: team.id, value: team, revision: 0 },
      { kind: "team", id: noCapacity.id, value: noCapacity, revision: 0 },
      {
        kind: "resource",
        id: "qa-report-worker",
        revision: 0,
        value: {
          id: "qa-report-worker",
          name: "Synthetic Report Worker",
          note: "",
          versions: [base],
        },
      },
      {
        kind: "resource",
        id: "qa-report-posting",
        revision: 0,
        value: {
          id: "qa-report-posting",
          name: "Synthetic Report Posting",
          note: "",
          versions: [
            { ...base, status: "Aktif İlan", start: "2026-11-01", amount: 2 },
          ],
        },
      },
      ...["2026-11", "2026-12"].map((month) => ({
        kind: "allocation",
        id: team.id + "|p-a|" + month,
        value: 5,
        revision: 0,
      })),
      {
        kind: "allocation",
        id: noCapacity.id + "|p-a|2026-11",
        value: 3,
        revision: 0,
      },
      ...Array.from({ length: 12 }, (_, i) => ({
        kind: "project",
        id: "qa-resource-project-" + i,
        revision: 0,
        value: {
          id: "qa-resource-project-" + i,
          name: "Synthetic Resource Project " + i,
          start: "2026-01",
          end: "2026-12",
          phases: {},
          milestones: [],
        },
      })),
      ...Array.from({ length: 12 }, (_, i) => ({
        kind: "allocation",
        id: team.id + "|qa-resource-project-" + i + "|2026-10",
        value: (i + 1) / 100,
        revision: 0,
      })),
      ...[
        { id: "p-a", value: 0.5 },
        { id: "p-b", value: 0.25 },
        ...Array.from({ length: 12 }, (_, i) => ({
          id: "qa-resource-project-" + i,
          value: (12 - i) / 1000,
        })),
      ].map(({ id, value }) => ({
        kind: "actual",
        id: "qa-report-worker|" + id + "|2026-10",
        value,
        revision: 0,
      })),
      {
        kind: "personDay",
        id: "qa-report-worker|2026-11-02|leave",
        revision: 0,
        value: { type: "leave", hours: 4, label: "Synthetic report leave" },
      },
    ]),
  );
  const before = await f.state();
  const { page, context } = await f.client("root-admin");
  async function choose(names) {
    await page.getByRole("button", { name: "Takım", exact: true }).click();
    const panel = page.locator('.pickerpanel[data-state="open"]');
    await panel
      .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
      .click();
    for (const name of names)
      await panel.getByRole("checkbox", { name, exact: true }).check();
    await page.keyboard.press("Escape");
  }
  try {
    await page
      .getByRole("tab", { name: "AA Kaynak Planlama Raporları", exact: true })
      .click();
    await page
      .locator('.planning-filterbar input[type="month"]')
      .fill("2026-10");
    await page.locator(".planning-filterbar .period select").selectOption("6");
    await choose([team.name]);
    await f.check(
      "resource reports: applied filter summary and vacancy option stay above reports while filter inputs scroll away",
      async () => {
        const summary = page.getByRole("region", {
          name: "Raporlarda uygulanan filtreler",
          exact: true,
        });
        const dock = page.locator(".reports-filter-dock");
        const controls = page.getByRole("group", {
          name: "Planlama filtreleri",
          exact: true,
        });
        assert.equal(await dock.locator(".planning-filterbar").count(), 0);
        assert.equal(
          await summary.locator(".capacitystrip-copy > strong").innerText(),
          "Uygulanan Filtreler",
        );
        const chips = () =>
          summary.locator(".capacity-filter-chip").allTextContents();
        const text = await chips();
        assert(
          text.some(
            (value) => value.includes("Takım") && value.includes(team.name),
          ),
        );
        assert(
          text.some(
            (value) =>
              value.includes("Başlangıç Ayı") && value.includes("Eki 2026"),
          ),
        );
        assert(
          text.some(
            (value) =>
              value.includes("Bitiş Ayı") && value.includes("Mar 2027"),
          ),
        );
        assert(
          text.some(
            (value) => value.includes("Dönem") && value.includes("6 ay"),
          ),
        );
        assert(!text.some((value) => value.startsWith("Proje")));
        await choose([noCapacity.name]);
        assert((await summary.innerText()).includes(noCapacity.name));
        await choose([team.name]);
        for (const size of [
          { width: 1800, height: 1050 },
          { width: 900, height: 900 },
        ]) {
          await page.setViewportSize(size);
          for (const position of [800, 1900, 3000]) {
            await f.wait(async () => {
              await page.evaluate(
                (top) => window.scrollTo({ top, behavior: "instant" }),
                position,
              );
              return Math.abs((await dock.boundingBox()).y) <= 2;
            }, "report summary sticks to viewport top");
            const filterRect = await controls.boundingBox();
            const summaryRect = await summary.boundingBox();
            assert(filterRect.y + filterRect.height <= 2);
            assert(Math.abs(summaryRect.y) <= 2);
            for (const region of [
              summary,
              dock.locator(".report-posting-options"),
            ])
              assert(
                await region.evaluate((el) => {
                  const rect = el.getBoundingClientRect();
                  const hit = document.elementFromPoint(
                    rect.left + rect.width / 2,
                    rect.top + rect.height / 2,
                  );
                  return el === hit || el.contains(hit);
                }),
                "sticky summary and vacancy option paint above report content",
              );
          }
        }
        await f.capture(page, "reports-sticky-filter-summary");
        await choose([noCapacity.name]);
        assert((await summary.innerText()).includes(noCapacity.name));
        await choose([team.name]);
        await page.setViewportSize({ width: 1800, height: 1050 });
        await page.evaluate(() => window.scrollTo(0, 0));
        assert.deepEqual(await f.state(), before);
      },
    );
    await f.check(
      "resource reports: actual/planned monthly values, scope and removed reports",
      async () => {
        assert.equal(await page.locator(".resource-report").count(), 4);
        assert.equal(await page.locator(".absence-report").count(), 0);
        for (const name of [
          "Takım Bazlı Doluluk Haritası",
          "İşe Alım Senaryoları",
          "Aktif Kaynak ve Dağıtılan Kaynak",
        ]) {
          assert.equal(
            await page.getByRole("heading", { name, exact: true }).count(),
            0,
          );
        }
        await page
          .getByRole("heading", {
            name: "Planlanan Kaynak / Gerçekleşen Kaynak Karşılaştırma Grafiği",
            exact: true,
          })
          .waitFor();
        assert.match(
          await page
            .locator(".capacity-comparison .resource-chart-point")
            .first()
            .getAttribute("aria-label"),
          /Gerçekleşen Kaynak: 0,83 .*Dağıtılan Kaynak: 0,78/,
        );
        assert.match(
          await page
            .locator(".capacity-comparison .resource-chart-point")
            .nth(1)
            .getAttribute("aria-label"),
          /Gerçekleşen Kaynak: 0 .*Dağıtılan Kaynak: 5/,
        );
        assert.match(
          await page.locator(".resource-rank-value").innerText(),
          /0,67\s+kişi eşdeğeri/,
        );
        await page
          .locator(".planning-filterbar .period select")
          .selectOption("12");
        assert.match(
          await page.locator(".resource-rank-value").innerText(),
          /0,33\s+kişi eşdeğeri/,
        );
        await page
          .locator(".planning-filterbar .period select")
          .selectOption("6");
        await choose([noCapacity.name]);
        assert.match(
          await page.locator(".resource-rank-value").innerText(),
          /0,5\s+kişi eşdeğeri/,
        );
        assert.match(
          await page
            .locator(".capacity-comparison .resource-chart-point")
            .nth(1)
            .getAttribute("aria-label"),
          /Gerçekleşen Kaynak: 0 .*Dağıtılan Kaynak: 3/,
        );
        await choose([team.name]);
      },
    );
    await f.check(
      "resource reports: project top ten period totals and independent series selection",
      async () => {
        const report = page.locator(".project-allocation-report");
        const points = report.locator(".resource-project-point");
        assert.equal(await points.count(), 10);
        assert.equal(await points.first().getAttribute("data-project"), "p-a");
        assert.match(
          await points.first().getAttribute("aria-label"),
          /Dağıtılan Kaynak: 10 .*Gerçekleşen Kaynak: 0,5/,
        );
        assert.equal(
          await report.locator("rect[data-series=plannedTotal]").count(),
          10,
        );
        assert.equal(
          await report.locator("rect[data-series=actualTotal]").count(),
          10,
        );
        const planned = report.getByRole("switch", {
          name: "Dağıtılan Kaynak",
          exact: true,
        });
        const actual = report.getByRole("switch", {
          name: "Gerçekleşen Kaynak",
          exact: true,
        });
        await actual.uncheck();
        assert.equal(
          await report.locator("rect[data-series=actualTotal]").count(),
          0,
        );
        await planned.uncheck();
        assert.match(await report.innerText(), /en az bir kaynak türü seçin/);
        await actual.check();
        assert.equal(
          await report.locator("rect[data-series=plannedTotal]").count(),
          0,
        );
        assert.equal(
          await report.locator("rect[data-series=actualTotal]").count(),
          10,
        );
        await planned.check();
        await report.screenshot({
          path: path.join(f.dir, "project-allocation-comparison.png"),
        });
        await page
          .locator(".planning-filterbar .period select")
          .selectOption("60");
        assert.equal(
          await page
            .locator(".capacity-comparison .resource-chart-point")
            .count(),
          60,
        );
        await page.setViewportSize({ width: 900, height: 900 });
        await report.screenshot({
          path: path.join(f.dir, "project-allocation-comparison-narrow.png"),
        });
        await page.setViewportSize({ width: 1800, height: 1050 });
        await page
          .locator(".planning-filterbar .period select")
          .selectOption("6");
        assert.deepEqual(await f.state(), before);
      },
    );
    await f.check(
      "resource reports: monthly effectiveness uses actual/planned percentages with zero-plan gaps and correct placement",
      async () => {
        const report = page.locator(".planning-effectiveness-report");
        assert.equal(
          await page
            .locator(".project-allocation-report")
            .evaluate((el) =>
              el.nextElementSibling?.classList.contains(
                "planning-effectiveness-report",
              ),
            ),
          true,
        );
        assert.match(
          await report.locator(".resource-report-chip").innerText(),
          /%7,68/,
        );
        const points = report.locator(".resource-chart-point");
        assert.match(
          await points.nth(0).getAttribute("aria-label"),
          /Etkinlik: %106,15/,
        );
        assert.match(
          await points.nth(1).getAttribute("aria-label"),
          /Etkinlik: %0/,
        );
        assert.match(
          await points.nth(3).getAttribute("aria-label"),
          /Hesaplanamaz/,
        );
        assert.equal(await points.nth(3).locator("circle").count(), 0);
        assert.equal(
          await report.locator(".resource-chart-reference line").count(),
          1,
        );
        await report.locator(".resource-chart-values summary").click();
        assert.match(
          await report.locator("tbody tr").nth(3).innerText(),
          /Hesaplanamaz/,
        );
        await choose([noCapacity.name]);
        assert.match(
          await points.nth(0).getAttribute("aria-label"),
          /Hesaplanamaz/,
        );
        assert.match(
          await points.nth(1).getAttribute("aria-label"),
          /Etkinlik: %0/,
        );
        await choose([team.name]);
        await report.screenshot({
          path: path.join(f.dir, "planning-effectiveness.png"),
        });
        await page.setViewportSize({ width: 900, height: 900 });
        await report.screenshot({
          path: path.join(f.dir, "planning-effectiveness-narrow.png"),
        });
        await page.setViewportSize({ width: 1800, height: 1050 });
        await page
          .getByRole("tab", {
            name: "AA Planlanan Kaynak Dağılımı",
            exact: true,
          })
          .click();
        const summary = page.locator(".capacitystrip > summary");
        const background = () =>
          summary.evaluate((el) => {
            const s = getComputedStyle(el);
            return [s.backgroundColor, s.backgroundImage];
          });
        await page.mouse.move(0, 0);
        const normal = await background();
        await summary.hover();
        await page.waitForTimeout(220);
        assert.deepEqual(await background(), normal);
        await summary.click();
        await page.mouse.move(0, 0);
        const closed = await background();
        await summary.hover();
        await page.waitForTimeout(220);
        assert.deepEqual(await background(), closed);
        await page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .click();
        assert.deepEqual(await f.state(), before);
      },
    );
    await f.check(
      "resource reports: absence report moved below resources and period filters work",
      async () => {
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        const report = page.locator(".absence-report");
        await report.waitFor();
        assert.match(await report.innerText(), /Synthetic report leave/);
        assert.equal(await report.locator("tbody tr").count(), 1);
        await selectWorkspaceTab(page, "AA Kaynak Planlama Raporları");
        await page
          .locator('.planning-filterbar input[type="month"]')
          .fill("2026-12");
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        assert.match(
          await report.innerText(),
          /Seçili dönemde izin veya eğitim kaydı yok/,
        );
        await selectWorkspaceTab(page, "AA Kaynak Planlama Raporları");
        await page
          .locator('.planning-filterbar input[type="month"]')
          .fill("2026-10");
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        await report.screenshot({
          path: path.join(f.dir, "moved-absence-report.png"),
        });
        assert.deepEqual(await f.state(), before);
      },
    );
  } catch (error) {
    await f.capture(page, "resource-reports-failed");
    throw error;
  } finally {
    await context.close();
  }
}
