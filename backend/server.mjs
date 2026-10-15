import { ROOT_ADMIN_ID } from "../shared/access.ts";
import { httpConfig } from "./http-config.mjs";
import { Store } from "./store.mjs";
import { createApp } from "./app.mjs";
import { hashPassword } from "./auth.mjs";
import { fileURLToPath } from "node:url";
import { verifyDeployment } from "../scripts/deployment-manifest.mjs";
import { mutationAdmissionConfig } from "./mutation-admission.mjs";
const env = process.env;
// Validate public HTTP settings before opening or bootstrapping any database.
const { origin, port, host, trustedProxies } = httpConfig(env);
const mutationLimits = mutationAdmissionConfig(env);
// Reject mixed/stale packages before constructing or opening the database.
try {
  const verification = await verifyDeployment(
    fileURLToPath(new URL("../", import.meta.url)),
  );
  if (!verification.ok)
    throw Error(
      "Kaynaklar ve derleme eşleşmiyor. Doğru paketi seçip npm run build çalıştırın.",
    );
} catch (error) {
  console.error(
    "Başlatılamadı: dağıtım doğrulanamadı. " +
      (error.code ? "Paket dosyaları okunamadı." : error.message),
  );
  process.exit(1);
}
const store = new Store();
try {
  const { createActiveDirectory } = await import("./active-directory.mjs");
  const directory = await createActiveDirectory(env);
  await store.connect();
  console.log("Veritabanı modu:", store.provider);
  console.log(
    "Giriş sayacı:",
    store.provider === "mssql" ? "ortak MSSQL deposu" : "yerel süreç belleği",
  );
  if (!(await store.findUser({ id: ROOT_ADMIN_ID }))) {
    const username = (env.ADMIN_USERNAME || "").trim().toLowerCase();
    if (!/^[a-z0-9._@+-]{3,100}$/.test(username))
      throw Error("Önce npm run setup komutunu çalıştırın.");
    await store.bootstrapUser({
      _id: ROOT_ADMIN_ID,
      username,
      name: "Sistem Yöneticisi",
      role: "admin",
      leaders: [],
      active: true,
      password: await hashPassword(env.ADMIN_PASSWORD),
      revision: 1,
      version: 1,
    });
  }
  const app = createApp(store, {
    origin,
    trustedProxies,
    mutationLimits,
    directory,
  });
  const server = app.listen(port, host, () =>
    console.log(
      "\nSistem hazır: " +
        origin +
        "\nBu pencere açık kalmalı. Durdurmak için Control+C.",
    ),
  );
  server.on("error", async (e) => {
    console.error(
      e.code === "EADDRINUSE"
        ? port + " portu kullanımda. Önce açık olan eski portalı durdurun."
        : "Sunucu başlatılamadı: " + e.code,
    );
    app.locals.close();
    await store.close();
    process.exitCode = 1;
  });
  for (const sig of ["SIGINT", "SIGTERM"])
    process.once(sig, () =>
      server.close(async () => {
        app.locals.close();
        await store.close();
        process.exit(0);
      }),
    );
} catch (e) {
  console.error("Başlatılamadı:", e.code || e.message);
  console.error(
    "Yerel modda dosya kilidini; MSSQL modunda sunucu, ağ erişimi ve .env ayarlarını kontrol edin.",
  );
  await store.close();
  process.exitCode = 1;
}
