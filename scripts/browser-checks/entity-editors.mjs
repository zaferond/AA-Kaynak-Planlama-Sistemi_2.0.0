import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";

export async function checkEntityEditors(f) {
  const client = await f.client("root-admin"),
    page = client.page;
  const original = (await f.state()).projects.find((p) => p.id === "p-a");
  try {
    await page.getByRole("tab", { name: /AA Mühendislik.*Projeler/ }).click();
    const heading = page.locator('[data-project-heading="p-a"]');
    await heading.waitFor();
    const field = () => page.getByLabel("Proje Adı", { exact: true });
    const dialog = () => page.getByRole("dialog");
    async function incoming(text, failure = false) {
      let release,
        started = false;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const hold = async (route) => {
        started = true;
        await gate;
        if (failure)
          await route.fulfill({
            status: 503,
            json: { error: "Synthetic read failure" },
          });
        else await route.fulfill({ response: await route.fetch() });
      };
      await page.route("**/api/data", hold, { times: 1 });
      try {
        await page.evaluate(() =>
          window.dispatchEvent(
            new StorageEvent("storage", { key: "kaynak-planlama-offline-v1" }),
          ),
        );
        await f.wait(() => started, "background read started");
        await heading.locator(".project-name-copy button").click();
        await dialog().waitFor();
        await field().fill(text);
        if (!failure) {
          const state = await f.state(),
            actor = await f.store.findUser({ id: "admin-edit" });
          await f.store.mutate(actor, (d, u) =>
            applyChanges(d, u, [
              {
                kind: "project",
                id: "p-a",
                revision: state.revisions["project:p-a"],
                value: {
                  ...d.projects.find((p) => p.id === "p-a"),
                  responsibleName: "Remote synthetic owner " + text,
                },
              },
            ]),
          );
        }
        const response = page.waitForResponse((r) =>
          r.url().endsWith("/api/data"),
        );
        release();
        await response;
        if (!failure)
          await f.wait(
            async () =>
              (await heading.innerText()).includes(
                "Remote synthetic owner " + text,
              ),
            "new snapshot rendered",
          );
        else
          await page
            .locator(".alert")
            .filter({ hasText: "Synthetic read failure" })
            .waitFor();
      } finally {
        release();
        await page.unroute("**/api/data", hold);
      }
    }
    await f.check(
      "entity editors: refresh cannot rebase a project draft; 409 preserves draft and remote change",
      async () => {
        const revision = (await f.state()).revisions["project:p-a"];
        await incoming("Local synthetic draft");
        const saved = page.waitForResponse((r) =>
          r.url().endsWith("/api/changes"),
        );
        await dialog()
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        const response = await saved;
        assert.equal(response.status(), 409);
        assert.equal(
          response.request().postDataJSON().changes[0].revision,
          revision,
        );
        assert.equal(await field().inputValue(), "Local synthetic draft");
        assert.equal(
          (await f.state()).projects.find((p) => p.id === "p-a")
            .responsibleName,
          "Remote synthetic owner Local synthetic draft",
        );
        // Receiving 409 precedes React's saving=false render. Escape is
        // intentionally blocked while saving; wait for the visible UI to settle.
        await f.wait(
          () =>
            dialog()
              .getByRole("button", { name: "Kaydet", exact: true })
              .isEnabled(),
          "failed editor write settled before Escape",
        );
        await page.keyboard.press("Escape");
        await dialog().waitFor({ state: "hidden" });
      },
    );
    await f.check(
      "entity editors: deletion also retains opening revision after refresh",
      async () => {
        const revision = (await f.state()).revisions["project:p-a"];
        await incoming("Delete draft");
        page.once("dialog", (d) => d.accept());
        const saved = page.waitForResponse((r) =>
          r.url().endsWith("/api/changes"),
        );
        await dialog()
          .getByRole("button", { name: /Projeyi Sil/ })
          .click();
        const response = await saved;
        assert.equal(response.status(), 409);
        assert.equal(
          response.request().postDataJSON().changes[0].revision,
          revision,
        );
        assert((await f.state()).projects.some((p) => p.id === "p-a"));
        assert.equal(await field().inputValue(), "Delete draft");
        // Receiving 409 precedes React's saving=false render. Escape is
        // intentionally blocked while saving; wait for the visible UI to settle.
        await f.wait(
          () =>
            dialog()
              .getByRole("button", { name: "Kaydet", exact: true })
              .isEnabled(),
          "failed editor write settled before Escape",
        );
        await page.keyboard.press("Escape");
        await dialog().waitFor({ state: "hidden" });
      },
    );
    await f.check(
      "entity editors: temporary 503 keeps the open draft and retry saves successfully",
      async () => {
        await incoming("Retry synthetic draft", true);
        assert.equal(await field().inputValue(), "Retry synthetic draft");
        const saved = page.waitForResponse((r) =>
          r.url().endsWith("/api/changes"),
        );
        await dialog()
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        assert.equal((await saved).status(), 200);
        await dialog().waitFor({ state: "hidden" });
        assert.equal(
          (await f.state()).projects.find((p) => p.id === "p-a").name,
          "Retry synthetic draft",
        );
      },
    );
  } finally {
    await client.context.close();
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
  await f.check(
    "own resource: transfer outside account leadership preserves own actual inputs without revealing other employees",
    async () => {
      const originalResource = (await f.state()).resources.find(
        (r) => r.id === "r-own",
      );
      let c;
      try {
        await f.store.mutate(f.actor, (d, u) =>
          applyChanges(d, u, [
            {
              kind: "resource",
              id: originalResource.id,
              revision: d.revisions["resource:" + originalResource.id],
              value: {
                ...originalResource,
                versions: originalResource.versions.map((v) => ({
                  ...v,
                  team: f.teamB.id,
                  lead: f.teamB.lead,
                })),
              },
            },
          ]),
        );
        c = await f.client("employee");
        await c.page
          .getByRole("tab", {
            name: "AA Gerçekleşen Kaynak Dağılımı",
            exact: true,
          })
          .click();
        await c.page
          .getByRole("textbox", {
            name: "Browser Employee / Browser Project A / 2026-01 / %",
            exact: true,
          })
          .waitFor();
        assert.equal(
          await c.page
            .getByRole("button", {
              name: "Browser Other Employee izin ve eğitim takvimini aç",
              exact: true,
            })
            .count(),
          0,
        );
        const response = await c.context.request.get(f.origin + "/api/data");
        const view = (await response.json()).data;
        assert(view.resources.some((r) => r.id === "r-own"));
        assert(!view.resources.some((r) => r.id === "r-other"));
        assert(!view.teams.some((t) => t.id === f.teamB.id));
      } finally {
        await c?.context.close();
        await f.store.mutate(f.actor, (d, u) =>
          applyChanges(d, u, [
            {
              kind: "resource",
              id: originalResource.id,
              revision: d.revisions["resource:" + originalResource.id],
              value: originalResource,
            },
          ]),
        );
      }
    },
  );
}
