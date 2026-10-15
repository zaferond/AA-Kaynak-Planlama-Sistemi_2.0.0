import assert from "node:assert/strict";
import { milestoneRanges } from "../../shared/milestone-ranges.ts";

// Both writers authenticate only to fixture()'s disposable synthetic database.
export async function checkTimelineConcurrency(f) {
  const original = (await f.state()).projects.find((p) => p.id === "p-a");
  const writer = await f.client("root-admin");
  const remote = await f.client("admin-edit");
  const identity = await remote.context.request.get(f.origin + "/api/auth/me");
  assert.equal(identity.status(), 200);
  const { csrf } = await identity.json();
  const { page } = writer;
  const row = () =>
    page.locator('[data-project-group="p-a"] .milestone-row').first();
  const menu = () =>
    page.getByRole("menu", { name: "Bar ve Milestone işlemleri", exact: true });
  const project = async () =>
    (await f.state()).projects.find((p) => p.id === "p-a");
  let sequence = 0;
  async function remoteSave(value) {
    const state = await f.state();
    const response = await remote.context.request.post(
      f.origin + "/api/changes",
      {
        headers: {
          Origin: f.origin,
          "X-Requested-With": "KaynakPortal",
          "X-CSRF-Token": csrf,
        },
        data: {
          changes: [
            {
              kind: "project",
              id: original.id,
              revision: state.revisions["project:" + original.id],
              value,
            },
          ],
        },
      },
    );
    assert.equal(response.status(), 200);
  }
  async function reset(weekly = false) {
    await remoteSave({
      ...original,
      milestones: [
        {
          id: "concurrent-topic",
          name: "Synthetic concurrent heading",
          hasCriticalTopics: true,
          start: "2026-03-01",
          end: "2026-03-05",
          barStyle: "outline",
          barColor: "blue",
          barNotes: [
            {
              text: "First duration",
              includeInReport: false,
              start: "2026-03-01",
              end: "2026-03-05",
            },
          ],
          additionalRanges: [
            {
              start: "2026-04-01",
              end: "2026-04-10",
              color: "red",
              notes: [
                {
                  text: "Target dated note",
                  includeInReport: true,
                  completed: true,
                  start: "2026-04-02",
                  end: "2026-04-08",
                },
              ],
            },
            {
              displayKind: "milestone",
              diamondStyle: "outline",
              color: "purple",
              start: "2026-05-15",
              end: "2026-05-15",
              notes: [
                {
                  text: "Target point",
                  includeInReport: true,
                  start: "2026-05-15",
                  end: "2026-05-15",
                },
              ],
            },
          ],
        },
      ],
    });
    await page.reload();
    await page.getByRole("tab", { name: /AA Mühendislik.*Projeler/ }).click();
    await page
      .getByRole("switch", { name: "Detayları Göster", exact: true })
      .check();
    await page
      .getByRole("switch", { name: "Haftalık proje görünümü", exact: true })
      .setChecked(weekly);
    await row().waitFor();
  }
  async function updateWhileOpen(kind = "range") {
    const current = structuredClone(await project());
    const marker = "Remote interaction change " + ++sequence;
    current.responsibleName = marker;
    if (kind === "range")
      current.milestones[0].additionalRanges.unshift({
        start: "2026-03-12",
        end: "2026-03-20",
        color: "green",
        notes: [
          {
            text: "Inserted remote duration",
            includeInReport: false,
            start: "2026-03-12",
            end: "2026-03-20",
          },
        ],
      });
    else
      current.milestones[0].additionalRanges[0].notes.unshift({
        text: "Inserted remote note",
        includeInReport: false,
        start: "2026-04-03",
        end: "2026-04-04",
      });
    await remoteSave(current);
    const read = page.waitForResponse(
      (r) => r.url().endsWith("/api/data") && r.request().method() === "GET",
    );
    await page.evaluate(() =>
      window.dispatchEvent(
        new StorageEvent("storage", { key: "kaynak-planlama-offline-v1" }),
      ),
    );
    await read;
    // The surrounding row proves the newer snapshot rendered, even while the
    // held track deliberately retains its opening bars and note indices.
    await page
      .locator('[data-project-group="p-a"] .project-responsible')
      .filter({ hasText: marker })
      .waitFor();
    return await project();
  }
  function savedResponse() {
    return page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/changes") && r.request().method() === "POST",
    );
  }
  async function assertConflict(response, revision, expected) {
    assert.equal(response.status(), 409);
    assert.equal(
      response.request().postDataJSON().changes[0].revision,
      revision,
    );
    await page
      .getByRole("alert")
      .filter({
        hasText:
          "Kayıt başka kullanıcı tarafından değiştirildi. Yenileyip tekrar deneyin.",
      })
      .waitFor();
    assert.deepEqual(
      await project(),
      expected,
      "A stale interaction must preserve all remote dates, colors, flags and notes",
    );
  }
  try {
    await f.check(
      "timeline: color paste retains the menu opening revision after remote range insertion and succeeds only after reopening",
      async () => {
        await reset();
        await row().locator(".gantt-bar").first().click({ button: "right" });
        await menu()
          .getByRole("menuitem", { name: "Rengi Kopyala", exact: true })
          .click();
        await row()
          .locator(".gantt-bar")
          .filter({ hasText: "Target dated note" })
          .click({ button: "right" });
        const revision = (await f.state()).revisions["project:p-a"];
        const changed = await updateWhileOpen();
        assert.equal(await row().locator(".gantt-bar").count(), 3);
        const saved = savedResponse();
        await menu()
          .getByRole("menuitem", { name: "Rengi Yapıştır", exact: true })
          .click();
        await assertConflict(await saved, revision, changed);
        await page.keyboard.press("Escape");
        await row()
          .locator(".gantt-bar")
          .filter({ hasText: "Target dated note" })
          .click({ button: "right" });
        const retry = savedResponse();
        await menu()
          .getByRole("menuitem", { name: "Rengi Yapıştır", exact: true })
          .click();
        assert.equal((await retry).status(), 200);
        const ranges = milestoneRanges((await project()).milestones[0]);
        assert.equal(
          ranges.find((r) => r.notes[0].text === "Target dated note").color,
          "blue",
        );
        assert.equal(
          ranges.find((r) => r.notes[0].text === "Inserted remote duration")
            .color,
          "green",
        );
      },
    );
    await f.check(
      "timeline: copying from a stale color menu uses the visible opening range rather than the newly inserted range",
      async () => {
        await reset();
        await row()
          .locator(".gantt-bar")
          .filter({ hasText: "Target dated note" })
          .click({ button: "right" });
        await updateWhileOpen();
        await menu()
          .getByRole("menuitem", { name: "Rengi Kopyala", exact: true })
          .click();
        await row()
          .locator(".gantt-bar")
          .filter({ hasText: "First duration" })
          .click({ button: "right" });
        const saved = savedResponse();
        await menu()
          .getByRole("menuitem", { name: "Rengi Yapıştır", exact: true })
          .click();
        assert.equal((await saved).status(), 200);
        assert.equal(
          milestoneRanges((await project()).milestones[0])[0].color,
          "red",
        );
      },
    );

    await f.check(
      "timeline: a held bar cannot open a rebased context menu or editor after refresh when released without moving",
      async () => {
        await reset();
        const source = row()
          .locator(".gantt-bar")
          .filter({ hasText: "Target dated note" });
        await source.scrollIntoViewIfNeeded();
        const box = await source.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(420);
        const changed = await updateWhileOpen();
        await source.dispatchEvent("contextmenu", { button: 2 });
        assert.equal(await menu().count(), 0);
        await page.mouse.up();
        await page.locator(".gantt-drag-status").waitFor({ state: "hidden" });
        assert.equal(
          await page.locator('[data-slot="dialog-content"]').count(),
          0,
        );
        assert.deepEqual(await project(), changed);
      },
    );
    for (const weekly of [false, true]) {
      for (const [target, mode] of [
        ["duration", "move"],
        ["duration", "start"],
        ["duration", "end"],
        ["point", "move"],
      ]) {
        for (const conflict of [false, true]) {
          await f.check(
            `timeline: ${weekly ? "weekly" : "monthly"} ${target} ${mode} ${conflict ? "rejects a remote range insertion" : "saves opening dates and preserves flags"}`,
            async () => {
              await dragScenario({ weekly, target, mode, conflict });
            },
          );
        }
      }
    }
    for (const mode of ["move", "start", "end"]) {
      await f.check(
        `timeline: weekly note ${mode} rejects an inserted note even when the containing range index is unchanged`,
        async () => {
          await dragScenario({
            weekly: true,
            target: "duration",
            mode,
            conflict: true,
            remoteKind: "note",
          });
        },
      );
    }
  } catch (error) {
    await page.mouse.up();
    await f.capture(page, "timeline-concurrency-failed");
    throw error;
  } finally {
    await remoteSave(original);
    await writer.context.close();
    await remote.context.close();
  }

  async function dragScenario({
    weekly,
    target,
    mode,
    conflict,
    remoteKind = "range",
  }) {
    await reset(weekly);
    const source =
      target === "point"
        ? row().locator(".milestone-point")
        : row()
            .locator(weekly ? ".weekly-note-box" : ".gantt-bar")
            .filter({ hasText: "Target dated note" });
    await source.scrollIntoViewIfNeeded();
    const handle =
      mode === "move"
        ? source
        : source.locator(
            (weekly ? ".weekly-note-resize." : ".gantt-resize-handle.") + mode,
          );
    const box = await handle.boundingBox();
    assert(box);
    const revision = (await f.state()).revisions["project:p-a"];
    const before = await project();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    if (mode === "move") await page.waitForTimeout(420);
    let changed;
    if (conflict) {
      changed = await updateWhileOpen(remoteKind);
      assert.equal(
        await row()
          .locator(weekly ? ".weekly-note-box" : ".gantt-bar")
          .count(),
        2,
      );
    }
    await page.mouse.move(
      box.x + box.width / 2 + (mode === "start" ? -18 : 18),
      box.y + box.height / 2,
      { steps: 3 },
    );
    await page.locator(".gantt-drag-status:not(.invalid)").waitFor();
    const saved = savedResponse();
    await page.mouse.up();
    const response = await saved;
    if (conflict) await assertConflict(response, revision, changed);
    else {
      assert.equal(response.status(), 200);
      assert.equal(
        response.request().postDataJSON().changes[0].revision,
        revision,
      );
      const after = await project();
      const beforeRanges = milestoneRanges(before.milestones[0]);
      const afterRanges = milestoneRanges(after.milestones[0]);
      const index = target === "point" ? 2 : 1;
      // withMilestoneRanges also fills the legacy description from the notes.
      const semanticRange = ({ description, ...range }) => range;
      assert.notDeepEqual(
        semanticRange(afterRanges[index]),
        semanticRange(beforeRanges[index]),
      );
      for (let i = 0; i < beforeRanges.length; i++)
        if (i !== index)
          assert.deepEqual(
            semanticRange(afterRanges[i]),
            semanticRange(beforeRanges[i]),
          );
      assert.equal(afterRanges[index].notes[0].includeInReport, true);
      if (target === "duration")
        assert.equal(afterRanges[index].notes[0].completed, true);
      else assert.equal(afterRanges[index].start, afterRanges[index].end);
      assert.equal(after.responsibleName, before.responsibleName);
    }
  }
}
