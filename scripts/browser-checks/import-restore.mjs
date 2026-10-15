import { selectWorkspaceTab } from "./fixture.mjs";
import assert from "node:assert/strict";
import path from "node:path";
import { applyChanges } from "../../backend/operations.mjs";
import { workbook, download, zipEntries, validateXml } from "./files.mjs";

export async function checkImportRestore(f) {
  const { page } = await f.client("root-admin");
  try {
    await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
    await page
      .getByRole("button", { name: "Excel İçe Aktar", exact: true })
      .click();
    const panel = page.locator(".resourceimport"),
      input = panel.locator('input[type="file"]');
    const head = [
      "Ad Soyad",
      "Liderlik",
      "Takım",
      "Statü",
      "Dahil",
      "Kişi Eşdeğeri",
      "İşbaşı Tarihi",
      "İşten Ayrılış Tarihi",
      "İK Notu",
    ];
    const values = (name, start = "2026-01-01") => [
      name,
      f.teamA.lead,
      f.teamA.name,
      "Aktif Çalışan",
      "Evet",
      "1",
      start,
      "",
      "Synthetic import note",
    ];
    const upload = (bytes) =>
      input.setInputFiles({
        name: "synthetic.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: bytes,
      });
    await f.check(
      "import: template download is valid XLSX; malformed/oversize files do not write",
      async () => {
        const bytes = await download(
          page,
          panel.getByRole("button", {
            name: "Excel Şablonunu İndir",
            exact: true,
          }),
          path.join(f.dir, "resource-template.xlsx"),
        );
        const entries = zipEntries(bytes);
        await validateXml(page, entries);
        assert(entries["xl/worksheets/sheet1.xml"].includes("Ad Soyad"));
        const before = (await f.state()).resources;
        await upload(Buffer.from("Not an Excel file"));
        await panel.getByRole("alert").waitFor();
        assert.deepEqual((await f.state()).resources, before);
        await upload(Buffer.alloc(10 * 1024 * 1024 + 1));
        await panel.getByRole("alert").filter({ hasText: "10 MB" }).waitFor();
        assert.deepEqual((await f.state()).resources, before);
      },
    );
    await f.check(
      "import: invalid rows block all writes, error filtering and worksheet switching work",
      async () => {
        await upload(
          workbook(
            [
              head,
              values("Browser Employee"),
              values("Imported A"),
              values("Imported A"),
              values("Bad Date", "not-a-date"),
            ],
            [head, values("Imported B")],
          ),
        );
        await panel.locator(".importcounts").waitFor();
        assert(
          (await panel.locator(".importcounts").innerText()).includes(
            "1 hatalı satır",
          ),
        );
        assert(
          await panel
            .getByRole("button", { name: /Kaydı İçe Aktar/ })
            .isDisabled(),
        );
        await panel
          .getByRole("checkbox", {
            name: "Yalnızca Hatalı Satırları Göster",
            exact: true,
          })
          .check();
        assert.equal(await panel.locator("tbody tr").count(), 1);
        await panel.locator("select").selectOption({ label: "İkinci Sayfa" });
        await f.wait(
          async () =>
            (await panel.locator(".importcounts").innerText()).includes(
              "0 hatalı satır",
            ),
          "second worksheet preview",
        );
        assert.equal(
          await panel
            .getByRole("checkbox", {
              name: "Yalnızca Hatalı Satırları Göster",
              exact: true,
            })
            .isChecked(),
          false,
        );
        assert.equal(
          (await f.state()).resources.some((r) =>
            r.name.startsWith("Imported"),
          ),
          false,
        );
      },
    );
    await f.check(
      "import: failed import keeps preview; retry and duplicate detection append only new resources",
      async () => {
        await page.route(
          "**/api/resources/import",
          (route) =>
            route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Synthetic import failure" }),
            }),
          { times: 1 },
        );
        await panel
          .getByRole("button", { name: "1 Kaydı İçe Aktar", exact: true })
          .click();
        await panel
          .getByRole("alert")
          .filter({ hasText: "Synthetic import failure" })
          .waitFor();
        assert.equal(await panel.locator("tbody tr").count(), 1);
        assert(
          !(await f.state()).resources.some((r) => r.name === "Imported B"),
        );
        await panel
          .getByRole("button", { name: "1 Kaydı İçe Aktar", exact: true })
          .click();
        await panel.waitFor({ state: "hidden" });
        assert(
          (await f.state()).resources.some((r) => r.name === "Imported B"),
        );
        await page
          .getByRole("button", { name: "Excel İçe Aktar", exact: true })
          .click();
        await upload(
          workbook(
            [
              head,
              values("Browser Employee"),
              values("Imported A"),
              values("Imported A"),
            ],
            [head],
          ),
        );
        await panel.locator(".importcounts").waitFor();
        const counts = await panel.locator(".importcounts").innerText();
        assert(
          counts.includes("1 yeni kayıt") && counts.includes("2 tekrar"),
          counts,
        );
        await panel
          .getByRole("button", { name: "1 Kaydı İçe Aktar", exact: true })
          .click();
        await panel.waitFor({ state: "hidden" });
        assert.equal(
          (await f.state()).resources.filter((r) => r.name === "Imported A")
            .length,
          1,
        );
        await f.capture(page, "resource-imported");
      },
    );
    let backup, bytes;
    await f.check(
      "backup: downloaded JSON includes planning records without users or credentials",
      async () => {
        bytes = await download(
          page,
          page.getByRole("button", { name: "Veri Yedeği İndir", exact: true }),
          path.join(f.dir, "planning-backup.json"),
        );
        backup = JSON.parse(bytes);
        assert.equal(backup.format, "aa-planning-data-v1");
        assert.equal(backup.data.users, undefined);
        assert(
          !Object.keys(backup.data.revisions).some((key) =>
            key.startsWith("user:"),
          ),
        );
        assert(!bytes.toString().includes("Browser-check-only"));
        assert(backup.data.resources.some((r) => r.name === "Imported A"));
      },
    );
    const backupInput = page.locator('.mast input[type="file"]');
    const restore = (buffer) =>
      backupInput.setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer,
      });
    await f.check(
      "restore: cancel clears file selection so the same file can be chosen again",
      async () => {
        const before = await f.state();
        page.once("dialog", (d) => d.dismiss());
        await restore(bytes);
        assert.equal(await backupInput.inputValue(), "");
        assert.deepEqual(await f.state(), before);
      },
    );
    await f.check(
      "restore: malformed, oversize, server failure and stale generation leave the model intact",
      async () => {
        const before = await f.state();
        for (const [buffer, message] of [
          [Buffer.from('{"format":"wrong"}'), "Geçerli bir veri yedeği"],
          [Buffer.alloc(20 * 1024 * 1024 + 1), "20 MB"],
        ]) {
          page.once("dialog", (d) => d.accept());
          await restore(buffer);
          await page.getByRole("alert").filter({ hasText: message }).waitFor();
          assert.deepEqual(await f.state(), before);
          assert.equal(await backupInput.inputValue(), "");
        }
        await page.route(
          "**/api/restore",
          (route) =>
            route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Synthetic restore failure" }),
            }),
          { times: 1 },
        );
        page.once("dialog", (d) => d.accept());
        await restore(bytes);
        await page
          .getByRole("alert")
          .filter({ hasText: "Synthetic restore failure" })
          .waitFor();
        assert.deepEqual(await f.state(), before);
        const project = before.projects.find((p) => p.id === "p-a");
        await f.store.mutate(f.actor, (d, u) =>
          applyChanges(d, u, [
            {
              kind: "project",
              id: project.id,
              revision: d.revisions["project:" + project.id],
              value: { ...project, name: "External modification" },
            },
          ]),
        );
        page.once("dialog", (d) => d.accept());
        await restore(bytes);
        await page
          .getByRole("alert")
          .filter({ hasText: "Veriler değişti" })
          .waitFor();
        assert.equal(
          (await f.state()).projects.find((p) => p.id === "p-a").name,
          "External modification",
        );
      },
    );
    await f.check(
      "restore: valid restore replaces planning data and preserves account roles/passwords",
      async () => {
        const users = await f.store.users();
        await page.reload();
        await page
          .getByRole("tab", { name: "AA Risk Yönetimi", exact: true })
          .waitFor();
        page.once("dialog", (d) => d.accept());
        await restore(bytes);
        await page.getByText("Yedek yüklendi", { exact: true }).waitFor();
        assert.equal(await backupInput.inputValue(), "");
        const current = await f.state();
        for (const key of [
          "projects",
          "resources",
          "risks",
          "workCalendar",
          "personCalendar",
          "actualAllocations",
          "actualPercentEntries",
        ])
          assert.deepEqual(current[key], backup.data[key], key);
        assert.deepEqual(await f.store.users(), users);
        await f.capture(page, "backup-restored");
      },
    );
  } catch (error) {
    await f.capture(page, "import-restore-failure").catch(() => {});
    throw error;
  }
}
