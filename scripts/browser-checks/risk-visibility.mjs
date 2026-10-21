import { selectWorkspaceTab } from "./fixture.mjs";
import assert from "node:assert/strict";

export async function checkRiskVisibility(f) {
  const before = (await f.state()).risks;
  for (const id of ["root-admin", "manager", "employee"]) {
    const { page, context } = await f.client(id);
    try {
      await f.check(
        `risk visibility: hidden for ${id}, absent from opening tabs, project page remains available`,
        async () => {
          assert.equal(
            await page
              .getByRole("tab", {
                name: "Risk Yönetimi",
                exact: true,
                // The closed main menu still lists the tab.
                includeHidden: true,
              })
              .count(),
            0,
          );
          assert.equal(
            await page.locator('select option[value="risk"]').count(),
            0,
          );
          await selectWorkspaceTab(page, "Projeler");
          assert.equal(await page.locator(".risk-register").count(), 0);
          assert.equal(
            await page
              .getByRole("button", { name: "Risk Ekle", exact: true })
              .count(),
            0,
          );
          await page.reload();
          assert.equal(
            await page
              .getByRole("tab", {
                name: "Risk Yönetimi",
                exact: true,
                // The closed main menu still lists the tab.
                includeHidden: true,
              })
              .count(),
            0,
          );
        },
      );
    } finally {
      await context.close();
    }
  }
  assert.deepEqual((await f.state()).risks, before);
}
