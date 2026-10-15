import { directoryUserSchema } from "../shared/directory-identity.ts";
import { fail } from "./auth.mjs";

export async function authenticateDirectoryAccount(
  store,
  directory,
  username,
  password,
  reserveAttempt,
) {
  if (!password) return null; // Never attempt an anonymous LDAP bind.
  const found = await directory.findByLogin(username);
  if (!found) return null;
  const person = directoryUserSchema.parse(found);
  let user = await store.findUser({ directoryId: person.id });
  if (!user?.active || user.authSource !== "ldap") return null;
  const releaseAttempt = await reserveAttempt?.(person.id);
  if (!(await directory.verifyCredentials(person.id, password))) return null;
  if (
    user.username !== person.username ||
    user.name !== person.name ||
    user.email !== person.email
  ) {
    user = await store.mutate(
      user,
      async (_d, active, session) => {
        if (active.authSource !== "ldap" || active.directoryId !== person.id)
          fail(401, "Kurumsal hesap doğrulanamadı.");
        const collision = await store.findUser(
          { username: person.username },
          session,
        );
        if (collision && collision._id !== active._id)
          fail(
            409,
            "Kurumsal kullanıcı adı başka bir hesapla çakışıyor. Sistem yöneticinizle görüşün.",
          );
        const updated = {
          ...active,
          username: person.username,
          name: person.name,
          email: person.email,
          revision: active.revision + 1,
          version: active.version + 1,
        };
        await store.saveUser(updated, session);
        await store.revokeUser(active._id, session);
        return updated;
      },
      { auditUsers: true },
    );
  }
  await releaseAttempt?.();
  return user;
}
