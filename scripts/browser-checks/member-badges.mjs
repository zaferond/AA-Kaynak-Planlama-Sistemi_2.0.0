import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";
export async function checkMemberBadges(f) {
  const { page, context } = await f.client("root-admin");
  const created = [];
  try {
    await page
      .getByRole("tab", { name: "AA Kaynak Planlama Raporları", exact: true })
      .click();
    const lastLead = await page
      .locator(".leader-report tbody tr")
      .last()
      .locator(".report-unit-title > span")
      .first()
      .innerText();
    const state = await f.state();
    const teams = state.teams.filter((t) => t.kind !== "leadership");
    const lastTeam = teams
      .sort((a, b) => a.name.localeCompare(b.name, "tr"))
      .at(-1);
    const leadTeam = teams.find((t) => t.lead === lastLead);
    assert(lastTeam && leadTeam);
    await f.store.mutate(f.actor, (d, u) =>
      applyChanges(
        d,
        u,
        [
          ...new Map([lastTeam, leadTeam].map((t) => [t.id, t])).values(),
        ].flatMap((team) =>
          Array.from({ length: 40 }, (_, i) => {
            const id = `qa-member-${team.id}-${i}`;
            created.push(id);
            return {
              kind: "resource",
              id,
              revision: 0,
              value: {
                id,
                name: `ZZZ Synthetic Member ${String(i).padStart(2, "0")}`,
                note: "",
                versions: [
                  {
                    effective: "2026-01",
                    team: team.id,
                    lead: team.lead,
                    status: "Aktif Çalışan",
                    included: true,
                    start: "2026-01-01",
                    end: "",
                    amount: 1,
                  },
                ],
              },
            };
          }),
        ),
      ),
    );
    await page.reload();
    await page
      .getByRole("tab", { name: "AA Kaynak Planlama Raporları", exact: true })
      .click();
    await page.setViewportSize({ width: 1000, height: 700 });
    for (const selector of [".leader-report", ".team-report"]) {
      await f.check(
        `member badges: ${selector} final-row list escapes the table and all workers remain scrollable at 90% scale`,
        async () => {
          const badge = page
            .locator(selector + " tbody tr")
            .last()
            .locator(".team-member-badge");
          await badge.hover();
          const popup = page.locator(
            '.team-member-floating[data-state="open"]',
          );
          await popup.waitFor();
          const bounds = await popup.boundingBox();
          assert(bounds.y >= 0 && bounds.y + bounds.height <= 701);
          assert.equal(
            await popup.evaluate(
              (el) => !!el.closest('[data-slot="table-container"]'),
            ),
            false,
          );
          const names = popup.locator(".team-member-names");
          await names.hover();
          await page.mouse.wheel(0, 1800);
          await f.wait(
            () => names.evaluate((el) => el.scrollTop > 0),
            "worker list scrolls",
          );
          const last = names.locator("span").last();
          assert.equal(await last.innerText(), "ZZZ Synthetic Member 39");
          assert(
            await last.evaluate((el) => {
              const r = el.getBoundingClientRect(),
                hit = document.elementFromPoint(
                  r.x + r.width / 2,
                  r.y + r.height / 2,
                );
              return el === hit || el.contains(hit);
            }),
          );
          await f.capture(page, "member-badge-" + selector.slice(1));
          await page.keyboard.press("Escape");
          await popup.waitFor({ state: "hidden" });
          await badge.focus();
          await popup.waitFor();
          await page.keyboard.press("Escape");
          await popup.waitFor({ state: "hidden" });
        },
      );
    }
    await page.setViewportSize({ width: 1800, height: 1050 });
    await page
      .getByRole("tab", { name: "AA Planlanan Kaynak Dağılımı", exact: true })
      .click();
    const badge = page.locator(".allocation-grid .team-member-badge").first();
    await badge.click();
    await page.locator('.team-member-floating[data-state="open"]').waitFor();
    await page.keyboard.press("Escape");
  } catch (e) {
    await f.capture(page, "member-badge-failed").catch(() => {});
    throw e;
  } finally {
    await context.close();
    await f.store.mutate(f.actor, (d, u) =>
      applyChanges(
        d,
        u,
        created.map((id) => ({
          kind: "resource",
          id,
          revision: d.revisions["resource:" + id],
          value: null,
          operation: "delete",
        })),
      ),
    );
  }
}
