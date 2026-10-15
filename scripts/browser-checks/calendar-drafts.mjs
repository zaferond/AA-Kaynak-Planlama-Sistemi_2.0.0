import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";

export async function checkCalendarDrafts(f) {
  const client = await f.client("root-admin");
  const { page } = client;
  const original = await f.state();
  const calendar = structuredClone(original.workCalendar || {});
  const project = structuredClone(
    original.projects.find((item) => item.id === "p-a"),
  );
  const dialog = () => page.locator(".work-calendar-dialog");
  const actual = () =>
    page
      .getByRole("tab", { name: "AA Gerçekleşen Kaynak Dağılımı", exact: true })
      .click();
  const open = () =>
    page
      .getByRole("button", { name: "Çalışma Takvimi'ni aç", exact: true })
      .click();
  async function replaceCalendar(value, projectValue) {
    await f.store.mutate(f.actor, (data, actor) =>
      applyChanges(data, actor, [
        {
          kind: "calendar",
          id: "shared",
          value,
          revision: data.revisions["calendar:shared"] || 0,
        },
        ...(projectValue
          ? [
              {
                kind: "project",
                id: projectValue.id,
                value: projectValue,
                revision: data.revisions["project:" + projectValue.id] || 0,
              },
            ]
          : []),
      ]),
    );
  }
  async function add(from, to, label, fraction = "1") {
    await dialog().getByLabel("Başlangıç", { exact: true }).fill(from);
    await dialog().getByLabel("Bitiş", { exact: true }).fill(to);
    await dialog()
      .locator(".work-calendar-fields select")
      .nth(1)
      .selectOption(fraction);
    await dialog().getByLabel("Açıklama", { exact: true }).fill(label);
    await dialog().getByRole("button", { name: "Ekle", exact: true }).click();
  }
  try {
    await actual();
    await f.check(
      "calendar: shared 503 preserves added dates; pending retry locks controls and prevents closing until one save completes",
      async () => {
        await open();
        await add("2026-05-01", "2026-05-02", "Synthetic retry dates", "0.5");
        assert(
          (await dialog().locator(".work-calendar-list").innerText()).includes(
            "Synthetic retry dates",
          ),
        );
        assert.equal((await f.state()).workCalendar["2026-05-01"], undefined);
        await page.route(
          "**/api/changes",
          (route) =>
            route.fulfill({
              status: 503,
              json: { error: "Synthetic shared calendar failure" },
            }),
          { times: 1 },
        );
        await dialog()
          .getByRole("button", { name: "Takvimi Kaydet", exact: true })
          .click();
        await dialog()
          .getByRole("alert")
          .filter({ hasText: "Synthetic shared calendar failure" })
          .waitFor();
        assert(
          (await dialog().locator(".work-calendar-list").innerText()).includes(
            "Synthetic retry dates",
          ),
        );
        assert.equal((await f.state()).workCalendar["2026-05-01"], undefined);
        let release,
          requests = 0;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const hold = async (route) => {
          requests++;
          await gate;
          await route.continue();
        };
        await page.route("**/api/changes", hold);
        try {
          await dialog()
            .getByRole("button", { name: "Takvimi Kaydet", exact: true })
            .click();
          await f.wait(() => requests === 1, "shared retry held");
          assert(
            await dialog()
              .getByLabel("Başlangıç", { exact: true })
              .isDisabled(),
          );
          assert(
            await dialog()
              .getByRole("button", { name: "‹", exact: true })
              .isDisabled(),
          );
          assert(
            await dialog()
              .getByRole("button", { name: "Kapat", exact: true })
              .isDisabled(),
          );
          assert(
            await dialog()
              .getByRole("button", { name: "Kaydediliyor…", exact: true })
              .isDisabled(),
          );
          await page.keyboard.press("Escape");
          assert(await dialog().isVisible());
          await dialog()
            .getByRole("button", { name: "Close", exact: true })
            .click();
          assert(await dialog().isVisible());
          assert.equal(requests, 1);
          release();
          await dialog().waitFor({ state: "hidden" });
          const saved = await f.state();
          assert.equal(saved.workCalendar["2026-05-01"].fraction, 0.5);
          assert.equal(
            saved.workCalendar["2026-05-02"].label,
            "Synthetic retry dates",
          );
        } finally {
          release();
          await page.unroute("**/api/changes", hold);
        }
        await replaceCalendar(calendar);
        await page.reload();
        await actual();
      },
    );
    await f.check(
      "calendar: refreshed props do not rebase shared draft; 409 preserves local dates and remote changes; reopen loads latest",
      async () => {
        const revision = (await f.state()).revisions["calendar:shared"] || 0;
        await open();
        await add("2026-06-01", "2026-06-01", "Synthetic local date");
        await replaceCalendar(
          {
            ...calendar,
            "2026-06-02": {
              type: "company",
              label: "Synthetic remote date",
              fraction: 1,
            },
          },
          {
            ...project,
            phases: {
              ...project.phases,
              "2026-01": "Synthetic calendar snapshot refreshed",
            },
          },
        );
        const incoming = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/data") && response.status() === 200,
        );
        await page.evaluate(() =>
          window.dispatchEvent(
            new StorageEvent("storage", { key: "kaynak-planlama-offline-v1" }),
          ),
        );
        await incoming;
        await f.wait(
          async () =>
            (await page
              .locator('[data-project-group="p-a"] .actual-phase-button')
              .first()
              .textContent()) === "Synthetic calendar snapshot refreshed",
          "refreshed snapshot rendered behind calendar",
        );
        const local = await dialog().locator(".work-calendar-list").innerText();
        assert(local.includes("Synthetic local date"));
        assert(!local.includes("Synthetic remote date"));
        const response = page.waitForResponse((result) =>
          result.url().endsWith("/api/changes"),
        );
        await dialog()
          .getByRole("button", { name: "Takvimi Kaydet", exact: true })
          .click();
        const conflict = await response;
        assert.equal(conflict.status(), 409);
        assert.equal(
          conflict.request().postDataJSON().changes[0].revision,
          revision,
        );
        await dialog().getByRole("alert").waitFor();
        assert(
          (await dialog().locator(".work-calendar-list").innerText()).includes(
            "Synthetic local date",
          ),
        );
        assert.equal((await f.state()).workCalendar["2026-06-01"], undefined);
        assert.equal(
          (await f.state()).workCalendar["2026-06-02"].label,
          "Synthetic remote date",
        );
        await f.capture(page, "calendar-shared-conflict");
        await dialog()
          .getByRole("button", { name: "Kapat", exact: true })
          .click();
        await page.reload();
        await actual();
        await open();
        const latest = await dialog()
          .locator(".work-calendar-list")
          .innerText();
        assert(latest.includes("Synthetic remote date"));
        assert(!latest.includes("Synthetic local date"));
        assert(
          await dialog()
            .getByRole("button", { name: "Takvimi Kaydet", exact: true })
            .isDisabled(),
        );
        await dialog()
          .getByRole("button", { name: "Kapat", exact: true })
          .click();
      },
    );
  } catch (error) {
    await f.capture(page, "calendar-draft-failure").catch(() => {});
    throw error;
  } finally {
    await replaceCalendar(calendar, project);
    await client.context.close();
  }
}
