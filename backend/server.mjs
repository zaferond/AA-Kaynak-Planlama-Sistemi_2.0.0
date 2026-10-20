import { ROOT_ADMIN_ID } from "../shared/access.ts";
import { httpConfig } from "./http-config.mjs";
import { Store } from "./store.mjs";
import { createApp } from "./app.mjs";
import { hashPassword } from "./auth.mjs";
import { assertAdminPassword } from "./admin-credentials.mjs";
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
      throw Error(
        "ADMIN_USERNAME boş veya geçersiz. Yerelde npm run setup çalıştırın; MSSQL kurulumunda .env içine ilk yönetici kullanıcı adını yazın.",
      );
    assertAdminPassword(env.ADMIN_PASSWORD, username);
    await store.bootstrapUser({
      _id: ROOT_ADMIN_ID,
      username,
      name: "Sistem Yöneticisi",
      role: "admin",
      leaders: [],
      active: true,
      password: await hashPassword(env.ADMIN_PASSWORD),
      // The .env password is known to whoever set up the server: the first
      // login must replace it inside the application.
      mustChangePassword: true,
      revision: 1,
      version: 1,
    });
  }
  const { synchronizeProgressStarts } = await import("./progress-commands.mjs");
  const progressSnapshot = (await store.read()).data;
  const preview = {
    ...progressSnapshot,
    revisions: { ...progressSnapshot.revisions },
  };
  if (synchronizeProgressStarts(preview)) {
    const actor = await store.findUser({ id: ROOT_ADMIN_ID });
    const count = await store.mutate(actor, (data) =>
      synchronizeProgressStarts(data),
    );
    console.log(
      "Kaynak dağılımına göre başlangıcı güncellenen ilerleme kaydı:",
      count,
    );
  }
  const slowRequestMs = Number(env.SLOW_REQUEST_MS ?? 2000);
  if (!Number.isFinite(slowRequestMs) || slowRequestMs < 0)
    throw Error("SLOW_REQUEST_MS 0 veya pozitif bir sayı olmalıdır.");
  const app = createApp(store, {
    origin,
    slowRequestMs,
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
