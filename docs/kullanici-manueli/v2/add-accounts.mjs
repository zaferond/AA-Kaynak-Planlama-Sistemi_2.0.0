// Adds temporary screenshot accounts to a copy of the demo database.
import path from "node:path";
const root = process.env.APP_ROOT;
const { Store } = await import(path.join(root, "backend/store.mjs"));
const { hashPassword } = await import(path.join(root, "backend/auth.mjs"));
const store = new Store({
  env: { ...process.env, DB_PROVIDER: "sqljs", SQLJS_FILE: process.argv[2] },
});
await store.connect();
try {
  const password = await hashPassword("Manuel-Gorsel-2026!");
  const base = {
    leaders: [],
    active: true,
    password,
    version: 1,
    revision: 1,
    resourceId: "",
  };
  await store.bootstrapUser({
    ...base,
    _id: "manual-admin",
    username: "sistem.admin",
    name: "Sistem Yöneticisi",
    role: "admin",
  });
  await store.bootstrapUser({
    ...base,
    _id: "manual-proje",
    username: "proje.ofisi",
    name: "Proje Ofisi",
    role: "normal",
    projectEditor: true,
  });
  console.log(
    "ok",
    (await store.findUser({ id: "manual-proje" })).projectEditor,
  );
} finally {
  await store.close();
}
