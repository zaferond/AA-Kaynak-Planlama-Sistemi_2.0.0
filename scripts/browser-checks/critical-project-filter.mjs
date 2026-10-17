import assert from "node:assert/strict";
import { applyChanges } from "../../backend/operations.mjs";

// Critical topics: the project filter keeps its choice, lists only that
// project, scopes the status counts to it and clears back to all projects.
export async function checkCriticalProjectFilter(f) {
  const before = (await f.state()).projects;
  const topic = (id, text) => ({
    id: "filter-topic-" + id,
    name: "QA Filter Heading " + id,
    start: "2026-03-01",
    end: "2026-03-20",
    barStyle: "solid",
    barColor: "blue",
    hasCriticalTopics: true,
    barNotes: [
      { text, includeInReport: true, start: "2026-03-02", end: "2026-03-05" },
    ],
  });
  async function setTopics(values) {
    await f.store.mutate(f.actor, (d, u) =>
      applyChanges(
        d,
        u,
        values.map((value) => ({
          kind: "project",
          id: value.id,
          revision: d.revisions["project:" + value.id],
          value,
        })),
      ),
    );
  }
  await setTopics(
    before.map((project) =>
      project.id === "p-a"
        ? { ...project, milestones: [topic("a", "QA Topic Alpha")] }
        : project.id === "p-b"
          ? {
              ...project,
              milestones: [
                topic("b", "QA Topic Beta"),
                topic("c", "QA Topic Gamma"),
              ],
            }
          : project,
    ),
  );
  const { page, context } = await f.client("root-admin");
  const groups = page.locator(".project-info-group");
  const picker = page.getByRole("combobox", {
    name: "Proje süzgeci",
    exact: true,
  });
  try {
    await f.check(
      "critical topics: the project filter keeps its choice and shows only that project",
      async () => {
        await page
          .getByRole("tab", { name: "Kritik Proje Konuları", exact: true })
          .click();
        await page.getByText("QA Topic Alpha", { exact: true }).waitFor();
        assert.equal(await groups.count(), 2);
        assert.deepEqual(await picker.locator("option").allTextContents(), [
          "Tüm projeler (2)",
          "Browser Project A (1)",
          "Browser Project B (2)",
        ]);
        await picker.selectOption({ label: "Browser Project B (2)" });
        assert.equal(await picker.inputValue(), "p-b");
        assert.equal(await groups.count(), 1);
        await page.getByText("QA Topic Gamma", { exact: true }).waitFor();
        assert.equal(
          await page.getByText("QA Topic Alpha", { exact: true }).count(),
          0,
        );
        // Status counts follow the chosen project.
        assert.match(
          await page
            .getByRole("group", { name: "Konu durumu", exact: true })
            .getByRole("button", { name: /^Tümü/ })
            .innerText(),
          /2$/,
        );
        await page
          .getByRole("button", { name: "Proje süzgecini kaldır", exact: true })
          .click();
        assert.equal(await picker.inputValue(), "");
        assert.equal(await groups.count(), 2);
      },
    );
  } finally {
    await context.close();
    const current = (await f.state()).projects;
    await setTopics(
      before.filter((project) =>
        current.some((item) => item.id === project.id),
      ),
    );
  }
}
