import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";
export async function checkReportOwnerSource(f) {
  const state = await f.state();
  const unit = state.leadershipUnits[f.teamA.lead];
  assert(unit);
  const resource = (id, name, team, role) => ({
    id,
    name,
    note: "",
    versions: [
      {
        effective: "2026-01",
        start: "2026-01-01",
        end: "",
        team,
        lead: f.teamA.lead,
        assignmentRole: role,
        status: "Aktif Çalışan",
        included: false,
        amount: 1,
      },
    ],
  });
  const owners = [
    resource("qa-report-leader", "QA Assigned Leader", unit, "leader"),
    resource(
      "qa-report-po",
      "QA Assigned Product Owner",
      f.teamA.id,
      "productOwner",
    ),
  ];
  await f.store.mutate(f.actor, (d, u) =>
    applyChanges(
      d,
      u,
      owners.map((value) => ({
        kind: "resource",
        id: value.id,
        value,
        revision: 0,
      })),
    ),
  );
  await f.store.mutate(f.actor, (d) => {
    for (const team of d.teams) team.managerName = "QA Legacy Manager";
    return d;
  });
  const c = await f.client("root-admin");
  const { page } = c;
  try {
    await f.check(
      "workspace filters: employee responsibility labels use smaller text, search by owner and preserve IDs",
      async () => {
        await page
          .getByRole("tab", {
            name: "AA Planlanan Kaynak Dağılımı",
            exact: true,
          })
          .click();
        const panel = () => page.locator('.pickerpanel[data-state="open"]');
        for (const [label, name, owner] of [
          ["Liderlik", f.teamA.lead, owners[0].name],
          ["Takım", f.teamA.name, owners[1].name],
        ]) {
          const trigger = page.getByRole("button", {
            name: label,
            exact: true,
          });
          await trigger.click();
          const checkbox = panel().getByRole("checkbox", { name, exact: true });
          const row = checkbox.locator("xpath=..");
          const description = row.locator(".picker-item-description");
          assert.equal((await description.innerText()).trim(), "- " + owner);
          const sizes = await row.evaluate((n) => ({
            name: parseFloat(
              getComputedStyle(n.querySelector(".picker-item-label > span"))
                .fontSize,
            ),
            description: parseFloat(
              getComputedStyle(n.querySelector("small")).fontSize,
            ),
          }));
          assert(sizes.description < sizes.name);
          const id = await description.getAttribute("id");
          assert.equal(await checkbox.getAttribute("aria-describedby"), id);
          await panel().getByRole("textbox").fill(owner);
          assert.equal(await panel().getByRole("checkbox").count(), 1);
          await checkbox.check();
          await f.capture(
            page,
            "filter-owner-" + (label === "Liderlik" ? "leader" : "team"),
          );
          await page.keyboard.press("Escape");
          assert.match(await trigger.innerText(), new RegExp(owner));
          assert.equal(
            await trigger.getAttribute("title"),
            name + " - " + owner,
          );
        }
        await page.getByRole("button", { name: "Takım", exact: true }).click();
        await panel()
          .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
          .click();
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", { name: "Liderlik", exact: true })
          .click();
        const unassigned = panel()
          .getByRole("checkbox", { name: f.teamB.lead, exact: true })
          .locator("xpath=..");
        assert.equal(
          await unassigned.locator(".picker-item-description").count(),
          0,
        );
        assert.equal((await unassigned.innerText()).trim(), f.teamB.lead);
        await panel()
          .getByRole("button", { name: "Seçimleri Kaldır", exact: true })
          .click();
        await page.keyboard.press("Escape");
      },
    );
    await f.check(
      "planned allocation: both grouping directions show current owners without legacy names",
      async () => {
        const query = new URLSearchParams({
          allocation: "full",
          view: "project",
          start: "2026-01",
          count: "12",
          project: "p-a",
          lead: f.teamA.lead,
        });
        for (const [id, name] of [
          [unit, owners[0].name],
          [f.teamA.id, owners[1].name],
        ]) {
          query.set("view", "project");
          await page.goto(f.origin + "/?" + query);
          const row = page.locator(`[data-planning-owner="${id}"]`);
          await row.waitFor();
          assert.match(
            await row.locator(".team-manager").innerText(),
            new RegExp(name),
          );
          query.set("view", "team");
          await page.goto(f.origin + "/?" + query);
          const heading = page.locator(`[data-planning-group="${id}"]`);
          await heading.waitFor();
          assert.match(
            await heading.innerText(),
            new RegExp("Yönetici: " + name),
          );
        }
        assert.equal(
          await page
            .locator(".allocation-grid")
            .getByText(/QA Legacy Manager/)
            .count(),
          0,
        );
        // A manager outside this leadership sees organisational owner names without
        // gaining named personal records or permission to edit those rows.
        const account = await f.store.findUser({ id: "manager" });
        await f.store.bootstrapUser({
          ...account,
          _id: "owner-view-manager",
          username: "qa.owner-view-manager",
          leaders: [f.teamB.lead],
        });
        const manager = await f.client("owner-view-manager");
        try {
          query.set("view", "project");
          await manager.page.goto(f.origin + "/?" + query);
          const row = manager.page.locator(
            `[data-planning-owner="${f.teamA.id}"]`,
          );
          await row.waitFor();
          assert.match(
            await row.locator(".team-manager").innerText(),
            new RegExp(owners[1].name),
          );
          assert(await row.locator("input").first().isDisabled());
          const response = await manager.context.request.get(
            f.origin + "/api/data",
          );
          const data = (await response.json()).data;
          assert.equal(
            data.resources.find((r) => r.id === owners[1].id).name,
            "",
          );
          assert.equal(data.planningUnitManagers[f.teamA.id], owners[1].name);
        } finally {
          await manager.context.close();
        }
      },
    );
    await page.goto(f.origin);
    await f.check(
      "resource report: manager cells follow Leader and Product Owner employee assignments",
      async () => {
        await page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .click();
        await page
          .locator(".leader-report")
          .getByText("QA Assigned Leader", { exact: true })
          .waitFor();
        await page
          .locator(".team-report")
          .getByText("QA Assigned Product Owner", { exact: true })
          .waitFor();
        assert.equal(
          await page
            .locator(".team-report")
            .getByText("QA Assigned Leader", { exact: true })
            .count(),
          1,
        );
      },
    );
    await f.check(
      "resource report: removed roles clear manager cells; planned direct-unit subtitle is absent",
      async () => {
        await f.store.mutate(f.actor, (d, u) =>
          applyChanges(
            d,
            u,
            owners.map((value) => ({
              kind: "resource",
              id: value.id,
              value: {
                ...value,
                versions: value.versions.map((v) => ({
                  ...v,
                  ...(v.assignmentRole === "leader"
                    ? { status: "İşten Ayrıldı", end: "2026-10-01" }
                    : { assignmentRole: "member" }),
                })),
              },
              revision: d.revisions["resource:" + value.id],
            })),
          ),
        );
        await page.reload();
        await page
          .getByRole("tab", {
            name: "AA Kaynak Planlama Raporları",
            exact: true,
          })
          .click();
        assert.equal(
          await page
            .locator(".remaining-report")
            .getByText(/QA Assigned/)
            .count(),
          0,
        );
        await page
          .getByRole("tab", {
            name: "AA Planlanan Kaynak Dağılımı",
            exact: true,
          })
          .click();
        assert.equal(await page.locator(".leadership-unit-label").count(), 0);
        assert.equal(
          await page
            .locator(".allocation-grid")
            .getByText(/QA Assigned|QA Legacy Manager/)
            .count(),
          0,
        );
        await page.goto(
          f.origin +
            "/?" +
            new URLSearchParams({
              allocation: "full",
              view: "team",
              start: "2026-01",
              count: "12",
              project: "p-a",
              lead: f.teamA.lead,
            }),
        );
        const cleared = page.locator(`[data-planning-group="${f.teamA.id}"]`);
        await cleared.waitFor();
        assert.match(await cleared.innerText(), /Yönetici: Atanmamış/);
        for (const label of ["Liderlik", "Takım"]) {
          await page.getByRole("button", { name: label, exact: true }).click();
          assert.equal(
            await page
              .locator(
                '.pickerpanel[data-state="open"] .picker-item-description',
              )
              .count(),
            0,
          );
          await page.keyboard.press("Escape");
        }
      },
    );
  } finally {
    await c.context.close();
  }
}
