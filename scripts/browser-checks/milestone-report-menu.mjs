import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";
import { milestoneRanges } from "../../shared/milestone-ranges.ts";

export async function checkMilestoneReportMenu(f) {
  const original = (await f.state()).projects.find((p) => p.id === "p-a");
  const topic = {
    id: "report-menu-topic",
    name: "QA Report Heading",
    start: "2026-03-01",
    end: "2026-03-20",
    barStyle: "outline",
    barColor: "blue",
    hasCriticalTopics: true,
    barNotes: [
      {
        text: "QA Included Bullet",
        includeInReport: true,
        completed: true,
        start: "2026-03-02",
        end: "2026-03-05",
      },
      {
        text: "QA Excluded Bullet",
        includeInReport: false,
        start: "2026-03-08",
        end: "2026-03-15",
      },
    ],
    additionalRanges: [
      {
        displayKind: "milestone",
        diamondStyle: "outline",
        color: "red",
        start: "2026-03-10",
        end: "2026-03-10",
        notes: [
          { text: "QA Milestone", includeInReport: true, completed: true },
        ],
      },
    ],
  };
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(d, u, [
      {
        kind: "project",
        id: original.id,
        revision: d.revisions["project:" + original.id],
        value: { ...original, milestones: [topic] },
      },
    ]),
  );
  const c = await f.client("root-admin"),
    page = c.page;
  const menu = () =>
    page.getByRole("menu", { name: "Bar ve Milestone işlemleri", exact: true });
  const row = () =>
    page.locator('[data-project-group="p-a"] .milestone-row').first();
  async function timeline(weekly = false) {
    await page.getByRole("tab", { name: /AA Mühendislik.*Projeler/ }).click();
    await page
      .getByRole("switch", { name: "Detayları Göster", exact: true })
      .check();
    await page
      .getByRole("switch", { name: "Haftalık proje görünümü", exact: true })
      .setChecked(weekly);
  }
  async function toggle(text, included, status = 200) {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/changes") && r.request().method() === "POST",
    );
    await menu()
      .getByRole("menuitemcheckbox", {
        name: (included ? "Rapora ekle: " : "Rapordan çıkar: ") + text,
        exact: true,
      })
      .click();
    const result = await response;
    assert.equal(result.status(), status);
    if (status === 200) await menu().waitFor({ state: "hidden" });
    return result;
  }
  async function flags() {
    const project = (await f.state()).projects.find(
      (p) => p.id === original.id,
    );
    return { project, ranges: milestoneRanges(project.milestones[0]) };
  }
  try {
    await timeline();
    await f.check(
      "report menu: monthly bar shows every bullet status and updates just the chosen flag through HTTP",
      async () => {
        await row().locator(".gantt-bar").first().click({ button: "right" });
        assert.equal(await menu().getByRole("menuitemcheckbox").count(), 2);
        assert.equal(
          await menu()
            .getByRole("menuitemcheckbox")
            .first()
            .getAttribute("aria-checked"),
          "true",
        );
        assert.equal(
          await menu()
            .getByRole("menuitemcheckbox")
            .nth(1)
            .getAttribute("aria-checked"),
          "false",
        );
        await f.capture(page, "bar-report-menu");
        const before = (await flags()).project;
        await toggle("QA Excluded Bullet", true);
        const after = (await flags()).project;
        const expected = structuredClone(before);
        expected.milestones[0].barNotes[1].includeInReport = true;
        assert.deepEqual(after, expected);
      },
    );
    await f.check(
      "report menu: diamond status can be removed and persists after reload with dates/color/completion intact",
      async () => {
        await row().locator(".milestone-point").click({ button: "right" });
        assert.equal(
          await menu()
            .getByRole("menuitemcheckbox")
            .getAttribute("aria-checked"),
          "true",
        );
        await f.capture(page, "milestone-report-menu");
        await toggle("QA Milestone", false);
        await page.reload();
        await timeline();
        await row().locator(".milestone-point").click({ button: "right" });
        assert.equal(
          await menu()
            .getByRole("menuitemcheckbox")
            .getAttribute("aria-checked"),
          "false",
        );
        const point = (await flags()).ranges[1];
        assert.equal(point.start, "2026-03-10");
        assert.equal(point.end, point.start);
        assert.equal(point.color, "red");
        assert.equal(point.diamondStyle, "outline");
        assert.equal(point.notes[0].completed, true);
        await page.keyboard.press("Escape");
        await page
          .getByRole("tab", { name: "AA Kritik Proje Konuları", exact: true })
          .click();
        await page.getByText("QA Excluded Bullet", { exact: true }).waitFor();
        assert.equal(
          await page.getByText("QA Milestone", { exact: true }).count(),
          0,
        );
      },
    );
    await f.check(
      "report menu: weekly detail boxes expose parent bullets and diamonds can be added back to the report",
      async () => {
        await timeline(true);
        const note = row().locator(".weekly-note-box").first();
        await note.click({ button: "right" });
        assert.equal(await menu().getByRole("menuitemcheckbox").count(), 2);
        await toggle("QA Included Bullet", false);
        await row().locator(".milestone-point").scrollIntoViewIfNeeded();
        await row().locator(".milestone-point").click({ button: "right" });
        await toggle("QA Milestone", true);
        const saved = await flags();
        assert.equal(saved.ranges[0].notes[0].includeInReport, false);
        assert.equal(saved.ranges[0].notes[1].includeInReport, true);
        assert.equal(saved.ranges[1].notes[0].includeInReport, true);
        await page
          .getByRole("tab", { name: "AA Kritik Proje Konuları", exact: true })
          .click();
        await page.getByText("QA Milestone", { exact: true }).waitFor();
        assert.equal(
          await page.getByText("QA Included Bullet", { exact: true }).count(),
          0,
        );
      },
    );
    await f.check(
      "report menu: stale menu retains its opening revision and cannot overwrite a remote project update",
      async () => {
        await timeline();
        await row().locator(".gantt-bar").first().click({ button: "right" });
        const state = await f.state(),
          snapshot = state.projects.find((p) => p.id === original.id);
        await f.store.mutate(f.actor, (d, u) =>
          applyChanges(d, u, [
            {
              kind: "project",
              id: original.id,
              revision: state.revisions["project:" + original.id],
              value: {
                ...snapshot,
                responsibleName: "Remote report menu owner",
              },
            },
          ]),
        );
        const response = await toggle("QA Included Bullet", true, 409);
        assert.equal(
          response.request().postDataJSON().changes[0].revision,
          state.revisions["project:" + original.id],
        );
        assert.equal(
          (await flags()).project.responsibleName,
          "Remote report menu owner",
        );
        assert.equal((await flags()).ranges[0].notes[0].includeInReport, false);
        await page.keyboard.press("Escape");
        await page.reload();
        await timeline();
        await row().locator(".gantt-bar").first().click({ button: "right" });
        await toggle("QA Included Bullet", true);
        assert.equal(
          (await flags()).project.responsibleName,
          "Remote report menu owner",
        );
      },
    );
    await f.check(
      "report menu: read-only users can inspect report flags but cannot change them",
      async () => {
        const viewer = await f.client("employee");
        try {
          await viewer.page
            .getByRole("tab", { name: /AA Mühendislik.*Projeler/ })
            .click();
          await viewer.page
            .getByRole("switch", { name: "Detayları Göster", exact: true })
            .check();
          await viewer.page
            .locator('[data-project-group="p-a"] .gantt-bar')
            .first()
            .click({ button: "right" });
          const items = viewer.page
            .getByRole("menu", {
              name: "Bar ve Milestone işlemleri",
              exact: true,
            })
            .getByRole("menuitemcheckbox");
          assert.equal(await items.count(), 2);
          for (const item of await items.all()) assert(await item.isDisabled());
          assert.equal(
            await viewer.page
              .getByRole("button", { name: "Liderlikleri Yönet", exact: true })
              .count(),
            0,
          );
        } finally {
          await viewer.context.close();
        }
      },
    );
  } catch (error) {
    await f.capture(page, "milestone-report-menu-failed");
    throw error;
  } finally {
    await c.context.close();
    await f.store.mutate(f.actor, (d, u) =>
      applyChanges(d, u, [
        {
          kind: "project",
          id: original.id,
          revision: d.revisions["project:" + original.id],
          value: original,
        },
      ]),
    );
  }
}
