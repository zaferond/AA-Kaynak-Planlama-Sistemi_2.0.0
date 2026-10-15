import { Store } from "./store.mjs";
import { hashPassword } from "./auth.mjs";
import { actualVersionAt, currentPlanningMonth } from "./domain/index.mjs";
if (process.env.NODE_ENV === "production")
  throw Error("Test hesapları canlı ortamda oluşturulamaz.");
const password = process.env.TEST_USER_PASSWORD;
if (!password) throw Error("TEST_USER_PASSWORD ortam değişkeni gereklidir.");
const store = new Store();
try {
  await store.connect();
  const { data } = await store.read();
  const users = await store.users();
  const occupied = new Set(
    users
      .filter(
        (user) => !["normal-test", "yonetici-test"].includes(user.username),
      )
      .map((user) => user.resourceId)
      .filter(Boolean),
  );
  const month = currentPlanningMonth();
  const person = data.resources.find((resource) => {
    const version = actualVersionAt(resource, month);
    return (
      !occupied.has(resource.id) &&
      version?.included &&
      ["Aktif Çalışan", "Gear Up", "SAAT Ücretli Ofis Ç."].includes(
        version.status,
      ) &&
      data.teams.some((team) => team.id === version.team && team.lead)
    );
  });
  const team =
    person &&
    data.teams.find((item) => item.id === actualVersionAt(person, month)?.team);
  const lead = team?.lead || data.teams.find((item) => item.lead)?.lead;
  for (const account of [
    {
      username: "normal-test",
      name: "Normal Test Kullanıcısı",
      role: "normal",
      resourceId: person?.id || "",
    },
    {
      username: "yonetici-test",
      name: "Yönetici Test Kullanıcısı",
      role: "manager",
      resourceId: "",
    },
  ]) {
    await store.transaction(async (session) => {
      const existing = await store.findUser(
        { username: account.username },
        session,
      );
      const next = {
        _id: existing?._id || "test-role-" + account.role,
        username: account.username,
        name: account.name,
        role: account.role,
        leaders: lead ? [lead] : [],
        resourceId: account.resourceId,
        active: true,
        password: await hashPassword(password),
        revision: (existing?.revision || 0) + 1,
        version: (existing?.version || 0) + 1,
      };
      await store.saveUser(next, session);
      await store.revokeUser(next._id, session);
      await session.query(
        "UPDATE kp_settings SET generation=generation+1 WHERE id=1",
      );
    });
    console.log(account.username + " hesabı hazır.");
  }
  console.log("Yetkili liderlik: " + (lead || "Atanmadı"));
  console.log(
    "Normal kullanıcı çalışan eşleştirmesi: " + (person?.name || "Atanmadı"),
  );
} finally {
  await store.close();
}
