import { fail } from "../backend/auth.mjs";
// In-memory directory only. Never loads .env or creates a network connection.
export function syntheticDirectory(password) {
  const entries = new Map(),
    disabled = new Set();
  let unavailable = false;
  const check = () => {
    if (unavailable) fail(503, "Synthetic directory unavailable");
  };
  return {
    configured: true,
    add(user) {
      entries.set(user.id, structuredClone(user));
    },
    disable(id) {
      disabled.add(id);
    },
    enable(id) {
      disabled.delete(id);
    },
    update(id, patch) {
      entries.set(id, { ...entries.get(id), ...patch });
    },
    setUnavailable(value) {
      unavailable = value;
    },
    async listUsers(query = "") {
      check();
      return {
        users: [...entries.values()]
          .filter(
            (u) =>
              !disabled.has(u.id) &&
              (u.name + " " + u.username + " " + u.email)
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
          .map((u) => structuredClone(u)),
        hasMore: false,
      };
    },
    async getUser(id) {
      check();
      return disabled.has(id) ? null : structuredClone(entries.get(id) || null);
    },
    async findByLogin(username) {
      check();
      const u = [...entries.values()].find(
        (u) =>
          !disabled.has(u.id) &&
          (u.username === username || u.email === username),
      );
      return structuredClone(u || null);
    },
    async verifyCredentials(id, value) {
      check();
      return entries.has(id) && !disabled.has(id) && value === password;
    },
    async ensureActive(id) {
      check();
      if (!entries.has(id) || disabled.has(id))
        fail(401, "Synthetic directory account disabled");
    },
  };
}
