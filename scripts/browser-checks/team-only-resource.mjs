import { statuses } from "../../shared/model.ts";
import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";
import { selectWorkspaceTab } from "./fixture.mjs";

export async function checkTeamOnlyResource(f) {
  const independent = {
    ...f.teamA,
    id: "qa-independent-resource-team",
    name: "Synthetic independent team",
    lead: "",
    catalog: false,
  };
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(d, u, [
      { kind: "team", id: independent.id, value: independent, revision: 0 },
    ]),
  );
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(
      d,
      u,
      statuses.map((status, i) => ({
        kind: "resource",
        id: "qa-status-" + i,
        revision: 0,
        value: {
          id: "qa-status-" + i,
          name: "Synthetic status " + i,
          note: "",
          versions: [
            {
              effective: "2026-01",
              start: "2026-01-01",
              end: status === "İşten Ayrıldı" ? "2026-12-31" : "",
              team: f.teamA.id,
              lead: f.teamA.lead,
              assignmentRole: "member",
              status,
              included: !status.includes("İlan"),
              amount: 1,
            },
          ],
        },
      })),
    ),
  );
  await f.store.transaction(async (c) => {
    const user = await f.store.findUser({ id: "employee" }, c);
    await f.store.saveUser(
      {
        ...user,
        authSource: "ldap",
        directoryId: "a".repeat(32),
        email: "synthetic.long.directory.address@example.invalid",
      },
      c,
    );
  });
  const { page } = await f.client("root-admin");
  const dialog = () => page.getByRole("dialog");
  try {
    await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
    await f.check(
      "employee table: AD email has its own wrapping column and remains searchable",
      async () => {
        assert.equal(
          await page
            .getByRole("columnheader", { name: "E-posta Adresi", exact: true })
            .count(),
          1,
        );
        assert.equal(
          await page
            .getByRole("columnheader", {
              name: "Kaynak Planına Dahil",
              exact: true,
            })
            .count(),
          1,
        );
        assert.equal(
          await page
            .getByRole("columnheader", { name: "Açıklama", exact: true })
            .count(),
          1,
        );
        const description = page.locator(
          '[data-resource-id="r-own"] .resource-description',
        );
        assert.equal(await description.innerText(), "PRIVATE_HR_TEST_NOTE");
        assert.equal(
          await description.evaluate((e) => getComputedStyle(e).whiteSpace),
          "pre-wrap",
        );
        const cell = page.locator(
          '[data-account-id="employee"] .account-email',
        );
        assert.equal(
          await cell.innerText(),
          "synthetic.long.directory.address@example.invalid",
        );
        assert.equal(
          await cell.evaluate((c) => getComputedStyle(c).overflowWrap),
          "anywhere",
        );
        await page
          .getByRole("textbox", { name: "Kaynak ara", exact: true })
          .fill("synthetic.long.directory.address@example.invalid");
        assert.equal(await page.locator(".resource-table tbody tr").count(), 1);
        await page
          .getByRole("textbox", { name: "Kaynak ara", exact: true })
          .fill("");
      },
    );
    await f.check(
      "employee table: all status badges use distinct background colors",
      async () => {
        const colors = [];
        for (const status of statuses) {
          const badge = page
            .locator("[data-resource-status]")
            .filter({ hasText: status })
            .first();
          assert(await badge.count());
          colors.push(
            await badge.evaluate((e) => getComputedStyle(e).backgroundColor),
          );
        }
        assert.equal(new Set(colors).size, statuses.length);
        await f.capture(page, "employee-status-colors");
      },
    );
    for (const role of ["member", "productOwner", "coe"]) {
      for (const team of [f.teamA, independent]) {
        await f.check(
          `resource ${role}: only ${team === independent ? "independent" : "assigned"} team required, no leadership choice`,
          async () => {
            const name = `Synthetic team-only ${role} ${team.id}`;
            await page
              .getByRole("button", {
                name: "Kaynak Ekle / Yetki Tanımla",
                exact: true,
              })
              .click();
            assert.equal(
              await dialog()
                .getByLabel("Kişi Eşdeğeri", { exact: true })
                .count(),
              0,
            );
            const firstField = dialog()
              .locator(".employee-resource-fields")
              .locator(".pick, label")
              .first();
            assert.equal(
              (await firstField.innerText()).split("\n")[0],
              "Statü",
            );
            await dialog().getByLabel("Ad Soyad", { exact: true }).fill(name);
            await dialog()
              .getByLabel("Kaynak Rolü", { exact: true })
              .selectOption(role);
            await dialog()
              .getByRole("button", { name: "Takım", exact: true })
              .click();
            const picker = page.locator('.pickerpanel[data-state="open"]');
            await picker.getByRole("textbox").fill(team.name);
            await picker
              .getByRole("button", {
                name: team.name,
                exact: true,
              })
              .click();
            const leadership = dialog().getByLabel("Liderlik", { exact: true });
            assert.equal(await leadership.getAttribute("readonly"), "");
            assert.equal(await leadership.inputValue(), team.lead || "");
            assert.equal(
              await dialog()
                .getByRole("button", { name: "Liderlik", exact: true })
                .count(),
              0,
            );
            await dialog()
              .getByRole("button", { name: "Takım", exact: true })
              .click();
            const allTeams = page.locator('.pickerpanel[data-state="open"]');
            assert.equal(
              await allTeams
                .getByRole("button", { name: f.teamB.name, exact: true })
                .count(),
              1,
            );
            assert.equal(
              await allTeams
                .getByRole("button", { name: independent.name, exact: true })
                .count(),
              1,
            );
            await page.keyboard.press("Escape");
            const response = page.waitForResponse(
              (r) =>
                r.url().endsWith("/api/changes") &&
                r.request().method() === "POST",
            );
            await dialog()
              .getByRole("button", { name: "Kaydet", exact: true })
              .click();
            assert.equal((await response).status(), 200);
            await dialog().waitFor({ state: "hidden" });
            const saved = (await f.state()).resources.find(
              (r) => r.name === name,
            );
            assert(saved);
            assert.equal(saved.versions.at(-1).assignmentRole, role);
            assert.equal(saved.versions.at(-1).team, team.id);
            assert.equal(saved.versions.at(-1).lead || "", team.lead || "");
          },
        );
      }
    }
    for (const status of ["Aktif İlan", "Pasif İlan"]) {
      await f.check(
        `resource posting: ${status} hides employee fields and saves inline without a name or role`,
        async () => {
          await page
            .getByRole("button", {
              name: "Kaynak Ekle / Yetki Tanımla",
              exact: true,
            })
            .click();
          const chooseStatus = async (next) => {
            await dialog()
              .getByRole("button", { name: "Statü", exact: true })
              .click();
            await page
              .locator('.pickerpanel[data-state="open"]')
              .getByRole("button", { name: next, exact: true })
              .click();
          };
          await chooseStatus(status);
          assert.equal(
            await dialog().getByLabel("Ad Soyad", { exact: true }).count(),
            0,
          );
          assert.equal(
            await dialog().getByLabel("Kaynak Rolü", { exact: true }).count(),
            0,
          );
          const passive = status === "Pasif İlan";
          assert.equal(
            await dialog()
              .getByLabel("Tahmini İşbaşı Tarihi", { exact: true })
              .count(),
            passive ? 0 : 1,
          );
          assert.equal(
            await dialog().getByRole("switch").count(),
            passive ? 0 : 1,
          );
          // Changing back to an employee restores the fields and employee defaults.
          await chooseStatus("Aktif Çalışan");
          assert.equal(
            await dialog().getByLabel("Ad Soyad", { exact: true }).count(),
            1,
          );
          assert.equal(
            await dialog().getByLabel("Kaynak Rolü", { exact: true }).count(),
            1,
          );
          assert.equal(
            await dialog()
              .getByLabel("İşbaşı Tarihi", { exact: true })
              .inputValue(),
            "2026-01-01",
          );
          assert.equal(
            await dialog().getByRole("switch").getAttribute("aria-checked"),
            "true",
          );
          await chooseStatus(status);
          if (!passive) {
            assert.equal(
              await dialog()
                .getByLabel("Tahmini İşbaşı Tarihi", { exact: true })
                .inputValue(),
              "",
            );
            await dialog()
              .getByLabel("Tahmini İşbaşı Tarihi", { exact: true })
              .fill("2026-10-16");
            await dialog().getByRole("switch").click();
          }
          await dialog()
            .getByRole("button", { name: "Takım", exact: true })
            .click();
          const picker = page.locator('.pickerpanel[data-state="open"]');
          await picker.getByRole("textbox").fill(f.teamA.name);
          await picker
            .getByRole("button", { name: f.teamA.name, exact: true })
            .click();
          assert.equal(
            await dialog().getByLabel("Liderlik", { exact: true }).inputValue(),
            f.teamA.lead,
          );
          assert.equal(
            await dialog()
              .getByLabel("Liderlik", { exact: true })
              .getAttribute("readonly"),
            "",
          );
          assert.equal(
            await dialog()
              .getByRole("button", { name: "Liderlik", exact: true })
              .count(),
            0,
          );
          await dialog()
            .getByRole("button", { name: "Takım", exact: true })
            .click();
          assert.equal(
            await page
              .locator('.pickerpanel[data-state="open"]')
              .getByRole("button", { name: f.teamB.name, exact: true })
              .count(),
            1,
          );
          await page.keyboard.press("Escape");
          const response = page.waitForResponse(
            (r) =>
              r.url().endsWith("/api/changes") &&
              r.request().method() === "POST",
          );
          await dialog()
            .getByRole("button", { name: "Kaydet", exact: true })
            .click();
          assert.equal((await response).status(), 200);
          await dialog().waitFor({ state: "hidden" });
          const saved = (await f.state()).resources.find(
            (r) => r.name === status,
          );
          assert(saved);
          const v = saved.versions.at(-1);
          assert.equal(v.status, status);
          assert.equal(v.assignmentRole, undefined);
          assert.equal(v.included, !passive);
          assert.equal(v.start, passive ? "" : "2026-10-16");
        },
      );
    }
  } finally {
    await page.close();
  }
}
