import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";
import { activePostingPlanningChanges } from "../../frontend/src/features/workspace/active-posting-changes.ts";
import { selectWorkspaceTab } from "./fixture.mjs";

export async function checkActivePostingPlanning(f) {
  const resources = [
    ["qa-posting-a", "Aktif İlan", f.teamA],
    ["qa-posting-b", "Aktif İlan", f.teamB],
    ["qa-passive", "Pasif İlan", f.teamA],
  ].map(([id, status, team]) => ({
    id,
    name: id,
    note: "",
    versions: [
      {
        effective: "2026-01",
        status,
        team: team.id,
        lead: team.lead,
        included: false,
        start: "",
        end: "",
        amount: 1,
      },
    ],
  }));
  await f.store.mutate(f.actor, (data, actor) =>
    applyChanges(
      data,
      actor,
      resources.map((value) => ({
        kind: "resource",
        id: value.id,
        value,
        revision: 0,
      })),
    ),
  );
  const { page } = await f.client("root-admin");
  const control = () =>
    page.getByRole("switch", { name: "Aktif İlanları Dahil Et", exact: true });
  try {
    await selectWorkspaceTab(page, "AA Kaynak Planlama Raporları");
    await f.check(
      "report vacancies: compact switch is below filters and above leadership report; all teams update atomically",
      async () => {
        await page.getByRole("button", { name: "Takım", exact: true }).click();
        const picker = page.locator('.pickerpanel[data-state="open"]');
        await picker.getByRole("textbox").fill(f.teamA.name);
        await picker
          .getByRole("checkbox", { name: f.teamA.name, exact: true })
          .check();
        await page.keyboard.press("Escape");
        const summary = await page
          .getByRole("region", {
            name: "Raporlarda uygulanan filtreler",
            exact: true,
          })
          .boundingBox();
        const options = await page
          .locator(".report-posting-options")
          .boundingBox();
        const heading = await page
          .getByRole("heading", {
            name: "Liderlik Bazında Eksik Raporu",
            exact: true,
          })
          .boundingBox();
        assert(options.y >= summary.y + summary.height - 1);
        assert(options.y + options.height <= heading.y);
        assert(options.height <= 48);
        assert.equal(await control().getAttribute("aria-checked"), "false");
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/changes") && r.request().method() === "POST",
        );
        await control().click();
        assert.equal((await response).status(), 200);
        await f.wait(
          async () => (await control().getAttribute("aria-checked")) === "true",
          "posting toggle saved",
        );
        const data = await f.state();
        for (const id of ["qa-posting-a", "qa-posting-b"]) {
          const v = data.resources.find((r) => r.id === id).versions.at(-1);
          assert.equal(v.included, true);
          assert.equal(v.start, "2026-10-02");
        }
        assert.deepEqual(
          data.resources.find((r) => r.id === "qa-passive"),
          resources[2],
        );
        await f.capture(page, "active-postings-report-toggle");
        await page.reload();
        await selectWorkspaceTab(page, "AA Kaynak Planlama Raporları");
        await control().waitFor();
        assert.equal(await control().getAttribute("aria-checked"), "true");
      },
    );
    await f.check(
      "report vacancies: a refused write preserves records and switch; turning off clears every vacancy date",
      async () => {
        const before = await f.state();
        await page.route("**/api/changes", (route) =>
          route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({ error: "Synthetic concurrent edit" }),
          }),
        );
        await control().click();
        await page
          .getByRole("alert")
          .filter({ hasText: "Synthetic concurrent edit" })
          .waitFor();
        assert.equal(await control().getAttribute("aria-checked"), "true");
        assert.deepEqual(await f.state(), before);
        await page.unroute("**/api/changes");
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/changes") && r.request().method() === "POST",
        );
        await control().click();
        assert.equal((await response).status(), 200);
        await f.wait(
          async () =>
            (await control().getAttribute("aria-checked")) === "false",
          "posting toggle disabled",
        );
        const data = await f.state();
        for (const id of ["qa-posting-a", "qa-posting-b"]) {
          const v = data.resources.find((r) => r.id === id).versions.at(-1);
          assert.equal(v.included, false);
          assert.equal(v.start, "");
        }
      },
    );
  } finally {
    await page.close();
  }
  const manager = await f.client("manager");
  try {
    await selectWorkspaceTab(manager.page, "AA Kaynak Planlama Raporları");
    await f.check(
      "report vacancies: manager sees read-only toggle and API rejects global resource changes",
      async () => {
        const toggle = manager.page.getByRole("switch", {
          name: "Aktif İlanları Dahil Et",
          exact: true,
        });
        assert.equal(await toggle.isDisabled(), true);
        const before = await f.state();
        const response = await manager.context.request.post(
          f.origin + "/api/changes",
          {
            headers: { Origin: f.origin, "X-Requested-With": "KaynakPortal" },
            data: {
              changes: activePostingPlanningChanges(before, true, "2026-10-02"),
            },
          },
        );
        assert.equal(response.status(), 403);
        assert.deepEqual(await f.state(), before);
      },
    );
  } finally {
    await manager.page.close();
  }
}
