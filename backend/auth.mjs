import {
  randomBytes,
  scrypt as cb,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(cb);
export const token = () => randomBytes(32).toString("base64url");
export const digest = (x) => createHash("sha256").update(x).digest("hex");
/** Current credentials use a 16-byte hex salt and a 64-byte scrypt digest. */
export function validPasswordRecord(stored) {
  return (
    !!stored &&
    typeof stored.salt === "string" &&
    /^[a-f0-9]{32}$/i.test(stored.salt) &&
    typeof stored.hash === "string" &&
    /^[a-f0-9]{128}$/i.test(stored.hash)
  );
}
export async function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 256
  )
    fail(400, "Şifre 10–256 karakter olmalıdır.");
  const salt = randomBytes(16).toString("hex");
  return {
    salt,
    hash: (
      await scrypt(password, salt, 64, {
        N: 32768,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
      })
    ).toString("hex"),
  };
}
export async function verifyPassword(password, stored) {
  if (
    typeof password !== "string" ||
    password.length > 256 ||
    !validPasswordRecord(stored)
  )
    return false;
  const actual = await scrypt(password, stored.salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const expected = Buffer.from(stored.hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const publicUser = (u) => ({
  id: u._id,
  username: u.username,
  name: u.name,
  role: u.role,
  resourceId: u.resourceId || "",
  ...(u.authSource === "ldap"
    ? { authSource: "ldap", directoryId: u.directoryId, email: u.email || "" }
    : {}),
  leaders: u.leaders,
  planningTeams: u.planningTeams || [],
  active: u.active,
});
export function fail(status, message) {
  throw Object.assign(Error(message), { status });
}
export function admin(u) {
  if (u.role !== "admin") fail(403, "Bu işlem için admin yetkisi gerekir.");
}
