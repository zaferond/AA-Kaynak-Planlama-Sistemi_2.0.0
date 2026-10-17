import fs from "node:fs/promises";
import {
  Client,
  AndFilter,
  OrFilter,
  NotFilter,
  EqualityFilter,
  SubstringFilter,
  ExtensibleFilter,
} from "ldapts";
import { directoryUserSchema } from "../shared/directory-identity.ts";
import { fail } from "./auth.mjs";

const unavailable = () =>
  Object.assign(
    Error(
      "Active Directory bağlantısı kullanılamıyor. Sistem yöneticinizle görüşün.",
    ),
    { status: 503 },
  );
export const disabledDirectory = Object.freeze({
  configured: false,
  listUsers: async () => {
    throw unavailable();
  },
  getUser: async () => {
    throw unavailable();
  },
  findByLogin: async () => {
    throw unavailable();
  },
  verifyCredentials: async () => {
    throw unavailable();
  },
  ensureActive: async () => {
    throw unavailable();
  },
});
export function activeDirectoryConfig(env = {}) {
  if (env.AD_ENABLED === undefined || env.AD_ENABLED === "false") return null;
  if (env.AD_ENABLED !== "true")
    throw Error("AD_ENABLED true veya false olmalıdır.");
  let url;
  try {
    url = new URL(env.AD_LDAP_URL);
  } catch {
    throw Error("AD_LDAP_URL geçerli bir LDAPS adresi olmalıdır.");
  }
  if (
    url.protocol !== "ldaps:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  )
    throw Error("AD_LDAP_URL yalnızca ldaps://sunucu:port içermelidir.");
  for (const key of ["AD_BASE_DN", "AD_BIND_DN", "AD_BIND_PASSWORD"])
    if (
      typeof env[key] !== "string" ||
      !env[key].trim() ||
      env[key].length > 2000
    )
      throw Error(key + " tanımlanmalıdır.");
  const groupDN = env.AD_GROUP_DN || "";
  if (groupDN.length > 2000) throw Error("AD_GROUP_DN çok uzun.");
  return {
    url: url.href,
    baseDN: env.AD_BASE_DN,
    bindDN: env.AD_BIND_DN,
    bindPassword: env.AD_BIND_PASSWORD,
    groupDN,
    caFile: env.AD_CA_FILE || "",
  };
}
const attributes = [
  "objectGUID",
  "sAMAccountName",
  "displayName",
  "mail",
  "userAccountControl",
  "msDS-User-Account-Control-Computed",
  "accountExpires",
];
const one = (value) =>
  Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : value;
function profile(entry, now) {
  const guid = one(entry.objectGUID),
    flags = String(one(entry.userAccountControl) ?? ""),
    computed = String(one(entry["msDS-User-Account-Control-Computed"]) ?? "0");
  if (
    !Buffer.isBuffer(guid) ||
    guid.length !== 16 ||
    !/^\d+$/.test(flags) ||
    !/^\d+$/.test(computed) ||
    Number(flags) & 2 ||
    Number(computed) & (16 | 8388608)
  )
    return null;
  const expires = String(one(entry.accountExpires) ?? "0");
  if (!/^\d+$/.test(expires)) return null;
  const expiry = BigInt(expires);
  if (
    expiry !== 0n &&
    expiry !== 9223372036854775807n &&
    expiry <= (BigInt(now) + 11644473600000n) * 10000n
  )
    return null;
  const username = one(entry.sAMAccountName);
  const parsed = directoryUserSchema.safeParse({
    id: guid.toString("hex"),
    username,
    name: one(entry.displayName) || username,
    email: one(entry.mail) || "",
  });
  return parsed.success && typeof entry.dn === "string" && entry.dn
    ? { ...parsed.data, dn: entry.dn }
    : null;
}
const publicProfile = ({ dn, ...user }) => user;
// Never logs the bind password: LDAP errors do not carry it. Messages are
// shortened so a verbose server diagnostic cannot flood the log.
function logLdapFailure(error) {
  console.error(
    "LDAP isteği başarısız:",
    error?.name || "Error",
    error?.code ?? "",
    String(error?.message || "").slice(0, 200),
  );
}
export class ActiveDirectory {
  configured = true;
  #config;
  #createClient;
  #now;
  #active = 0;
  #waiting = [];
  #limits;
  #cache = new Map();
  #pending = new Map();
  /** At most `activeLimit` LDAP connections; further requests wait up to
   * `waitMs` in a bounded queue (the 09:00 login burst) before a 503. */
  constructor(
    config,
    createClient,
    now = Date.now,
    { activeLimit = 4, pendingLimit = 32, waitMs = 3000 } = {},
  ) {
    this.#config = config;
    this.#createClient = createClient;
    this.#now = now;
    this.#limits = { activeLimit, pendingLimit, waitMs };
  }
  #slot() {
    if (this.#active < this.#limits.activeLimit) {
      this.#active++;
      return Promise.resolve();
    }
    if (this.#waiting.length >= this.#limits.pendingLimit)
      return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
      const entry = {};
      const timer = setTimeout(() => {
        this.#waiting.splice(this.#waiting.indexOf(entry), 1);
        reject(unavailable());
      }, this.#limits.waitMs);
      timer.unref?.();
      // The releasing connection hands its slot over; #active is unchanged.
      entry.resolve = () => {
        clearTimeout(timer);
        resolve();
      };
      this.#waiting.push(entry);
    });
  }
  #release() {
    const next = this.#waiting.shift();
    if (next) next.resolve();
    else this.#active--;
  }
  #filter(term) {
    // Use typed filters: string parsing can corrupt binary GUID / UTF-8 values.
    // All caller input remains a value; it never becomes LDAP filter syntax.
    return new AndFilter({
      filters: [
        new EqualityFilter({ attribute: "objectCategory", value: "person" }),
        new EqualityFilter({ attribute: "objectClass", value: "user" }),
        new NotFilter({
          filter: new ExtensibleFilter({
            matchType: "userAccountControl",
            rule: "1.2.840.113556.1.4.803",
            value: "2",
          }),
        }),
        ...(this.#config.groupDN
          ? [
              new ExtensibleFilter({
                matchType: "memberOf",
                rule: "1.2.840.113556.1.4.1941",
                value: this.#config.groupDN,
              }),
            ]
          : []),
        ...(term ? [term] : []),
      ],
    });
  }
  async #connection(run) {
    await this.#slot();
    let client;
    try {
      client = this.#createClient();
      await client.bind(this.#config.bindDN, this.#config.bindPassword);
      return await run(client);
    } catch (error) {
      if (error.status === 401) throw error;
      // The server log keeps the cause (wrong bind password, certificate,
      // timeout); the response never exposes LDAP DNs or diagnostics.
      logLdapFailure(error);
      throw unavailable();
    } finally {
      if (client) await client.unbind().catch(() => {});
      this.#release();
    }
  }
  async #lookup(term) {
    return this.#connection(async (client) => {
      const result = await client.search(this.#config.baseDN, {
        scope: "sub",
        filter: this.#filter(term),
        attributes,
        explicitBufferAttributes: ["objectGUID"],
        sizeLimit: 2,
        timeLimit: 5,
      });
      if (result.searchReferences?.length || result.searchEntries.length !== 1)
        return null;
      return profile(result.searchEntries[0], this.#now());
    });
  }
  async listUsers(query = "") {
    const term = query
      ? new OrFilter({
          filters: ["sAMAccountName", "displayName", "mail"].map(
            (attribute) => new SubstringFilter({ attribute, any: [query] }),
          ),
        })
      : null;
    return this.#connection(async (client) => {
      // One bounded page only. The UI searches again instead of downloading the directory.
      for await (const result of client.searchPaginated(this.#config.baseDN, {
        scope: "sub",
        filter: this.#filter(term),
        attributes,
        explicitBufferAttributes: ["objectGUID"],
        paged: { pageSize: 51 },
        timeLimit: 5,
      })) {
        if (result.searchReferences?.length) throw unavailable();
        return {
          users: result.searchEntries
            .slice(0, 50)
            .map((r) => profile(r, this.#now()))
            .filter(Boolean)
            .map(publicProfile),
          hasMore: result.searchEntries.length >= 51,
        };
      }
      return { users: [], hasMore: false };
    });
  }
  async #byId(id) {
    if (!/^[a-f0-9]{32}$/.test(id || "")) return null;
    return this.#lookup(
      new EqualityFilter({
        attribute: "objectGUID",
        value: Buffer.from(id, "hex"),
      }),
    );
  }

  async getUser(id) {
    const entry = await this.#byId(id);
    return entry ? publicProfile(entry) : null;
  }
  async findByLogin(username) {
    const entry = await this.#lookup(
      new OrFilter({
        filters: ["sAMAccountName", "userPrincipalName"].map(
          (attribute) => new EqualityFilter({ attribute, value: username }),
        ),
      }),
    );
    return entry ? publicProfile(entry) : null;
  }
  async verifyCredentials(id, password) {
    if (typeof password !== "string" || !password || password.length > 256)
      return false;
    const entry = await this.#byId(id);
    if (!entry) return false;
    return this.#connection(async (client) => {
      try {
        await client.bind(entry.dn, password);
        return true;
      } catch (error) {
        if (Number(error.code) === 49) return false;
        throw error;
      }
    });
  }
  async ensureActive(id) {
    if ((this.#cache.get(id) || 0) > this.#now()) return;
    let pending = this.#pending.get(id);
    if (!pending) {
      pending = (async () => {
        if (!(await this.getUser(id))) {
          this.#cache.delete(id);
          fail(401, "Kurumsal hesabın erişimi sona erdi. Yeniden giriş yapın.");
        }
        if (this.#cache.size >= 512)
          this.#cache.delete(this.#cache.keys().next().value);
        this.#cache.set(id, this.#now() + 60000);
      })();
      this.#pending.set(id, pending);
    }
    try {
      await pending;
    } finally {
      if (this.#pending.get(id) === pending) this.#pending.delete(id);
    }
  }
}
export async function createActiveDirectory(env = {}) {
  const config = activeDirectoryConfig(env);
  if (!config) return disabledDirectory;
  const tlsOptions = { minVersion: "TLSv1.2", rejectUnauthorized: true };
  if (config.caFile) {
    if ((await fs.stat(config.caFile)).size > 1048576)
      throw Error("AD sertifika dosyası çok büyük.");
    tlsOptions.ca = await fs.readFile(config.caFile);
  }
  return new ActiveDirectory(
    config,
    () =>
      new Client({
        url: config.url,
        connectTimeout: 5000,
        timeout: 5000,
        tlsOptions,
        autoRebind: false,
      }),
  );
}
