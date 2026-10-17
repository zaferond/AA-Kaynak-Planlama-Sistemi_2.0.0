import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { changeAndView } from "../backend/change-service.mjs";

test("deleting an employee records the linked account losing its link", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-employee-delete-"));
  const store = new Store({
    env: {
      NODE_ENV: "test",
      DB_PROVIDER: "sqljs",
      SQLJS_FILE: path.join(dir, "synthetic.sqlite"),
    },
  });
  try {
    await store.connect();
    const password = await hashPassword("Employee-delete-test-1!");
    const account = (id, role, resourceId = "") =>
      store.bootstrapUser({
        _id: id,
        username: "qa." + id,
        name: "QA " + id,
        role,
        resourceId,
        leaders: [],
        active: true,
        password,
        version: 1,
        revision: 1,
      });
    await account("root-admin", "admin");
    const admin = await store.findUser({ id: "root-admin" });
    const team = (await store.read()).data.teams.find(
      (t) => t.lead && t.kind !== "leadership",
    );
    await store.mutate(admin, (d, u) =>
      applyChanges(d, u, [
        {
          kind: "resource",
          id: "linked-person",
          revision: 0,
          value: {
            id: "linked-person",
            name: "Linked Person",
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
          },
        },
      ]),
    );
    await account("linked", "normal", "linked-person");
    const revision = (await store.read()).data.revisions[
      "resource:linked-person"
    ];
    await changeAndView(store, admin, [
      {
        kind: "resource",
        id: "linked-person",
        operation: "delete",
        value: null,
        revision,
      },
    ]);
    assert.equal((await store.findUser({ id: "linked" })).resourceId, "");
    const log = await store.auditLog(admin, { kind: "user" });
    assert(
      log.entries.some((entry) =>
        /qa\.linked|QA linked/.test(JSON.stringify(entry)),
      ),
      JSON.stringify(log.entries).slice(0, 500),
    );
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
