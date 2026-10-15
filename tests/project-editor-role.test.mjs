import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { hashPassword, publicUser } from "../backend/auth.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { updatePermissions } from "../backend/user-commands.mjs";
import { scopeData } from "../shared/access.ts";

test('"Normal-Proje" accounts manage every project but nothing else', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-project-editor-"));
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "p.sqlite"),
  };
  let store = new Store({ env });
  try {
    await store.connect();
    const password = await hashPassword("Project-editor-test-1!");
    const account = (id, role, extra = {}) => ({
      _id: id,
      username: "qa." + id,
      name: id,
      role,
      resourceId: "",
      leaders: [],
      active: true,
      password,
      version: 1,
      revision: 1,
      ...extra,
    });
    await store.bootstrapUser(account("root-admin", "admin"));
    await store.bootstrapUser(
      account("editor", "normal", { projectEditor: true }),
    );
    await store.bootstrapUser(account("plain", "normal"));
    const admin = await store.findUser({ id: "root-admin" });
    const team = (await store.read()).data.teams.find((t) => t.lead);
    const project = (id, extra = {}) => ({
      id,
      name: "Proje " + id,
      start: "2026-01",
      end: "2026-12",
      phases: {},
      milestones: [],
      ...extra,
    });
    const secret = project("secret", {
      access: { roles: ["manager"], leaders: [], teams: [], people: [] },
    });
    await store.mutate(admin, (d, u) =>
      applyChanges(d, u, [
        { kind: "project", id: "secret", value: secret, revision: 0 },
      ]),
    );
    // The flag survives a restart and reaches the session principal.
    await store.close();
    store = new Store({ env });
    await store.connect();
    const editor = await store.findUser({ id: "editor" });
    const plain = await store.findUser({ id: "plain" });
    assert.equal(editor.projectEditor, true);
    assert.equal(publicUser(editor).projectEditor, true);
    assert.equal(plain.projectEditor, undefined);

    const data = (await store.read()).data;
    const view = scopeData(data, publicUser(editor));
    const seen = view.projects.find((p) => p.id === "secret");
    assert.deepEqual(seen.access, secret.access);
    assert.equal(view.revisions["project:secret"], 1);
    assert(
      !scopeData(data, publicUser(plain)).projects.some(
        (p) => p.id === "secret",
      ),
    );

    const create = (u, id) =>
      store.mutate(u, (d, user) =>
        applyChanges(d, user, [
          { kind: "project", id, value: project(id), revision: 0 },
        ]),
      );
    await create(editor, "new");
    await assert.rejects(create(plain, "denied"), /yetkiniz yok/);
    await store.mutate(editor, (d, u) =>
      applyChanges(d, u, [
        {
          kind: "project",
          id: "secret",
          value: {
            ...secret,
            name: "Gizli Proje",
            phases: { "2026-03": "Tasarım" },
          },
          revision: d.revisions["project:secret"],
        },
      ]),
    );
    await store.mutate(editor, (d, u) =>
      applyChanges(d, u, [
        {
          kind: "project",
          id: "new",
          operation: "delete",
          revision: d.revisions["project:new"],
        },
      ]),
    );
    const after = (await store.read()).data;
    assert.equal(
      after.projects.find((p) => p.id === "secret").name,
      "Gizli Proje",
    );
    assert(!after.projects.some((p) => p.id === "new"));
    // Project rights do not extend to resource planning.
    await assert.rejects(
      store.mutate(editor, (d, u) =>
        applyChanges(d, u, [
          {
            kind: "allocation",
            id: team.id + "|secret|2026-03",
            value: 1,
            revision: 0,
          },
        ]),
      ),
      /yetkiniz yok/,
    );
    // Changing the role back to a plain normal account removes the rights.
    await store.mutate(admin, async (d, u, c) =>
      updatePermissions(store, d, u, c, {
        id: "editor",
        role: "normal",
        leaders: [],
        planningTeams: [],
        projectEditor: false,
        resourceId: "",
        revision: editor.revision,
      }),
    );
    assert.equal(
      (await store.findUser({ id: "editor" })).projectEditor,
      undefined,
    );
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
