import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";
import { milestoneRanges } from "../../shared/milestone-ranges.ts";

export async function checkMilestoneParentDates(f) {
  const original = (await f.state()).projects.find((p) => p.id === "p-a");
  async function saveProject(value) {
    const state = await f.state();
    await f.store.mutate(f.actor, (d, u) =>
      applyChanges(d, u, [
        {
          kind: "project",
          id: original.id,
          value,
          revision: state.revisions["project:" + original.id] || 0,
        },
      ]),
    );
  }
  const c = await f.client("root-admin");
  try {
    await saveProject({
      ...original,
      milestones: [
        {
          id: "parent-dates-topic",
          name: "Synthetic parent dates",
          start: "2026-03-01",
          end: "2026-03-20",
          barStyle: "outline",
          barColor: "blue",
          barNotes: [
            {
              text: "First note",
              start: "2026-03-01",
              end: "2026-03-05",
              includeInReport: true,
            },
            {
              text: "Second note",
              start: "2026-03-10",
              end: "2026-03-20",
              includeInReport: true,
            },
          ],
          additionalRanges: [
            {
              displayKind: "milestone",
              start: "2026-04-10",
              end: "2026-04-10",
              color: "red",
              notes: [
                {
                  text: "Point",
                  includeInReport: true,
                  start: "2026-04-10",
                  end: "2026-04-10",
                },
              ],
            },
          ],
        },
      ],
    });
    const { page } = c;
    await page.reload();
    await page.getByRole("tab", { name: /AA Mühendislik.*Projeler/ }).click();
    await page
      .getByRole("switch", { name: "Detayları Göster", exact: true })
      .check();
    await page
      .getByRole("button", {
        name: "Synthetic parent dates düzenle",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Başlık Düzenle",
      exact: true,
    });
    const start = dialog.getByLabel("1. üst açıklama başlangıç tarihi", {
      exact: true,
    });
    const end = dialog.getByLabel("1. üst açıklama bitiş tarihi", {
      exact: true,
    });
    const noteStart = dialog.getByLabel("1.1 açıklama başlangıç tarihi", {
      exact: true,
    });
    const noteEnd = dialog.getByLabel("1.2 açıklama bitiş tarihi", {
      exact: true,
    });
    await f.check(
      "projects: parent date range is read-only and follows earliest/latest detail dates in both directions",
      async () => {
        for (const input of [start, end]) {
          assert.equal(await input.evaluate((el) => el.readOnly), true);
          const before = await input.inputValue();
          await input.press("ArrowUp");
          assert.equal(await input.inputValue(), before);
        }
        await noteStart.fill("2026-03-03");
        assert.equal(await start.inputValue(), "2026-03-03");
        await noteEnd.fill("2026-03-25");
        assert.equal(await end.inputValue(), "2026-03-25");
        await noteStart.fill("2026-02-20");
        assert.equal(await start.inputValue(), "2026-02-20");
        await noteEnd.fill("2026-03-15");
        assert.equal(await end.inputValue(), "2026-03-15");
        assert.equal(
          await dialog
            .getByLabel("1.1 açıklama bitiş tarihi", { exact: true })
            .inputValue(),
          "2026-03-05",
        );
        const point = dialog.getByLabel("2. milestone tarihi", { exact: true });
        assert.equal(await point.evaluate((el) => el.readOnly), false);
        await point.fill("2026-04-12");
        const reply = page.waitForResponse((r) =>
          r.url().endsWith("/api/changes"),
        );
        await dialog
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        assert.equal((await reply).status(), 200);
        await dialog.waitFor({ state: "hidden" });
        const topic = (await f.state()).projects.find(
          (p) => p.id === original.id,
        ).milestones[0];
        assert.deepEqual(
          milestoneRanges(topic).map((r) => [r.start, r.end]),
          [
            ["2026-02-20", "2026-03-15"],
            ["2026-04-12", "2026-04-12"],
          ],
        );
        await page.reload();
        await page
          .getByRole("tab", { name: /AA Mühendislik.*Projeler/ })
          .click();
        await page
          .getByRole("switch", { name: "Detayları Göster", exact: true })
          .check();
        await page
          .getByRole("button", {
            name: "Synthetic parent dates düzenle",
            exact: true,
          })
          .click();
        assert.equal(await start.inputValue(), "2026-02-20");
        assert.equal(await end.inputValue(), "2026-03-15");
      },
    );
    await f.check(
      "projects: blank detail text contributes to parent dates before saving and the parent survives reload",
      async () => {
        await dialog.locator(".milestone-note-input textarea").first().fill("");
        await noteStart.fill("2026-02-10");
        assert.equal(await start.inputValue(), "2026-02-10");
        const firstEnd = dialog.getByLabel("1.1 açıklama bitiş tarihi", {
          exact: true,
        });
        await firstEnd.fill("2026-03-25");
        assert.equal(await end.inputValue(), "2026-03-25");
        await dialog
          .locator(".milestone-note-input textarea")
          .nth(1)
          .fill("   ");
        await noteStart.fill("2026-03-06");
        assert.equal(await start.inputValue(), "2026-03-06");
        await firstEnd.fill("2026-03-12");
        assert.equal(await end.inputValue(), "2026-03-15");
        const revision = (await f.state()).revisions["project:" + original.id];
        await dialog
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        await dialog
          .getByRole("alert")
          .filter({ hasText: "Rapora eklenecek açıklama boş olamaz." })
          .waitFor();
        assert.equal(
          (await f.state()).revisions["project:" + original.id],
          revision,
        );
        await dialog.locator(".milestone-note-report input").nth(0).uncheck();
        await dialog.locator(".milestone-note-report input").nth(1).uncheck();
        const reply = page.waitForResponse((r) =>
          r.url().endsWith("/api/changes"),
        );
        await dialog
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        assert.equal((await reply).status(), 200);
        await dialog.waitFor({ state: "hidden" });
        await page.reload();
        await page
          .getByRole("tab", { name: /AA Mühendislik.*Projeler/ })
          .click();
        await page
          .getByRole("switch", { name: "Detayları Göster", exact: true })
          .check();
        await page
          .getByRole("button", {
            name: "Synthetic parent dates düzenle",
            exact: true,
          })
          .click();
        assert.equal(await start.inputValue(), "2026-03-06");
        assert.equal(await end.inputValue(), "2026-03-15");
        const topic = (await f.state()).projects.find(
          (p) => p.id === original.id,
        ).milestones[0];
        assert.deepEqual(
          [topic.start, topic.end],
          ["2026-03-06", "2026-03-15"],
        );
      },
    );
  } finally {
    await c.context.close();
    await saveProject(original);
  }
}
