import { revealTableItem } from "./fixture.mjs";
import assert from "node:assert/strict";
import { selectWorkspaceTab } from "./fixture.mjs";
import { applyLeaderChange } from "../../backend/operations.mjs";
import { directoryRevision } from "../../shared/directory-policy.ts";

export async function checkTeamPlanningPermissions(f) {
  const child = "QA Permission Child";
  await f.store.mutate(f.actor, (d, u, c, g) =>
    applyLeaderChange(
      d,
      u,
      {
        action: "create",
        name: child,
        parentName: f.teamA.lead,
        catalogRevision: directoryRevision(d),
      },
      c,
      g,
    ),
  );
  await f.store.mutate(f.actor, (d) => {
    d.teams.push({
      id: "qa-permission-child-team",
      name: "QA Permission Child Team",
      lead: child,
      excelCapacity: 0,
    });
  });
  const admin = await f.client("root-admin");
  const { page } = admin;
  const dialog = () =>
    page.locator('.access-permission-dialog[data-state="open"]');
  async function edit() {
    await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
    await page
      .locator('tr[data-account-id="manager"]')
      .getByRole("button", { name: "Düzenle", exact: true })
      .click();
  }
  async function save() {
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/api/users") && r.request().method() === "POST",
    );
    await dialog().getByRole("button", { name: "Kaydet", exact: true }).click();
    assert.equal((await response).status(), 200);
    await dialog().waitFor({ state: "hidden" });
  }
  try {
    await f.check(
      "team grants: taller hierarchy selects descendant leaderships and teams; team-only scope persists",
      async () => {
        await edit();
        const grants = dialog().locator(".access-leader-field");
        const root = grants.getByRole("checkbox", {
          name: f.teamA.lead,
          exact: true,
        });
        const childBox = grants.getByRole("checkbox", {
          name: child,
          exact: true,
        });
        const childTeam = grants.getByRole("checkbox", {
          name: "QA Permission Child Team takımı",
          exact: true,
        });
        assert(await root.isChecked());
        assert(await childBox.isChecked());
        assert(await childTeam.isChecked());
        assert(await childTeam.isDisabled());
        assert.equal(
          await childTeam.locator("..").getAttribute("data-leadership-parent"),
          child,
        );
        assert(
          parseFloat(
            await grants
              .locator(".accessleaders")
              .evaluate((e) => getComputedStyle(e).maxHeight),
          ) >= 300,
        );
        await grants
          .getByRole("button", { name: "Seçimi Temizle", exact: true })
          .click();
        await childTeam.check();
        assert(!(await root.isChecked()));
        assert(!(await childBox.isChecked()));
        await save();
        assert.deepEqual(
          (await f.store.findUser({ id: "manager" })).planningTeams,
          ["qa-permission-child-team"],
        );
        assert.deepEqual(
          (await f.store.findUser({ id: "manager" })).leaders,
          [],
        );
        await edit();
        assert(
          await dialog()
            .getByRole("checkbox", {
              name: "QA Permission Child Team takımı",
              exact: true,
            })
            .isChecked(),
        );
        await f.capture(page, "team-planning-permission-tree");
        await dialog()
          .getByRole("button", { name: "Vazgeç", exact: true })
          .click();
      },
    );
    const manager = await f.client("manager");
    try {
      await f.check(
        "team grants: only assigned team edits single and multiple planning cells; authenticated API denies outside scope",
        async () => {
          await manager.page.goto(
            f.origin +
              "/?" +
              new URLSearchParams({
                allocation: "full",
                view: "project",
                start: "2026-01",
                count: "12",
                project: "p-a",
              }),
          );
          const input = (id, month = "01") =>
            manager.page.locator(
              `[data-plan-cell="${id}|p-a|2026-${month}"] input`,
            );
          await revealTableItem(
            manager.page.locator(
              ".workspace-dock > [data-slot=table-container]",
            ),
            input("qa-permission-child-team"),
          );
          assert(await input("qa-permission-child-team").isEnabled());
          await input("qa-permission-child-team").fill("0,5");
          await input("qa-permission-child-team").press("Enter");
          await f.wait(
            async () =>
              (await f.state()).allocations[
                "qa-permission-child-team|p-a|2026-01"
              ] === 0.5,
            "team grant single save",
          );
          await f.wait(
            () => input("qa-permission-child-team").isEnabled(),
            "save complete",
          );
          const cell = (m) =>
            manager.page.locator(
              `[data-plan-cell="qa-permission-child-team|p-a|2026-${m}"]`,
            );
          await cell("02").click();
          await cell("03").click({ modifiers: ["Control"] });
          await input("qa-permission-child-team", "02").fill("0,7");
          await input("qa-permission-child-team", "02").press("Control+Enter");
          await f.wait(async () => {
            const d = await f.state();
            return ["02", "03"].every(
              (m) =>
                d.allocations["qa-permission-child-team|p-a|2026-" + m] === 0.7,
            );
          }, "team grant bulk save");
          await revealTableItem(
            manager.page.locator(
              ".workspace-dock > [data-slot=table-container]",
            ),
            input(f.teamA.id),
          );
          assert(await input(f.teamA.id).isDisabled());
          const me = await (
            await manager.context.request.get(f.origin + "/api/auth/me")
          ).json();
          const response = await manager.context.request.post(
            f.origin + "/api/changes",
            {
              headers: {
                Origin: f.origin,
                "X-Requested-With": "KaynakPortal",
                "X-CSRF-Token": me.csrf,
              },
              data: {
                changes: [
                  {
                    kind: "allocation",
                    id: f.teamA.id + "|p-a|2026-01",
                    value: 1,
                    revision: 0,
                  },
                ],
              },
            },
          );
          assert.equal(response.status(), 403);
          assert.equal(
            (await f.state()).allocations[f.teamA.id + "|p-a|2026-01"],
            undefined,
          );
        },
      );
    } finally {
      await manager.context.close();
    }
    await f.check(
      "team grants: selecting a parent saves inherited rights and clears redundant explicit team grants",
      async () => {
        await edit();
        await dialog()
          .getByRole("checkbox", { name: f.teamA.lead, exact: true })
          .check();
        assert(
          await dialog()
            .getByRole("checkbox", { name: child, exact: true })
            .isChecked(),
        );
        assert(
          await dialog()
            .getByRole("checkbox", {
              name: "QA Permission Child Team takımı",
              exact: true,
            })
            .isChecked(),
        );
        await save();
        const user = await f.store.findUser({ id: "manager" });
        assert.deepEqual(user.leaders, [f.teamA.lead]);
        assert.deepEqual(user.planningTeams, []);
      },
    );
    await f.check(
      "team grants: linked employee editor saves team scope atomically and preserves employee linkage",
      async () => {
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        await page
          .locator('tr[data-account-id="employee"]')
          .getByRole("button", { name: "Düzenle", exact: true })
          .click();
        const editor = page.locator(
          '.employee-access-editor[data-state="open"]',
        );
        await editor.getByLabel("Rol", { exact: true }).selectOption("manager");
        const grants = editor.locator(".access-leader-field");
        await grants
          .getByRole("button", { name: "Seçimi Temizle", exact: true })
          .click();
        await grants
          .getByRole("checkbox", {
            name: f.teamB.name + " takımı",
            exact: true,
          })
          .check();
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/employees/save") &&
            r.request().method() === "POST",
        );
        await editor
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        assert.equal((await response).status(), 200);
        await editor.waitFor({ state: "hidden" });
        const user = await f.store.findUser({ id: "employee" });
        assert.equal(user.resourceId, "r-own");
        assert.deepEqual(user.leaders, []);
        assert.deepEqual(user.planningTeams, [f.teamB.id]);
      },
    );
  } finally {
    await admin.context.close();
  }
}
