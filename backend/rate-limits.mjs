import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";

export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const ATTEMPT_LIMITS = Object.freeze({
  ip: 60,
  account: 15,
  userEdit: 60,
});

function unavailable() {
  return Object.assign(
    Error("Giriş korumasına ulaşılamıyor. Biraz sonra tekrar deneyin."),
    {
      status: 503,
      retryAfter: 30,
    },
  );
}

// Equivalent IPv6 spellings and IPv4-mapped addresses share the same budget.
// IPv6 privacy addresses within a /64 also share an IP budget.
export function clientAddressKey(address) {
  const version = isIP(address || "");
  if (version === 4) return address;
  if (version !== 6 || address.includes("%"))
    throw Object.assign(Error("İstemci IP adresi doğrulanamadı."), {
      status: 400,
    });
  const canonical = new URL("http://[" + address + "]").hostname.slice(1, -1);
  if (canonical.startsWith("::ffff:")) {
    const parts = canonical
      .slice(7)
      .split(":")
      .map((part) => parseInt(part, 16));
    return [parts[0] >> 8, parts[0] & 255, parts[1] >> 8, parts[1] & 255].join(
      ".",
    );
  }
  const [left, right] = canonical.split("::");
  const prefix = left ? left.split(":") : [];
  const suffix = right ? right.split(":") : [];
  const words =
    right === undefined
      ? prefix
      : [
          ...prefix,
          ...Array(8 - prefix.length - suffix.length).fill("0"),
          ...suffix,
        ];
  return (
    words
      .slice(0, 4)
      .map((word) => word.padStart(4, "0"))
      .join(":") + "::/64"
  );
}

export class MemoryAttemptStore {
  constructor({ now = Date.now, maxEntries = 10000 } = {}) {
    this.now = now;
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }
  async reserve(key, max) {
    const now = this.now();
    let entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= now) {
      if (!entry && this.entries.size >= this.maxEntries) {
        await this.cleanup();
        if (this.entries.size >= this.maxEntries) throw unavailable();
      }
      entry = {
        attempts: 0,
        expiresAt: now + ATTEMPT_WINDOW_MS,
        windowId: randomUUID(),
      };
      this.entries.set(key, entry);
    }
    if (entry.attempts >= max)
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)),
      };
    entry.attempts++;
    return { allowed: true, windowId: entry.windowId };
  }
  async release(key, windowId) {
    const entry = this.entries.get(key);
    if (entry?.windowId === windowId)
      entry.attempts = Math.max(0, entry.attempts - 1);
  }
  async cleanup() {
    const now = this.now();
    for (const [key, entry] of this.entries)
      if (entry.expiresAt <= now) this.entries.delete(key);
  }
}

// SQL.js exercises the portable repository in tests. Production uses MSSQL's
// clock and per-bucket transaction lock across independent connection pools.
export class DatabaseAttemptStore {
  constructor(db, { provider = "mssql", now = Date.now } = {}) {
    if (!["mssql", "sqljs"].includes(provider))
      throw Error("Geçersiz sayaç sağlayıcısı.");
    this.db = db;
    this.provider = provider;
    this.now = now;
  }
  transaction(key, fn) {
    return this.provider === "mssql"
      ? this.db.rateLimitTransaction(key, fn)
      : this.db.transaction(fn);
  }
  async reserve(key, max) {
    return this.transaction(key, async (c) => {
      const now =
        this.provider === "mssql"
          ? Number(
              (
                await c.query(
                  "SELECT DATEDIFF_BIG(millisecond, CONVERT(datetime2,'1970-01-01'), SYSUTCDATETIME()) AS now_ms",
                )
              ).rows[0].now_ms,
            )
          : this.now();
      let row = (
        await c.query(
          "SELECT * FROM kp_rate_limits WHERE bucket_hash=CAST(@p0 AS varchar(64))",
          [key],
        )
      ).rows[0];
      if (!row || Number(row.expires_at) <= now)
        row = {
          bucket_hash: key,
          window_id: randomUUID(),
          attempts: 0,
          expires_at: now + ATTEMPT_WINDOW_MS,
        };
      if (Number(row.attempts) >= max)
        return {
          allowed: false,
          retryAfter: Math.max(
            1,
            Math.ceil((Number(row.expires_at) - now) / 1000),
          ),
        };
      await c.upsert("rate_limits", [
        {
          ...row,
          attempts: Number(row.attempts) + 1,
          expires_at: Number(row.expires_at),
        },
      ]);
      return { allowed: true, windowId: row.window_id };
    });
  }
  async release(key, windowId) {
    await this.transaction(key, (c) =>
      c.query(
        "UPDATE kp_rate_limits SET attempts=attempts-1 WHERE bucket_hash=CAST(@p0 AS varchar(64)) AND window_id=CAST(@p1 AS varchar(36)) AND attempts>0",
        [key, windowId],
      ),
    );
  }
  async cleanup() {
    if (this.provider === "mssql")
      await this.db.query(
        "DELETE TOP (1000) FROM kp_rate_limits WHERE expires_at<=DATEDIFF_BIG(millisecond, CONVERT(datetime2,'1970-01-01'), SYSUTCDATETIME())",
      );
    else
      await this.db.transaction((c) =>
        c.query("DELETE FROM kp_rate_limits WHERE expires_at<=@p0", [
          this.now(),
        ]),
      );
  }
}

export class AttemptLimiter {
  constructor(store = new MemoryAttemptStore()) {
    this.store = store;
  }
  async reserve(scope, value, max) {
    const key = createHash("sha256")
      .update(JSON.stringify([scope, value]))
      .digest("hex");
    let receipt;
    try {
      receipt = await this.store.reserve(key, max);
    } catch {
      // Never fall back to a fresh local budget when the shared store fails.
      throw unavailable();
    }
    if (!receipt.allowed)
      throw Object.assign(
        Error("Çok fazla deneme. Daha sonra tekrar deneyin."),
        {
          status: 429,
          retryAfter: receipt.retryAfter,
        },
      );
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      try {
        await this.store.release(key, receipt.windowId);
      } catch {
        throw unavailable();
      }
    };
  }
  cleanup() {
    return this.store.cleanup();
  }
}

export function createAttemptLimiter(store) {
  return new AttemptLimiter(
    store.provider === "mssql"
      ? new DatabaseAttemptStore(store.db)
      : new MemoryAttemptStore(),
  );
}
