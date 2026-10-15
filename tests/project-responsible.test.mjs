import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { validate } from "../backend/domain/index.mjs";

test("project responsible is saved, updated and restored after restart", async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "aa-project-responsible-"),
  );
  const store = new Store({
    env: { DB_PROVIDER: "sqljs", SQLJS_FILE: path.join(dir, "plan.sqlite") },
  });
  try {
    await store.connect();
    async function save(responsibleName) {
      await store.transaction(async (c) => {
        const { data } = await store.read(c);
        const project = {
          id: "responsible-project",
          name: "Tasarım",
          responsibleName,
          start: "2026-01",
          end: "2026-12",
          phases: {},
        };
        const next = validate({
          ...data,
          projects: [
            ...data.projects.filter((p) => p.id !== project.id),
            project,
          ],
        });
        assert.equal(
          next.projects.find((p) => p.id === project.id).responsibleName,
          responsibleName.trim(),
        );
        await store.persist(data, next, c);
        assert.equal(
          (
            await c.query(
              "SELECT responsible_name FROM kp_projects WHERE id=@p0",
              [project.id],
            )
          ).rows[0].responsible_name,
          responsibleName.trim(),
        );
      });
    }
    await save(" Ayşe Yılmaz ");
    assert.equal(
      (await store.read()).data.projects.find(
        (p) => p.id === "responsible-project",
      ).responsibleName,
      "Ayşe Yılmaz",
    );
    await store.close();
    await store.connect();
    assert.equal(
      (await store.read()).data.projects.find(
        (p) => p.id === "responsible-project",
      ).responsibleName,
      "Ayşe Yılmaz",
    );
    await save("Mehmet Demir");
    assert.equal(
      (await store.read()).data.projects.find(
        (p) => p.id === "responsible-project",
      ).responsibleName,
      "Mehmet Demir",
    );
    await assert.rejects(() => save("x".repeat(201)), /at most 200|too_big/i);
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
