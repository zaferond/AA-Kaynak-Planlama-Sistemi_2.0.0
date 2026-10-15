import { selectWorkspaceTab } from "./fixture.mjs";
import assert from "node:assert/strict";
import { applyLeaderChange, applyChanges } from "../../backend/operations.mjs";
import { directoryRevision } from "../../shared/directory-policy.ts";

export async function checkLeadershipFilterRoots(f) {
  const child = "QA Filter Child",
    grand = "QA Filter Grandchild";
  for (const [name, parentName] of [
    [child, f.teamA.lead],
    [grand, child],
  ]) {
    await f.store.mutate(f.actor, (d, u, c, g) =>
      applyLeaderChange(
        d,
        u,
        {
          action: "create",
          name,
          parentName,
          catalogRevision: directoryRevision(d),
        },
        c,
        g,
      ),
    );
  }
  const units = [
    { ...f.teamA, id: "qa-child-team", name: "QA Child Team", lead: child },
    {
      ...f.teamA,
      id: "qa-grand-team",
      name: "QA Grandchild Team",
      lead: grand,
    },
    { ...f.teamA, id: "qa-po-one", name: "QA Independent PO One", lead: "" },
    { ...f.teamA, id: "qa-po-two", name: "QA Independent PO Two", lead: "" },
  ];
  const resources = units.map((team, index) => ({
    id: "qa-filter-worker-" + index,
    name: "QA Filter Worker " + index,
    note: "",
    versions: [
      {
        effective: "2026-01",
        start: "2026-01-01",
        end: "",
        team: team.id,
        lead: team.lead,
        status: "Aktif Çalışan",
        included: true,
        amount: 1,
      },
    ],
  }));
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(d, u, [
      ...units.map((value) => ({
        kind: "team",
        id: value.id,
        value,
        revision: 0,
      })),
      ...resources.map((value) => ({
        kind: "resource",
        id: value.id,
        value,
        revision: 0,
      })),
    ]),
  );
  const before = await f.state(),
    { page, context } = await f.client("root-admin");
  const open = async (label) => {
    await page.getByRole("button", { name: label, exact: true }).click();
    return page.locator('.pickerpanel[data-state="open"]');
  };
  const select = async (label, names) => {
    const panel = await open(label);
    await panel
      .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
      .click();
    for (const name of names)
      await panel.getByRole("checkbox", { name, exact: true }).check();
    await page.keyboard.press("Escape");
  };
  try {
    await f.check(
      "leadership filters: all leaderships, team-only choices and descendant scope across workspace tabs",
      async () => {
        for (const tab of [
          "AA Planlanan Kaynak Dağılımı",
          "AA Kaynak Planlama Raporları",
          "AA Gerçekleşen Kaynak Dağılımı",
          "AA Aylık Aktivite Raporu",
        ]) {
          await selectWorkspaceTab(page, tab);
          const panel = await open("Liderlik");
          assert.equal(
            await panel
              .getByRole("checkbox", { name: child, exact: true })
              .count(),
            1,
          );
          assert.equal(
            await panel
              .getByRole("checkbox", { name: grand, exact: true })
              .count(),
            1,
          );
          const names = await panel
            .getByRole("checkbox")
            .evaluateAll((nodes) =>
              nodes.map((n) => n.getAttribute("aria-label")),
            );
          assert(
            names.indexOf(f.teamA.lead) < names.indexOf(child) &&
              names.indexOf(child) < names.indexOf(grand),
            "Descendants are listed below their parent",
          );
          const parentOption = panel
            .getByRole("checkbox", { name: f.teamA.lead, exact: true })
            .locator("..");
          const childOption = panel
            .getByRole("checkbox", { name: child, exact: true })
            .locator("..");
          const grandOption = panel
            .getByRole("checkbox", { name: grand, exact: true })
            .locator("..");
          assert.equal(
            await childOption.getAttribute("data-leadership-parent"),
            f.teamA.lead,
          );
          assert.equal(
            await grandOption.getAttribute("data-leadership-parent"),
            child,
          );
          const padding = (option) =>
            option.evaluate((el) =>
              parseFloat(getComputedStyle(el).paddingInlineStart),
            );
          assert(
            (await padding(parentOption)) < (await padding(childOption)) &&
              (await padding(childOption)) < (await padding(grandOption)),
            "Hierarchy indentation is painted",
          );
          await page.keyboard.press("Escape");
          await select("Liderlik", [f.teamA.lead]);
          const teams = await open("Takım");
          const options = await teams
            .getByRole("checkbox")
            .evaluateAll((nodes) =>
              nodes.map((n) => n.getAttribute("aria-label")),
            );
          const expectedOptions = before.teams
            .filter(
              (t) =>
                t.kind !== "leadership" &&
                [f.teamA.lead, child, grand].includes(t.lead),
            )
            .map((t) => t.name);
          assert.deepEqual(options.toSorted(), expectedOptions.toSorted());
          for (const name of [units[0].name, units[1].name])
            assert.equal(
              await teams.getByRole("checkbox", { name, exact: true }).count(),
              1,
              tab,
            );
          assert.equal(
            await teams
              .getByRole("checkbox", { name: f.teamB.name, exact: true })
              .count(),
            0,
            tab,
          );
          for (const team of units.slice(2)) {
            assert.equal(
              await teams
                .getByRole("checkbox", { name: team.name, exact: true })
                .count(),
              0,
              tab,
            );
          }
          await page.keyboard.press("Escape");
          if (tab === "AA Aylık Aktivite Raporu")
            await page
              .locator('[data-activity-resource="qa-filter-worker-1"]')
              .waitFor();
          // Retain the selected child team when selecting its root again.
          await select("Takım", [units[1].name]);
          await select("Liderlik", [f.teamA.lead]);
          const retained = await open("Takım");
          assert.equal(
            await retained
              .getByRole("checkbox", { name: units[1].name, exact: true })
              .isChecked(),
            true,
          );
          await page.keyboard.press("Escape");
          await select("Takım", []);
          await select("Liderlik", [child]);
          const childPicker = await open("Takım");
          const childOptions = await childPicker
            .getByRole("checkbox")
            .evaluateAll((nodes) =>
              nodes.map((n) => n.getAttribute("aria-label")),
            );
          assert.deepEqual(
            childOptions.toSorted(),
            [units[0].name, units[1].name].toSorted(),
          );
          await page.keyboard.press("Escape");
          await select("Takım", [units[0].name]);
          await select("Liderlik", [grand]);
          const grandPicker = await open("Takım");
          assert.equal(await grandPicker.getByRole("checkbox").count(), 1);
          assert.equal(
            await grandPicker
              .getByRole("checkbox", { name: units[1].name, exact: true })
              .isChecked(),
            false,
          );
          await page.keyboard.press("Escape");
          await select("Liderlik", [f.teamA.lead]);
        }
      },
    );
    await f.check(
      "permission grants: manager hierarchy matches filters and searching does not add parent grants",
      async () => {
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        assert.equal(await page.locator(".planning-filterbar").count(), 0);
        await page
          .locator('tr[data-account-id="employee"]')
          .getByRole("button", { name: "Düzenle", exact: true })
          .click();
        const dialog = page.locator(
          '.employee-access-editor[data-state="open"]',
        );
        assert.equal(await dialog.locator(".access-leader-field").count(), 0);
        await dialog.getByLabel("Rol", { exact: true }).selectOption("manager");
        const grants = dialog.getByRole("group", {
          name: "Planlanan Kaynak Dağılımı Yetkisi",
          exact: true,
        });
        const childBox = grants.getByRole("checkbox", {
          name: child,
          exact: true,
        });
        const grandBox = grants.getByRole("checkbox", {
          name: grand,
          exact: true,
        });
        assert.equal(
          await childBox.locator("..").getAttribute("data-leadership-parent"),
          f.teamA.lead,
        );
        assert.equal(
          await grandBox.locator("..").getAttribute("data-leadership-parent"),
          child,
        );
        assert(
          Number(
            await childBox.locator("..").getAttribute("data-leadership-depth"),
          ) <
            Number(
              await grandBox
                .locator("..")
                .getAttribute("data-leadership-depth"),
            ),
        );
        await grants
          .getByRole("button", { name: "Seçimi Temizle", exact: true })
          .click();
        const initialChecked = await grants
          .locator('input[type="checkbox"]:checked')
          .count();
        await grants
          .getByRole("textbox", {
            name: "Liderlik veya takım ara",
            exact: true,
          })
          .fill(grand);
        assert.equal(
          await grants.locator('[data-permission-kind="leader"] input').count(),
          3,
        );
        await grandBox.check();
        await grandBox.uncheck();
        await grants
          .getByRole("textbox", {
            name: "Liderlik veya takım ara",
            exact: true,
          })
          .fill("");
        assert.equal(
          await grants.locator('input[type="checkbox"]:checked').count(),
          initialChecked,
        );
        await grandBox.scrollIntoViewIfNeeded();
        await f.capture(page, "permission-leadership-hierarchy");
        await dialog
          .getByRole("button", { name: "Vazgeç", exact: true })
          .click();
        assert.deepEqual(await f.state(), before);
      },
    );
    await f.check(
      "root reports: independent units remain distinct, descendants aggregate once and requested headings render",
      async () => {
        await page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .click();
        await select("Takım", []);
        await select("Liderlik", []);
        const report = page.locator(".leader-report");
        for (const team of units.slice(2))
          assert.equal(
            await report
              .locator(".report-unit-title > span")
              .getByText(team.name, { exact: true })
              .count(),
            1,
          );
        for (const name of [child, grand])
          assert.equal(
            await report
              .locator(".report-unit-name")
              .getByText(name, { exact: true })
              .count(),
            1,
          );
        assert.equal(
          await report
            .getByText("Liderlik eşleştirilmemiş", { exact: true })
            .count(),
          0,
        );
        for (const name of [
          "Liderlik Bazında Eksik Raporu",
          "Takım Bazında Eksik Kaynak Raporu",
        ])
          await page.getByRole("heading", { name, exact: true }).waitFor();
        await select("Liderlik", [f.teamA.lead]);
        assert.equal(
          await report.locator('tbody tr[data-report-depth="0"]').count(),
          1,
        );
        assert.equal(await report.locator("tbody tr").count(), 3);
        assert((await report.innerText()).includes(f.teamA.lead));
        for (const [name, depth, expected] of [
          [f.teamA.lead, 0, "3"],
          [child, 1, "2"],
          [grand, 2, "1"],
        ]) {
          const row = report.locator(`tr[data-report-leader="${name}"]`);
          assert.equal(
            await row.getAttribute("data-report-depth"),
            String(depth),
          );
          assert.equal(
            (await row.locator("td").nth(2).innerText()).trim(),
            expected,
          );
        }
        assert.equal(
          (
            await report.locator('[data-total-month="2026-01"]').innerText()
          ).trim(),
          "3",
        );
        assert.equal(
          (
            await page
              .locator('.team-report [data-total-month="2026-01"]')
              .innerText()
          ).trim(),
          "3",
        );

        await f.capture(page, "root-leadership-report");
      },
    );
    await f.check(
      "resource editor: team drives read-only leadership without narrowing teams; bulk editor retains its filter",
      async () => {
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        assert.equal(await page.locator(".planning-filterbar").count(), 0);
        const dialog = page.getByRole("dialog");
        const chooseSingle = async (label, value) => {
          await dialog
            .getByRole("button", { name: label, exact: true })
            .click();
          const panel = page.locator('.pickerpanel[data-state="open"]');
          await panel.getByRole("textbox").fill(value);
          await panel.getByRole("button", { name: value, exact: true }).click();
        };
        const checkTeams = async (label, hasLeader) => {
          await dialog
            .getByRole("button", { name: label, exact: true })
            .click();
          const panel = page.locator('.pickerpanel[data-state="open"]');
          for (const team of units.slice(2))
            assert.equal(
              await panel
                .getByRole("button", { name: new RegExp(team.name) })
                .count(),
              hasLeader ? 0 : 1,
            );
          if (hasLeader) {
            assert.equal(
              await panel
                .getByRole("button", { name: f.teamA.name, exact: true })
                .count(),
              1,
            );
            assert.equal(
              await panel
                .getByRole("button", { name: f.teamB.name, exact: true })
                .count(),
              0,
            );
          }
          await page.keyboard.press("Escape");
        };
        await page
          .getByRole("button", {
            name: "Kaynak Ekle / Yetki Tanımla",
            exact: true,
          })
          .click();
        await checkTeams("Takım", false);
        assert.equal(
          await dialog
            .getByRole("button", { name: "Liderlik", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await dialog
            .getByLabel("Liderlik", { exact: true })
            .getAttribute("readonly"),
          "",
        );
        await chooseSingle("Takım", f.teamA.name);
        assert.equal(
          await dialog.getByLabel("Liderlik", { exact: true }).inputValue(),
          f.teamA.lead,
        );
        await checkTeams("Takım", false);
        await chooseSingle("Takım", f.teamB.name);
        assert.equal(
          await dialog.getByLabel("Liderlik", { exact: true }).inputValue(),
          f.teamB.lead,
        );
        await checkTeams("Takım", false);
        await chooseSingle("Takım", "Seçin");
        assert.equal(
          await dialog.getByLabel("Liderlik", { exact: true }).inputValue(),
          "",
        );
        await dialog
          .getByRole("button", { name: "Close", exact: true })
          .click();
        await page.getByLabel("Browser Employee seç", { exact: true }).check();
        await page
          .getByRole("button", {
            name: "Seçilenleri Toplu Düzenle",
            exact: true,
          })
          .click();
        await checkTeams("Yeni takım", false);
        await chooseSingle("Liderlik filtresi", f.teamA.lead);
        await checkTeams("Yeni takım", true);
        await chooseSingle("Liderlik filtresi", "Tüm liderlikler");
        await checkTeams("Yeni takım", false);
        await dialog
          .getByRole("button", { name: "Close", exact: true })
          .click();
        await page
          .getByLabel("Browser Employee seç", { exact: true })
          .uncheck();
        assert.deepEqual(await f.state(), before);
      },
    );
    await f.check(
      "assignment and directory: child leaderships stay assignable; derived managers are read-only",
      async () => {
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        await page
          .getByRole("button", {
            name: "Kaynak Ekle / Yetki Tanımla",
            exact: true,
          })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog
          .getByLabel("Kaynak Rolü", { exact: true })
          .selectOption("leader");
        await dialog
          .getByRole("button", { name: "Liderlik", exact: true })
          .click();
        const panel = page.locator('.pickerpanel[data-state="open"]');
        assert((await panel.innerText()).includes(grand));
        await page.keyboard.press("Escape");
        await dialog
          .getByRole("button", { name: "Close", exact: true })
          .click();
        await selectWorkspaceTab(page, "Liderlik ve Takımlar");
        for (const [button, label, record] of [
          [
            "Liderlikleri Yönet",
            "Liderlik Yöneticisi",
            "Liderlik: " + f.teamA.lead,
          ],
          ["Takımları Yönet", "Takım Yöneticisi", "Takım: " + units[0].name],
        ]) {
          await page.getByRole("button", { name: button, exact: true }).click();
          await dialog
            .getByRole("button", { name: record, exact: true })
            .click();
          const input = dialog.getByLabel(label, { exact: true });
          assert.notEqual(await input.getAttribute("readonly"), null);
          assert.equal(await input.getAttribute("aria-readonly"), "true");
          const original = await input.inputValue();
          await input.click();
          await page.keyboard.type("Cannot Edit");
          assert.equal(await input.inputValue(), original);
          assert(
            (await dialog.innerText()).includes("Çalışan & Yetki Tanımlama"),
          );
          await dialog
            .getByRole("button", { name: "Close", exact: true })
            .click();
        }
        assert.deepEqual(await f.state(), before);
      },
    );
  } catch (error) {
    await f.capture(page, "leadership-filter-failed").catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
