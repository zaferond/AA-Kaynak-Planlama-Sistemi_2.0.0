import { selectWorkspaceTab } from "./fixture.mjs";
import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";
export async function checkResourceRoles(f) {
  const { page } = await f.client("root-admin"),
    original = (await f.state()).resources.find((r) => r.id === "r-own");
  const created = new Set(),
    dialog = () => page.locator('[data-slot="dialog-content"]'),
    picker = () => page.locator('.pickerpanel[data-state="open"]');
  const tab = async (name) => selectWorkspaceTab(page, name);
  async function choose(label, name) {
    await dialog().getByRole("button", { name: label, exact: true }).click();
    await picker().getByRole("textbox").fill(name);
    await picker().getByRole("button", { name, exact: true }).click();
  }
  async function editOwn() {
    await tab("Çalışan & Yetki Tanımlama");
    await page
      .locator(".resource-table tbody tr")
      .filter({ has: page.getByText(original.name, { exact: true }) })
      .getByRole("button", { name: "Düzenle", exact: true })
      .click();
  }
  async function save(status = 200) {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/changes") && r.request().method() === "POST",
    );
    await dialog().getByRole("button", { name: "Kaydet", exact: true }).click();
    assert.equal((await response).status(), status);
    if (status === 200) await dialog().waitFor({ state: "hidden" });
  }
  async function draft(name, role) {
    await tab("Çalışan & Yetki Tanımlama");
    await page
      .getByRole("button", { name: "Kaynak Ekle / Yetki Tanımla", exact: true })
      .click();
    await dialog().getByLabel("Ad Soyad", { exact: true }).fill(name);
    assert.deepEqual(
      await dialog()
        .getByLabel("Kaynak Rolü", { exact: true })
        .locator("option")
        .allTextContents(),
      ["Lider", "Product Owner", "Team Member", "CoE"],
    );
    await dialog()
      .getByLabel("Kaynak Rolü", { exact: true })
      .selectOption(role);
    if (role === "leader") await choose("Liderlik", f.teamA.lead);
    else await choose("Takım", f.teamA.name);
  }
  async function cancel() {
    await page.keyboard.press("Escape");
    await dialog().waitFor({ state: "hidden" });
  }
  async function expectPopup(action, owner, leader = false) {
    const popup = page.waitForEvent("dialog");
    const work = action();
    const message = await popup;
    assert.equal(message.type(), "alert");
    assert.equal(
      message.message(),
      leader
        ? `Bu liderlikte ${owner} kişisi Lider olarak atanmış durumdadır. Bu kişi Lider olarak atanamaz.`
        : `Bu birimde ${owner} kişisi Product Owner olarak atanmış durumdadır. Bu kişi Product Owner olarak atanamaz.`,
    );
    await message.accept();
    await work;
  }
  try {
    await f.check(
      "resource roles: Product Owner persists and fills the team's read-only manager column",
      async () => {
        await editOwn();
        await dialog()
          .getByLabel("Kaynak Rolü", { exact: true })
          .selectOption("productOwner");
        await save();
        assert(
          (await f.state()).resources
            .find((r) => r.id === original.id)
            .versions.some((v) => v.assignmentRole === "productOwner"),
        );
        await tab("Liderlik ve Takımlar");
        const row = page
          .locator(".directory-team")
          .filter({ has: page.getByText(f.teamA.name, { exact: true }) });
        assert.equal(await row.locator("td").nth(2).innerText(), original.name);
        await row
          .getByRole("button", {
            name: f.teamA.name + " takımını düzenle",
            exact: true,
          })
          .click();
        assert.equal(
          await dialog()
            .getByLabel("Takım Yöneticisi", { exact: true })
            .inputValue(),
          original.name,
        );
        assert.notEqual(
          await dialog()
            .getByLabel("Takım Yöneticisi", { exact: true })
            .getAttribute("readonly"),
          null,
        );
        await dialog()
          .getByRole("button", { name: "Kapat", exact: true })
          .click();
        await dialog().waitFor({ state: "hidden" });
      },
    );
    await f.check(
      "resource roles: leader has no team picker and fills only its direct leadership manager",
      async () => {
        await draft("Synthetic Direct Leader", "leader");
        assert.equal(
          await dialog()
            .getByRole("button", { name: "Takım", exact: true })
            .count(),
          0,
        );
        await save();
        const worker = (await f.state()).resources.find(
          (r) => r.name === "Synthetic Direct Leader",
        );
        created.add(worker.id);
        assert.equal(worker.versions[0].assignmentRole, "leader");
        assert.equal(
          worker.versions[0].team,
          (await f.state()).leadershipUnits[f.teamA.lead],
        );
        await tab("Liderlik ve Takımlar");
        const row = page
          .locator(".directory-group")
          .filter({ has: page.getByText(f.teamA.lead, { exact: true }) });
        assert.equal(await row.locator("td").nth(2).innerText(), worker.name);
        await f.capture(page, "resource-role-managers");
      },
    );
    await f.check(
      "resource roles: duplicate leader opens a named popup and preserves the draft without a write",
      async () => {
        const before = await f.state();
        await draft("Synthetic Duplicate Leader", "leader");
        await expectPopup(
          () =>
            dialog()
              .getByRole("button", { name: "Kaydet", exact: true })
              .click(),
          "Synthetic Direct Leader",
          true,
        );
        assert.equal(
          await dialog().getByLabel("Ad Soyad", { exact: true }).inputValue(),
          "Synthetic Duplicate Leader",
        );
        assert.deepEqual(await f.state(), before);
        await cancel();
      },
    );
    await f.check(
      "resource roles: server rejects a leader claimed after the draft opens and retains the draft",
      async () => {
        await draft("Synthetic Stale Leader", "leader");
        await choose("Liderlik", f.teamB.lead);
        const state = await f.state(),
          id = "qa-competing-leader";
        await f.store.mutate(f.actor, (d, u) =>
          applyChanges(d, u, [
            {
              kind: "resource",
              id,
              revision: 0,
              value: {
                id,
                name: "Synthetic Competing Leader",
                note: "",
                versions: [
                  {
                    effective: "2026-01",
                    team: state.leadershipUnits[f.teamB.lead],
                    lead: f.teamB.lead,
                    assignmentRole: "leader",
                    status: "Aktif Çalışan",
                    start: "2026-01-01",
                    end: "",
                    included: false,
                    amount: 1,
                  },
                ],
              },
            },
          ]),
        );
        created.add(id);
        const before = await f.state();
        await expectPopup(() => save(400), "Synthetic Competing Leader", true);
        assert.equal(
          await dialog().getByLabel("Ad Soyad", { exact: true }).inputValue(),
          "Synthetic Stale Leader",
        );
        assert.deepEqual(await f.state(), before);
        await cancel();
      },
    );
    await f.check(
      "resource roles: duplicate Product Owner opens named popup and retains unsaved draft without a write",
      async () => {
        const before = await f.state();
        await draft("Synthetic Duplicate Owner", "productOwner");
        await expectPopup(
          () =>
            dialog()
              .getByRole("button", { name: "Kaydet", exact: true })
              .click(),
          original.name,
        );
        assert.equal(
          await dialog().getByLabel("Ad Soyad", { exact: true }).inputValue(),
          "Synthetic Duplicate Owner",
        );
        assert.deepEqual(await f.state(), before);
        await cancel();
      },
    );
    await f.check(
      "resource roles: server catches a competing owner added after the draft opens and the popup preserves it",
      async () => {
        await editOwn();
        await dialog()
          .getByLabel("Kaynak Rolü", { exact: true })
          .selectOption("member");
        await save();
        await draft("Synthetic Stale Owner", "productOwner");
        let state = await f.state();
        const own = state.resources.find((r) => r.id === original.id);
        await f.store.mutate(f.actor, (d, u) =>
          applyChanges(d, u, [
            {
              kind: "resource",
              id: own.id,
              revision: state.revisions["resource:" + own.id],
              value: {
                ...own,
                versions: own.versions.map((v) => ({
                  ...v,
                  assignmentRole: "productOwner",
                })),
              },
            },
          ]),
        );
        state = await f.state();
        await expectPopup(() => save(400), original.name);
        assert.equal(
          await dialog().getByLabel("Ad Soyad", { exact: true }).inputValue(),
          "Synthetic Stale Owner",
        );
        assert.deepEqual(await f.state(), state);
        await cancel();
      },
    );
    await f.check(
      "resource roles: changing Product Owner to Team Member removes the manager name and preserves account permissions",
      async () => {
        await page.reload();
        await editOwn();
        assert.equal(
          await dialog()
            .getByLabel("Kaynak Rolü", { exact: true })
            .inputValue(),
          "productOwner",
        );
        await dialog()
          .getByLabel("Kaynak Rolü", { exact: true })
          .selectOption("member");
        await save();
        await tab("Liderlik ve Takımlar");
        assert.equal(
          await page
            .locator(".directory-team")
            .filter({ has: page.getByText(f.teamA.name, { exact: true }) })
            .locator("td")
            .nth(2)
            .innerText(),
          "—",
        );
        assert.equal(
          (await f.store.findUser({ id: "employee" })).role,
          "normal",
        );
      },
    );
  } finally {
    await f.store.mutate(f.actor, (d, u) =>
      applyChanges(d, u, [
        {
          kind: "resource",
          id: original.id,
          revision: d.revisions["resource:" + original.id],
          value: original,
        },
        ...[...created].map((id) => ({
          kind: "resource",
          id,
          revision: d.revisions["resource:" + id],
          value: null,
          operation: "delete",
        })),
      ]),
    );
  }
}
