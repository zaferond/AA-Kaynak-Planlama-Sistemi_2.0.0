import { ROOT_ADMIN_ID } from "../shared/access.ts";
import { Store } from "./store.mjs";
import { hashPassword } from "./auth.mjs";
const password = await hashPassword(process.env.NEW_ADMIN_PASSWORD),
  s = new Store();
try {
  await s.connect();
  await s.transaction(async (c) => {
    const u = await s.findUser({ id: ROOT_ADMIN_ID }, c);
    if (!u) throw Error("Önce sistemi başlatın.");
    await s.saveUser(
      { ...u, password, revision: u.revision + 1, version: u.version + 1 },
      c,
    );
    await s.revokeUser(u._id, c);
  });
  console.log(
    "Şifre değiştirildi. NEW_ADMIN_PASSWORD satırını .env dosyasından silin.",
  );
} finally {
  await s.close();
}
