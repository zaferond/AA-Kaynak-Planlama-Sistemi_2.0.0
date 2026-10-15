import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkSharedDependencies } from "../scripts/domain-boundaries.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
async function fixture(t, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aa-domain-boundary-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "shared"));
  for (const [name, source] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), source);
  }
  return root;
}

test("current shared sources obey the recursive domain boundary", async () => {
  const result = await checkSharedDependencies(projectRoot);
  assert(result.files.includes("shared/server-domain.ts"));
  assert.deepEqual(result.violations, []);
});

test("portable local imports and reviewed schema dependency pass; comments and strings are not imports", async (t) => {
  const root = await fixture(t, {
    "shared/nested/allowed.ts": `
      import { z } from 'zod';
      import type { Model } from '../model.ts';
      export { Model } from '../model.ts';
      type T = import('../model.ts').Model;
      const load = () => import(\`../model.ts\`);
      const cjs = require('../model.ts');
      // import('../backend/never-execute.mjs');
      const text = "from 'react'";
    `,
    "shared/model.ts": "export type Model = string;",
    "shared/reactive-frontend-model.ts": "export const value = 1;",
    "shared/local.ts": "import './reactive-frontend-model.ts';",
  });
  const result = await checkSharedDependencies(root);
  assert.equal(result.files.length, 4);
  assert.deepEqual(result.violations, []);
});

const forms = {
  named: 'import { app } from "../../backend/app.mjs";',
  sideEffect: 'import "../../backend/app.mjs";',
  reExport: 'export { app } from "../../backend/app.mjs";',
  exportAll: 'export * from "../../backend/app.mjs";',
  typeOnly: 'import type { App } from "../../backend/app.mjs";',
  importType: 'type App = import("../../backend/app.mjs").App;',
  importEquals: 'import app = require("../../backend/app.mjs");',
  dynamic: 'const app = import("../../backend/app.mjs");',
  template: "const app = import(`../../backend/app.mjs`);",
  require: 'const app = require("../../backend/app.mjs");',
  requireResolve: 'require.resolve("../../backend/app.mjs");',
  moduleRequire: 'module.require("../../backend/app.mjs");',
  escapedLiteral: 'import "../../back\\u0065nd/app.mjs";',
};
for (const [name, source] of Object.entries(forms))
  test(`nested ${name} application dependency is rejected with location`, async (t) => {
    const root = await fixture(t, { "shared/nested/probe.ts": "\n" + source });
    const result = await checkSharedDependencies(root);
    assert.equal(result.violations.length, 1);
    const issue = result.violations[0];
    assert.equal(issue.file, "shared/nested/probe.ts");
    assert.equal(issue.line, 2);
    assert(issue.column > 0);
    assert.match(issue.reason, /leaves/);
  });

test("TS, JS, declaration and JSX file variants are checked recursively", async (t) => {
  const extensions = [
    "ts",
    "tsx",
    "mts",
    "cts",
    "js",
    "jsx",
    "mjs",
    "cjs",
    "d.ts",
  ];
  const files = Object.fromEntries(
    extensions.map((extension, i) => [
      `shared/nested/${i}.${extension}`,
      'export * from "../../frontend/src/App";',
    ]),
  );
  const result = await checkSharedDependencies(await fixture(t, files));
  assert.equal(result.files.length, extensions.length);
  assert.equal(result.violations.length, extensions.length);
});

test("path traversal, platform modules, aliases and unreviewed packages cannot bypass the boundary", async (t) => {
  const dependencies = [
    "../backend/app.mjs",
    "./nested/../../frontend/App",
    "../outside/helper.ts",
    "./node_modules/vendor/index.js",
    "node:fs",
    "react",
    "react/jsx-runtime",
    "react-dom/client",
    "@/src/App",
    "@shared/model",
    "file:///backend/app.mjs",
    "C:/application/backend/app.mjs",
    "unreviewed-library",
  ];
  const files = Object.fromEntries(
    dependencies.map((specifier, i) => [
      `shared/probe-${i}.ts`,
      `import ${JSON.stringify(specifier)};`,
    ]),
  );
  const result = await checkSharedDependencies(await fixture(t, files));
  assert.equal(result.violations.length, dependencies.length);
});

test("computed imports fail closed instead of pretending their target is known", async (t) => {
  const forms = [
    "import(target);",
    'import("../" + target);',
    "import(`../${target}`);",
    "require(target);",
    "require.resolve(target);",
    "module.require(target);",
  ];
  const files = Object.fromEntries(
    forms.map((source, i) => [`shared/probe-${i}.ts`, source]),
  );
  const result = await checkSharedDependencies(await fixture(t, files));
  assert.equal(result.violations.length, forms.length);
  assert(result.violations.every((issue) => /Computed/.test(issue.reason)));
});

test("parse failures cannot produce a passing architecture check", async (t) => {
  const result = await checkSharedDependencies(
    await fixture(t, {
      "shared/broken.ts": "export const broken = ;",
    }),
  );
  assert(result.violations.some((issue) => /parsed/.test(issue.reason)));
});

test("triple slash path and type references obey the same boundary", async (t) => {
  const result = await checkSharedDependencies(
    await fixture(t, {
      "shared/allowed.d.ts": '/// <reference path="./model.ts" />',
      "shared/model.ts": "export const value = 1;",
      "shared/path.d.ts": '/// <reference path="../backend/app.mjs" />',
      "shared/type.d.ts": '/// <reference types="react" />',
    }),
  );
  assert.deepEqual(
    result.violations.map((issue) => issue.file),
    ["shared/path.d.ts", "shared/type.d.ts"],
  );
});

test("a shared directory symlink is rejected without traversing external code", async (t) => {
  const root = await fixture(t, {
    "backend/app.mjs": "throw Error('never load');",
  });
  try {
    await fs.symlink(
      path.join(root, "backend"),
      path.join(root, "shared", "bridge"),
      "junction",
    );
  } catch (error) {
    if (!["EPERM", "ENOTSUP"].includes(error.code)) throw error;
    t.skip("Directory links unavailable in this test environment");
    return;
  }
  const result = await checkSharedDependencies(root);
  assert.equal(result.files.length, 0);
  assert.match(result.violations[0].reason, /symlink/);
});

async function cliFixture(t, source) {
  const root = await fixture(t, {
    "shared/server-domain.ts": source,
    "package.json": '{"type":"module"}',
    "backend/tripwire.mjs": `
      import fs from 'node:fs';
      fs.writeFileSync(new URL('../executed.txt', import.meta.url), 'executed');
    `,
  });
  await fs.mkdir(path.join(root, "scripts"));
  for (const name of ["domain-boundaries.mjs", "check-domain.mjs"])
    await fs.copyFile(
      path.join(projectRoot, "scripts", name),
      path.join(root, "scripts", name),
    );
  await fs.symlink(
    path.join(projectRoot, "node_modules"),
    path.join(root, "node_modules"),
    "junction",
  );
  const env = Object.fromEntries(
    ["PATH", "TMPDIR", "TEMP", "TMP", "LANG", "SystemRoot", "WINDIR"]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  return {
    root,
    run: () =>
      spawnSync(
        process.execPath,
        [path.join(root, "scripts/check-domain.mjs")],
        { cwd: root, env, encoding: "utf8", timeout: 15000 },
      ),
  };
}

test("CLI exits nonzero before executing an invalid domain's application import", async (t) => {
  const f = await cliFixture(
    t,
    'import "../backend/tripwire.mjs"; export const validate = () => {};',
  );
  const result = f.run();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /shared\/server-domain.ts:1:/);
  assert.match(result.stderr, /leaves/);
  await assert.rejects(fs.access(path.join(f.root, "executed.txt")), {
    code: "ENOENT",
  });
});

test("CLI retains the direct validation load after a clean static check", async (t) => {
  const f = await cliFixture(t, "export const validate = () => {};");
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /recursive AST dependency check passed/);
});
