import { selectWorkspaceTab } from "./fixture.mjs";
import assert from "node:assert/strict";
import {
  calendarHoursInMonth,
  personCalendarHoursInMonth,
} from "../../shared/actual-units.ts";

const actualTab = (page) =>
  page.getByRole("tab", {
    name: "AA Gerçekleşen Kaynak Dağılımı",
    exact: true,
  });
const dialog = (page) => page.getByRole("dialog");
async function personalMonth(f) {
  const data = await f.state();
  return personCalendarHoursInMonth(
    "2026-01",
    "r-own",
    data.workCalendar,
    data.personCalendar,
  );
}
async function personalAvailableHours(f) {
  const month = await personalMonth(f);
  return month.baseHours - month.leaveHours;
}

export async function checkCalendar(f) {
  const { page } = await f.client("root-admin");
  try {
    await actualTab(page).click();
    await f.check(
      "calendar: shared full/half-day holidays preview then save; weekends are not subtracted twice",
      async () => {
        await page
          .getByRole("button", { name: "Çalışma Takvimi'ni aç", exact: true })
          .click();
        assert.equal(
          await dialog(page).locator(".work-calendar-summary").count(),
          0,
        );
        assert.equal(
          calendarHoursInMonth("2026-01", (await f.state()).workCalendar),
          198,
        );
        async function add(date, fraction, label) {
          await dialog(page)
            .getByLabel("Başlangıç", { exact: true })
            .fill(date);
          await dialog(page).getByLabel("Bitiş", { exact: true }).fill(date);
          await dialog(page)
            .locator(".work-calendar-fields select")
            .nth(1)
            .selectOption(fraction);
          await dialog(page)
            .getByLabel("Açıklama", { exact: true })
            .fill(label);
          await dialog(page)
            .getByRole("button", { name: "Ekle", exact: true })
            .click();
        }
        await add("2026-01-07", "1", "Shared full day");
        await add("2026-01-08", "0.5", "Shared half day");
        await add("2026-01-10", "1", "Weekend marker");
        assert.equal(
          await dialog(page).locator(".work-calendar-range-row").count(),
          3,
        );
        assert.equal((await f.state()).workCalendar["2026-01-07"], undefined);
        await dialog(page)
          .getByRole("button", { name: "Takvimi Kaydet", exact: true })
          .click();
        await dialog(page).waitFor({ state: "hidden" });
        assert.equal(
          calendarHoursInMonth("2026-01", (await f.state()).workCalendar),
          184.5,
        );
        assert.equal(
          (await f.state()).workCalendar["2026-01-08"].fraction,
          0.5,
        );
        await page
          .getByRole("button", { name: "Çalışma Takvimi'ni aç", exact: true })
          .click();
        await dialog(page)
          .getByRole("button", {
            name: "2026-01-07 – 2026-01-07 çalışma dışı tarih aralığını sil",
            exact: true,
          })
          .click();
        await dialog(page)
          .getByRole("button", { name: "Kapat", exact: true })
          .click();
        assert((await f.state()).workCalendar["2026-01-07"]);
      },
    );
    await f.check(
      "calendar: shared range is one row; edit and delete affect every date and persist",
      async () => {
        await page
          .getByRole("button", { name: "Çalışma Takvimi'ni aç", exact: true })
          .click();
        await dialog(page)
          .getByLabel("Başlangıç", { exact: true })
          .fill("2026-01-12");
        await dialog(page)
          .getByLabel("Bitiş", { exact: true })
          .fill("2026-01-14");
        await dialog(page)
          .getByLabel("Açıklama", { exact: true })
          .fill("Shared grouped range");
        await dialog(page)
          .getByRole("button", { name: "Ekle", exact: true })
          .click();
        let row = dialog(page)
          .locator(".work-calendar-range-row")
          .filter({ hasText: "Shared grouped range" });
        assert.equal(await row.count(), 1);
        await row.getByRole("button", { name: /düzenle$/ }).click();
        await dialog(page)
          .getByLabel("Başlangıç", { exact: true })
          .fill("2026-01-13");
        await dialog(page)
          .getByLabel("Bitiş", { exact: true })
          .fill("2026-01-15");
        await dialog(page)
          .getByLabel("Süre", { exact: true })
          .selectOption("0.5");
        await dialog(page)
          .getByRole("button", { name: "Güncelle", exact: true })
          .click();
        assert((await row.innerText()).includes("13.01.2026 → 15.01.2026"));
        await dialog(page)
          .getByRole("button", { name: "Takvimi Kaydet", exact: true })
          .click();
        await dialog(page).waitFor({ state: "hidden" });
        let state = await f.state();
        assert.equal(state.workCalendar["2026-01-12"], undefined);
        assert.equal(state.workCalendar["2026-01-15"].fraction, 0.5);
        assert.deepEqual(state.workCalendar["2026-01-14"].range, {
          from: "2026-01-13",
          to: "2026-01-15",
        });
        await page
          .getByRole("button", { name: "Çalışma Takvimi'ni aç", exact: true })
          .click();
        row = dialog(page)
          .locator(".work-calendar-range-row")
          .filter({ hasText: "Shared grouped range" });
        assert.equal(await row.count(), 1);
        await f.capture(page, "shared-calendar-grouped-range");
        await row.getByRole("button", { name: /sil$/ }).click();
        await dialog(page)
          .getByRole("button", { name: "Takvimi Kaydet", exact: true })
          .click();
        await dialog(page).waitFor({ state: "hidden" });
        state = await f.state();
        for (const day of ["13", "14", "15"])
          assert.equal(state.workCalendar["2026-01-" + day], undefined);
        assert.equal(state.workCalendar["2026-01-08"].fraction, 0.5);
      },
    );
    const employee = await f.client("employee"),
      other = await f.client("other"),
      manager = await f.client("manager"),
      unmapped = await f.client("unmapped");
    const p = employee.page;
    await actualTab(p).click();
    await f.check(
      "calendar: normal user owns personal entry controls; shared/other records remain inaccessible",
      async () => {
        assert.equal(
          await p
            .getByRole("button", { name: "Çalışma Takvimi'ni aç", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await p
            .getByRole("button", {
              name: "Browser Other Employee izin ve eğitim takvimini aç",
              exact: true,
            })
            .count(),
          0,
        );
        await p
          .getByRole("button", {
            name: "Browser Employee izin ve eğitim takvimini aç",
            exact: true,
          })
          .first()
          .click();
        assert.equal(
          await dialog(p)
            .getByRole("button", { name: "Takvimi Kaydet", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await dialog(p).locator(".work-calendar-summary").count(),
          0,
        );
        assert.equal(await dialog(p).locator(".work-calendar-help").count(), 0);
        assert.equal(
          await dialog(p).locator('[data-slot="dialog-description"]').count(),
          0,
        );
        assert.equal(await personalAvailableHours(f), 184.5);
      },
    );
    await f.check(
      "calendar: hourly leave and training coexist; non-working ranges are rejected without changing hours",
      async () => {
        async function add(date, type, hours, label) {
          await dialog(p)
            .getByLabel(/(?:Ayrılış|Başlangıç) Tarihi/)
            .fill(date);
          const returning = new Date(Date.parse(date + "T12:00:00Z") + 86400000)
            .toISOString()
            .slice(0, 10);
          await dialog(p)
            .getByLabel(/Dönüş Tarihi/)
            .fill(returning);
          await dialog(p)
            .locator(".work-calendar-fields select")
            .selectOption(type);
          await dialog(p)
            .getByLabel("Günlük Saat", { exact: true })
            .fill(hours);
          await dialog(p).getByLabel("Açıklama", { exact: true }).fill(label);
          await dialog(p)
            .getByRole("button", { name: "Kaydet", exact: true })
            .click();
          await f.wait(
            async () =>
              Boolean(
                (await f.state()).personCalendar["r-own|" + date + "|" + type],
              ),
            "personal day saved",
          );
          await f.wait(
            async () =>
              !(await dialog(p)
                .getByRole("button", { name: "Kaydet", exact: true })
                .isDisabled()),
            "personal save settled",
          );
        }
        await add("2026-01-05", "leave", "4", "PRIVATE_LEAVE_LABEL");
        await add("2026-01-05", "training", "2", "Training label");
        await dialog(p)
          .getByLabel(/(?:Ayrılış|Başlangıç) Tarihi/)
          .fill("2026-01-10");
        await dialog(p)
          .getByLabel(/Dönüş Tarihi/)
          .fill("2026-01-12");
        await dialog(p)
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        await dialog(p)
          .getByRole("alert")
          .filter({ hasText: "çalışılabilir gün yok" })
          .waitFor();
        assert.equal(
          (await f.state()).personCalendar["r-own|2026-01-10|leave"],
          undefined,
        );
        const month = await personalMonth(f);
        assert.equal(month.leaveHours, 4);
        assert.equal(month.trainingHours, 2);
        assert.equal(await personalAvailableHours(f), 180.5);
        await dialog(p)
          .getByLabel(/(?:Ayrılış|Başlangıç) Tarihi/)
          .fill("2026-01-05");
        await dialog(p)
          .getByLabel(/Dönüş Tarihi/)
          .fill("2026-01-06");
        await dialog(p)
          .locator(".work-calendar-fields select")
          .selectOption("training");
        await dialog(p).getByLabel("Günlük Saat", { exact: true }).fill("6");
        await dialog(p)
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        await dialog(p).getByRole("alert").waitFor();
        assert.equal(
          (await f.state()).personCalendar["r-own|2026-01-05|training"].hours,
          2,
        );
        assert.equal(await personalAvailableHours(f), 180.5);
      },
    );
    await f.check(
      "calendar: delayed save freezes form fields and retry keeps failed input",
      async () => {
        await dialog(p)
          .getByLabel(/(?:Ayrılış|Başlangıç) Tarihi/)
          .fill("2026-01-06");
        await dialog(p)
          .getByLabel(/Dönüş Tarihi/)
          .fill("2026-01-07");
        await dialog(p).getByLabel("Günlük Saat", { exact: true }).fill("1");
        await p.route(
          "**/api/changes",
          (route) =>
            route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Synthetic calendar failure" }),
            }),
          { times: 1 },
        );
        await dialog(p)
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        await dialog(p)
          .getByRole("alert")
          .filter({ hasText: "Synthetic calendar failure" })
          .waitFor();
        assert.equal(
          await dialog(p)
            .getByLabel(/(?:Ayrılış|Başlangıç) Tarihi/)
            .inputValue(),
          "2026-01-06",
        );
        let release,
          held = false;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const hold = async (route) => {
          held = true;
          await gate;
          await route.continue();
        };
        await p.route("**/api/changes", hold);
        try {
          await dialog(p)
            .getByRole("button", { name: "Kaydet", exact: true })
            .click();
          await f.wait(() => held, "calendar save held");
          assert(
            await dialog(p)
              .getByLabel(/(?:Ayrılış|Başlangıç) Tarihi/)
              .isDisabled(),
          );
          assert(
            await dialog(p)
              .getByLabel("Günlük Saat", { exact: true })
              .isDisabled(),
          );
          release();
          await f.wait(
            async () =>
              Boolean(
                (await f.state()).personCalendar["r-own|2026-01-06|training"],
              ),
            "calendar retry committed",
          );
          await f.wait(
            async () =>
              !(await dialog(p)
                .getByRole("button", { name: "Kaydet", exact: true })
                .isDisabled()),
            "calendar retry settled",
          );
        } finally {
          release();
          await p.unrouteAll({ behavior: "wait" });
        }
        await dialog(p)
          .getByRole("button", {
            name: "2026-01-06 – 2026-01-07 eğitim aralığını sil",
            exact: true,
          })
          .click();
        await f.wait(
          async () =>
            !(await f.state()).personCalendar["r-own|2026-01-06|training"],
          "temporary training removed",
        );
        await dialog(p)
          .getByRole("button", { name: "Kapat", exact: true })
          .click();
      },
    );
    await f.check(
      "calendar: range preview, exclusive return, multi-day edit and removal update monthly capacity",
      async () => {
        await p
          .getByRole("button", {
            name: "Browser Employee izin ve eğitim takvimini aç",
            exact: true,
          })
          .first()
          .click();
        await dialog(p)
          .locator(".work-calendar-fields select")
          .selectOption("leave");
        await dialog(p)
          .getByLabel("İzin Ayrılış Tarihi", { exact: true })
          .fill("2026-01-12");
        assert.equal(
          await dialog(p)
            .getByLabel("İzin Dönüş Tarihi", { exact: true })
            .inputValue(),
          "2026-01-13",
        );
        await dialog(p)
          .getByLabel("İzin Dönüş Tarihi", { exact: true })
          .fill("2026-01-15");
        await dialog(p).getByLabel("Günlük Saat", { exact: true }).fill("9");
        assert(
          (
            await dialog(p).locator(".work-calendar-range-preview").innerText()
          ).includes("3 çalışma günü · 27 saat · Dönüş günü hariç"),
        );
        await f.capture(p, "personal-calendar-range-preview");
        await dialog(p)
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        await f.wait(
          async () =>
            Boolean((await f.state()).personCalendar["r-own|2026-01-14|leave"]),
          "personal range saved",
        );
        assert.equal(
          (await f.state()).personCalendar["r-own|2026-01-15|leave"],
          undefined,
        );
        await f.wait(
          async () => (await personalAvailableHours(f)) === 153.5,
          "range monthly hours calculated",
        );
        await f.capture(p, "personal-calendar-range");
        const rangeRow = dialog(p)
          .locator(".work-calendar-range-row")
          .filter({ hasText: "12.01.2026 → 15.01.2026" });
        assert.equal(await rangeRow.count(), 1);
        assert(
          (await rangeRow.innerText()).includes("3 çalışma günü · 27 saat"),
        );
        await rangeRow.getByRole("button", { name: /düzenle$/ }).click();
        await dialog(p)
          .getByLabel("İzin Ayrılış Tarihi", { exact: true })
          .fill("2026-01-13");
        await dialog(p)
          .getByLabel("İzin Dönüş Tarihi", { exact: true })
          .fill("2026-01-16");
        await dialog(p).getByLabel("Günlük Saat", { exact: true }).fill("3");
        await dialog(p)
          .getByRole("button", { name: "Güncelle", exact: true })
          .click();
        await f.wait(
          async () =>
            (await f.state()).personCalendar["r-own|2026-01-15|leave"]
              ?.hours === 3,
          "range edit committed",
        );
        assert.equal(
          (await f.state()).personCalendar["r-own|2026-01-12|leave"],
          undefined,
        );
        await f.wait(
          async () =>
            !(await dialog(p)
              .getByRole("button", { name: "Kaydet", exact: true })
              .isDisabled()),
          "range edit settled",
        );
        await f.wait(
          async () => (await personalAvailableHours(f)) === 171.5,
          "edited range monthly hours calculated",
        );
        await f.capture(p, "personal-calendar-grouped-range");
        await dialog(p)
          .getByRole("button", {
            name: "2026-01-13 – 2026-01-16 izin aralığını sil",
            exact: true,
          })
          .click();
        await f.wait(async () => {
          const data = await f.state();
          return ["13", "14", "15"].every(
            (day) => !data.personCalendar["r-own|2026-01-" + day + "|leave"],
          );
        }, "whole range removed");
        await f.wait(
          async () =>
            !(await dialog(p)
              .getByRole("button", { name: "Kaydet", exact: true })
              .isDisabled()),
          "range removal settled",
        );
        await f.wait(
          async () => (await personalAvailableHours(f)) === 180.5,
          "removed range monthly hours calculated",
        );
        await dialog(p)
          .getByRole("button", { name: "Kapat", exact: true })
          .click();
      },
    );
    await f.check(
      "calendar: training contributes to total percent, leave to monthly hours, and capacity limit prevents over-allocation",
      async () => {
        const amount = p.getByRole("textbox", {
          name: "Browser Employee / Browser Project A / 2026-01 / %",
          exact: true,
        });
        await amount.click();
        const hours = p.getByRole("textbox", {
          name: "Browser Employee / 2026-01 çalışılan saat",
          exact: true,
        });
        assert.equal(await hours.inputValue(), "180,5");
        const total = p
          .locator(
            '.actual-person-total td[title="Browser Employee · 2026-01 · projeler ve 2 saat eğitim"]',
          )
          .first();
        assert.equal((await total.innerText()).trim(), "%1,11");
        await amount.fill("100");
        await amount.press("Enter");
        await p
          .getByRole("heading", { name: "Kaynak Dağılımı Sınırı", exact: true })
          .waitFor();
        assert.equal(
          (await f.state()).actualAllocations["r-own|p-a|2026-01"] || 0,
          0,
        );
        await p.getByRole("button", { name: "Tamam", exact: true }).click();
        await amount.fill("50");
        await amount.press("Enter");
        await f.wait(
          async () =>
            (await f.state()).actualPercentEntries["r-own|p-a|2026-01"] === 50,
          "actual percent saved",
        );
        assert(
          Math.abs(
            (await f.state()).actualAllocations["r-own|p-a|2026-01"] * 180 -
              90.25,
          ) < 1e-7,
        );
        await amount.click();
        await f.wait(
          async () => (await total.innerText()).trim() === "%51,11",
          "saved actual percent and training total rendered",
        );
        await hours.fill("80");
        await hours.press("Enter");
        await p
          .getByRole("heading", { name: "Çalışma Saati Sınırı", exact: true })
          .waitFor();
        assert.equal(
          (await f.state()).actualWorkedHours["r-own|2026-01"],
          undefined,
        );
        await p.getByRole("button", { name: "Tamam", exact: true }).click();
        await f.capture(p, "calendar-actual-percent");
      },
    );
    await f.check(
      "calendar: admin reports reflect saved labels/dates; manager and unmapped user cannot read personal records",
      async () => {
        await page.reload();
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        const report = page.locator(".absence-report");
        await report.waitFor();
        assert((await report.innerText()).includes("PRIVATE_LEAVE_LABEL"));
        assert((await report.innerText()).includes("Training label"));
        assert.equal(await report.locator("tbody tr").count(), 2);
        await f.capture(page, "calendar-report");
        await actualTab(manager.page).click();
        await manager.page
          .getByRole("textbox", {
            name: "Browser Employee / Browser Project A / 2026-01 / %",
            exact: true,
          })
          .waitFor();
        assert.equal(
          await manager.page
            .getByRole("button", {
              name: "Browser Employee izin ve eğitim takvimini aç",
              exact: true,
            })
            .count(),
          0,
        );
        const response = await manager.context.request.get(
          f.origin + "/api/actual-view?start=2026-01&count=1",
        );
        assert.equal(response.status(), 200);
        const scoped = await response.json();
        assert.deepEqual(scoped.data.personCalendar, {});
        assert(
          !Object.keys(scoped.data.revisions).some((key) =>
            key.startsWith("personDay:"),
          ),
        );
        assert(scoped.monthSummaries["r-own|2026-01"]);
        assert(!JSON.stringify(scoped).includes("PRIVATE_LEAVE_LABEL"));
        assert(!JSON.stringify(scoped).includes("Training label"));
        await actualTab(other.page).click();
        assert.equal(
          await other.page
            .getByRole("button", {
              name: "Browser Employee izin ve eğitim takvimini aç",
              exact: true,
            })
            .count(),
          0,
        );
        await actualTab(unmapped.page).click();
        assert.equal(
          await unmapped.page.locator(".person-calendar-trigger").count(),
          0,
        );
      },
    );
    await f.check(
      "calendar: employee report groups a saved range and admin edits/deletes the whole range",
      async () => {
        await p
          .getByRole("button", {
            name: "Browser Employee izin ve eğitim takvimini aç",
            exact: true,
          })
          .first()
          .click();
        await dialog(p)
          .getByLabel(/(?:Ayrılış|Başlangıç) Tarihi/)
          .fill("2026-01-20");
        await dialog(p)
          .getByLabel(/Dönüş Tarihi/)
          .fill("2026-01-23");
        await dialog(p)
          .locator(".work-calendar-fields select")
          .selectOption("leave");
        await dialog(p).getByLabel("Günlük Saat", { exact: true }).fill("2");
        await dialog(p)
          .getByLabel("Açıklama", { exact: true })
          .fill("Report grouped leave");
        await dialog(p)
          .getByRole("button", { name: "Kaydet", exact: true })
          .click();
        await f.wait(
          async () =>
            Boolean((await f.state()).personCalendar["r-own|2026-01-22|leave"]),
          "report fixture range saved",
        );
        await f.wait(
          async () =>
            !(await dialog(p)
              .getByRole("button", { name: "Kaydet", exact: true })
              .isDisabled()),
          "report fixture save settled",
        );
        await dialog(p)
          .getByRole("button", { name: "Kapat", exact: true })
          .click();
        await page.reload();
        await selectWorkspaceTab(page, "Çalışan & Yetki Tanımlama");
        const report = page.locator(".absence-report");
        const row = report
          .locator("tbody tr")
          .filter({ hasText: "Report grouped leave" });
        await row.waitFor();
        assert.equal(await row.count(), 1);
        assert.equal(await report.locator("tbody tr").count(), 3);
        assert.equal((await row.locator("td").nth(5).innerText()).trim(), "3");
        assert.equal((await row.locator("td").nth(6).innerText()).trim(), "6");
        await row.getByRole("button", { name: "Düzenle", exact: true }).click();
        assert.equal(
          await dialog(page)
            .getByLabel(/(?:Ayrılış|Başlangıç) Tarihi/)
            .inputValue(),
          "2026-01-20",
        );
        assert.equal(
          await dialog(page)
            .getByLabel(/Dönüş Tarihi/)
            .inputValue(),
          "2026-01-23",
        );
        await dialog(page)
          .getByLabel(/(?:Ayrılış|Başlangıç) Tarihi/)
          .fill("2026-01-21");
        await dialog(page)
          .getByLabel(/Dönüş Tarihi/)
          .fill("2026-01-24");
        await dialog(page).getByLabel("Günlük Saat", { exact: true }).fill("3");
        await dialog(page)
          .getByRole("button", { name: "Güncelle", exact: true })
          .click();
        await f.wait(
          async () =>
            (await f.state()).personCalendar["r-own|2026-01-23|leave"]
              ?.hours === 3,
          "report range edit saved",
        );
        await f.wait(
          async () =>
            !(await dialog(page)
              .getByRole("button", { name: "Kaydet", exact: true })
              .isDisabled()),
          "report edit settled",
        );
        await dialog(page)
          .getByRole("button", { name: "Kapat", exact: true })
          .click();
        assert.equal(await row.count(), 1);
        assert.equal((await row.locator("td").nth(6).innerText()).trim(), "9");
        assert.equal(
          (await f.state()).personCalendar["r-own|2026-01-20|leave"],
          undefined,
        );
        await f.capture(page, "employee-report-grouped-range");
        await row.getByRole("button", { name: "Sil", exact: true }).click();
        await row.waitFor({ state: "hidden" });
        const state = await f.state();
        for (const day of ["21", "22", "23"])
          assert.equal(
            state.personCalendar["r-own|2026-01-" + day + "|leave"],
            undefined,
          );
        assert.equal(await report.locator("tbody tr").count(), 2);
        assert.equal(state.personCalendar["r-own|2026-01-05|leave"].hours, 4);
      },
    );
    await Promise.all(
      [employee, other, manager, unmapped].map((c) => c.context.close()),
    );
  } catch (error) {
    await f.capture(page, "calendar-failure").catch(() => {});
    throw error;
  }
}
