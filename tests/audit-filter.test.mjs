import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { applyChanges } from "../backend/operations.mjs";

test("audit log filters by record kind and by record or actor text, treating wildcards literally", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-audit-filter-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "a.sqlite"),
    },
  });
  try {
    await store.connect();
    await store.bootstrapUser({
      _id: "root-admin",
      username: "qa.admin",
      name: "Denetim Yöneticisi",
      role: "admin",
      resourceId: "",
      leaders: [],
      active: true,
      password: await hashPassword("Audit-filter-test-1!"),
      version: 1,
      revision: 1,
    });
    const admin = await store.findUser({ id: "root-admin" });
    const project = (id, name) => ({
      kind: "project",
      id,
      value: {
        id,
        name,
        start: "2026-01",
        end: "2026-12",
        phases: {},
        milestones: [],
      },
      revision: 0,
    });
    await store.mutate(admin, (d, u) =>
      applyChanges(d, u, [
        project("p1", "Kartal 8x8"),
        project("p2", "Yüzde %50_[özel]"),
        project("p3", "Şahin 6x6"),
      ]),
    );
    const all = await store.auditLog(admin, { offset: 0, limit: 50 });
    const projects = await store.auditLog(admin, {
      offset: 0,
      limit: 50,
      kind: "project",
    });
    assert.equal(projects.total, 3);
    assert(all.total >= projects.total);
    assert.deepEqual(
      (
        await store.auditLog(admin, { offset: 0, limit: 50, q: "KARTAL" })
      ).entries.map((e) => e.record_name),
      ["Kartal 8x8"],
    );
    assert.equal(
      (await store.auditLog(admin, { offset: 0, limit: 50, q: "%50_[" })).total,
      1,
    );
    assert.equal(
      (await store.auditLog(admin, { offset: 0, limit: 50, q: "%" })).total,
      1,
    );
    assert.equal(
      (await store.auditLog(admin, { offset: 0, limit: 50, q: "_" })).total,
      1,
    );
    assert.equal(
      (await store.auditLog(admin, { offset: 0, limit: 50, kind: "team" }))
        .total,
      0,
    );
    const byActor = await store.auditLog(admin, {
      offset: 0,
      limit: 2,
      q: "Denetim",
    });
    assert.equal(byActor.total, all.total);
    assert.equal(byActor.entries.length, 2);
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
