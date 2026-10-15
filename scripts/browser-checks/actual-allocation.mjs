import assert from "node:assert/strict";

export async function checkActualAllocation(f) {
  const client = await f.client("employee");
  const { page } = client;
  const allocationKey = "r-own|p-a|2026-01";
  const hoursKey = "r-own|2026-01";
  const amount = () =>
    page.getByRole("textbox", {
      name: "Browser Employee / Browser Project A / 2026-01 / %",
      exact: true,
    });
  const hours = () =>
    page.getByRole("textbox", {
      name: "Browser Employee / 2026-01 çalışılan saat",
      exact: true,
    });
  const waitText = (field, value) =>
    f.wait(
      async () =>
        (await field.inputValue()) === value && !(await field.isDisabled()),
      "actual input settled: " + value,
    );
  try {
    await page
      .getByRole("tab", { name: "AA Gerçekleşen Kaynak Dağılımı", exact: true })
      .click();
    await f.check(
      "actual: cell/total selection, outside click and Escape; units and manual/automatic hours remain consistent",
      async () => {
        assert.equal(await hours().count(), 0);
        await amount().click();
        assert.equal(await hours().inputValue(), "198");
        await page
          .getByRole("heading", {
            name: "AA Gerçekleşen Kaynak Dağılımı",
            exact: true,
          })
          .click();
        assert.equal(await hours().count(), 0);
        assert.equal(await page.locator(".actual-context-selected").count(), 0);
        await amount().click();
        await page.keyboard.press("Escape");
        assert.equal(await hours().count(), 0);
        assert.equal(await page.locator(".actual-context-selected").count(), 0);
        await page
          .locator(
            '.actual-person-total td[title="Browser Employee · 2026-01 · projeler ve 0 saat eğitim"]',
          )
          .first()
          .click();
        assert.equal(await hours().inputValue(), "198");
        await page.locator("#actual-entry-unit").selectOption("hours");
        const hourAmount = page.getByRole("textbox", {
          name: "Browser Employee / Browser Project A / 2026-01 / saat",
          exact: true,
        });
        await hourAmount.fill("18");
        await hourAmount.press("Enter");
        await f.wait(
          async () =>
            Math.abs((await f.state()).actualAllocations[allocationKey] - 0.1) <
            1e-9,
          "18 hours saved",
        );
        assert.equal(await page.locator(".actual-context-selected").count(), 0);
        assert.deepEqual(
          await page
            .locator("#actual-entry-unit option")
            .evaluateAll((options) => options.map((option) => option.value)),
          ["percent", "hours"],
        );
        await page.locator("#actual-entry-unit").selectOption("percent");
        await waitText(amount(), "%9,09");
        await amount().click();
        await hours().fill("216");
        await hours().press("Enter");
        await f.wait(
          async () => (await f.state()).actualWorkedHours[hoursKey] === 216,
          "manual hours saved",
        );
        await waitText(amount(), "%8,33");
        await waitText(hours(), "216");
        await hours().fill("");
        await hours().press("Enter");
        await f.wait(
          async () =>
            (await f.state()).actualWorkedHours[hoursKey] === undefined,
          "automatic hours restored",
        );
        await waitText(hours(), "198");
        await waitText(amount(), "%9,09");
      },
    );
    await f.check(
      "actual: full capacity blocks empty projects and future months; limit warning restores input focus and stored value",
      async () => {
        await amount().fill("100");
        await amount().press("Enter");
        await f.wait(
          async () =>
            (await f.state()).actualPercentEntries[allocationKey] === 100,
          "full capacity saved",
        );
        await waitText(amount(), "%100");
        const secondProjectJanuary = page
          .locator('[data-project-group="p-b"] tr')
          .nth(1)
          .locator("td")
          .nth(1);
        await secondProjectJanuary
          .getByRole("status", { name: "Tüm kaynak dağıtıldı", exact: true })
          .waitFor();
        assert.equal(
          await secondProjectJanuary.getByRole("textbox").count(),
          0,
        );
        assert(
          await page
            .getByRole("textbox", {
              name: "Browser Employee / Browser Project A / 2026-11 / %",
              exact: true,
            })
            .isDisabled(),
        );
        await amount().click();
        await amount().fill("101");
        await amount().press("Enter");
        await page
          .getByRole("heading", { name: "Kaynak Dağılımı Sınırı", exact: true })
          .waitFor();
        assert.equal(
          (await f.state()).actualPercentEntries[allocationKey],
          100,
        );
        await page.getByRole("button", { name: "Tamam", exact: true }).click();
        await f.wait(
          () =>
            amount().evaluate((element) => element === document.activeElement),
          "limit returned focus",
        );
        assert.equal(await amount().inputValue(), "%100");
        await amount().fill("");
        await amount().press("Enter");
        await f.wait(
          async () => !(await f.state()).actualAllocations[allocationKey],
          "allocation reset",
        );
        await waitText(amount(), "");
        await secondProjectJanuary.getByRole("textbox").waitFor();
      },
    );
    await f.check(
      "actual: 503 keeps allocation and hours drafts; explicit retry saves and clearing restores the original calculation",
      async () => {
        let fail = true;
        const route = async (request) => {
          if (fail) {
            fail = false;
            await request.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Synthetic actual save failure" }),
            });
          } else await request.continue();
        };
        await page.route("**/api/changes", route);
        try {
          await amount().fill("10");
          await amount().press("Enter");
          await page
            .locator(".person-amount [role=alert]")
            .filter({ hasText: "Synthetic actual save failure" })
            .waitFor();
          assert.equal(await amount().inputValue(), "%10");
          assert.equal(
            (await f.state()).actualAllocations[allocationKey] || 0,
            0,
          );
          await amount().click();
          await amount().press("Enter");
          await f.wait(
            async () =>
              (await f.state()).actualPercentEntries[allocationKey] === 10,
            "allocation retry saved",
          );
          await waitText(amount(), "%10");
          await amount().fill("");
          await amount().press("Enter");
          await f.wait(
            async () => !(await f.state()).actualAllocations[allocationKey],
            "retry allocation reset",
          );
          await waitText(amount(), "");
          await amount().click();
          fail = true;
          await hours().fill("200");
          await hours().press("Enter");
          await page
            .locator(".worked-hours-input [role=alert]")
            .filter({ hasText: "Synthetic actual save failure" })
            .waitFor();
          assert.equal(await hours().inputValue(), "200");
          assert.equal(
            (await f.state()).actualWorkedHours[hoursKey],
            undefined,
          );
          await hours().click();
          await hours().press("Enter");
          await f.wait(
            async () => (await f.state()).actualWorkedHours[hoursKey] === 200,
            "hours retry saved",
          );
          await waitText(hours(), "200");
          await hours().fill("");
          await hours().press("Enter");
          await f.wait(
            async () =>
              (await f.state()).actualWorkedHours[hoursKey] === undefined,
            "retry hours reset",
          );
          await waitText(hours(), "198");
        } finally {
          await page.unroute("**/api/changes", route);
        }
        await f.capture(page, "actual-controls-verified");
      },
    );
  } catch (error) {
    await f.capture(page, "actual-controls-failure").catch(() => {});
    throw error;
  } finally {
    await client.context.close();
  }
}
