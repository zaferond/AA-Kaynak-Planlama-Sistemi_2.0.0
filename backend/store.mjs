import { planningUnitManagerIndex } from "../shared/resource-roles.ts";
import { actualView } from "./actual-view.mjs";
import { activityReport } from "./activity-report.mjs";
import * as identity from "./identity-repository.mjs";
import { readPlanningSnapshot } from "./planning-reader.mjs";
import { readActualReportData } from "./actual-report-reader.mjs";
import { persistPlanningSnapshot } from "./planning-writer.mjs";
import { prepareMutationSettings } from "./mutation-settings.mjs";
import { auditEntries } from "./audit.mjs";
import { isPlanningCommand, preparePlanningCommand } from "./operations.mjs";
import { readPlanningPreflight } from "./planning-preflight.mjs";
import { planningDeltaView } from "./planning-response.mjs";
import {
  cloneMutationSnapshot,
  clonePlanningMutationDraft,
  numericSnapshotMaps,
} from "./mutation-snapshot.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareSchema } from "./schema-migrations.mjs";
import { validate, scopeData } from "./domain/index.mjs";
import { publicUser, fail, admin } from "./auth.mjs";
import { SqlJsAdapter } from "./adapters/sqljs.mjs";
import { MssqlAdapter, sqlConfig } from "./adapters/mssql.mjs";
import {
  DIRECTORY_REVISION_KEY,
  directoryRevision,
  directoryCatalogChanged,
} from "../shared/directory-policy.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// A database edited outside the application (no generation bump) is picked up
// within this time at the latest. VIEW_CACHE_MAX_AGE_MS=0 turns the cache off:
// every view then reads only the rows its user may see, as before.
const VIEW_CACHE_MAX_AGE_MS = 60_000;
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
export class Store {
  /** Complete planning snapshot of the last committed generation, shared by
   * read-only views. Frozen: views build new objects instead of editing it. */
  #viewCache = null;
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.viewCacheMaxAgeMs =
      options.viewCacheMaxAgeMs ??
      Number(this.env.VIEW_CACHE_MAX_AGE_MS ?? VIEW_CACHE_MAX_AGE_MS);
    if (!Number.isFinite(this.viewCacheMaxAgeMs) || this.viewCacheMaxAgeMs < 0)
      throw Error("VIEW_CACHE_MAX_AGE_MS 0 veya pozitif bir sayı olmalıdır.");
    this.provider = this.env.DB_PROVIDER || "sqljs";
    if (!["sqljs", "mssql"].includes(this.provider))
      throw Error("DB_PROVIDER sqljs veya mssql olmalıdır.");
    if (this.env.NODE_ENV === "production" && this.provider === "sqljs")
      throw Error("Canlı ortamda DB_PROVIDER=mssql kullanın.");
    this.db =
      options.adapter ||
      (this.provider === "sqljs"
        ? new SqlJsAdapter(
            path.resolve(root, this.env.SQLJS_FILE || "data/planlama.sqlite"),
          )
        : new MssqlAdapter(sqlConfig(this.env)));
  }
  async close() {
    await this.db.close();
  }
  transaction(fn, readOnly = false) {
    return this.db.transaction(fn, readOnly);
  }
  async connect({ migrate = false } = {}) {
    await this.db.open();
    try {
      const auto =
        migrate ||
        this.provider === "sqljs" ||
        (this.env.NODE_ENV !== "production" &&
          this.env.DB_AUTO_MIGRATE === "true");
      await this.transaction((c) =>
        prepareSchema(c, { provider: this.provider, auto }),
      );
    } catch (e) {
      await this.close();
      throw e;
    }
  }
  async users(c = this.db) {
    return identity.readUsers(c);
  }
  async findUser(filter, c = this.db) {
    return identity.findUser(c, filter);
  }
  async saveUser(u, c) {
    await identity.saveUser(c, u);
  }
  async bootstrapUser(u) {
    await this.transaction(async (c) => {
      if (!(await this.findUser({ id: u._id }, c))) await this.saveUser(u, c);
    });
  }
  async deleteUser(id, revision, c) {
    return identity.deleteUser(c, id, revision);
  }
  // MSSQL keeps session writes off the data lock; SQL.js stays serial.
  #sessionTransaction(fn) {
    return this.db.sessionTransaction
      ? this.db.sessionTransaction(fn)
      : this.transaction(fn);
  }
  async createSession(s) {
    await this.#sessionTransaction((c) => identity.createSession(c, s));
  }
  async session(id) {
    return identity.readSession(this.db, id);
  }
  async deleteSession(id) {
    await this.#sessionTransaction((c) => identity.deleteSession(c, id));
  }
  async revokeUser(id, c) {
    await identity.revokeUserSessions(c, id);
  }
  async cleanupSessions() {
    await this.#sessionTransaction((c) => identity.cleanupSessions(c));
  }
  async generation() {
    return Number(
      (await this.db.query("SELECT generation FROM kp_settings WHERE id=1"))
        .rows[0].generation,
    );
  }
  async read(c = this.db, viewUser) {
    return readPlanningSnapshot(c, this.provider, viewUser);
  }
  /**
   * Every committed snapshot change goes through mutate(), which bumps the
   * generation in the same transaction. A read-only transaction never sees an
   * uncommitted write (SQL.js runs transactions one at a time; MSSQL readers
   * hold the shared data lock writers take exclusively), so a snapshot read
   * here is exactly the one committed under its generation. Only views fill
   * the cache; mutate() keeps reading inside its own transaction.
   */
  async #viewSnapshot(c) {
    const generation = Number(
      (await c.query("SELECT generation FROM kp_settings WHERE id=1")).rows[0]
        .generation,
    );
    const cached = this.#viewCache;
    if (
      cached?.generation === generation &&
      Date.now() - cached.at < this.viewCacheMaxAgeMs
    )
      return cached;
    const fresh = await this.read(c);
    if (Number(fresh.generation) !== generation) return fresh;
    this.#viewCache = {
      data: deepFreeze(fresh.data),
      generation,
      at: Date.now(),
    };
    return this.#viewCache;
  }
  async view(u) {
    return this.transaction(async (c) => {
      const active = await this.findUser({ id: u._id }, c);
      if (!active?.active || active.version !== u.version)
        fail(401, "Oturum yenilenmeli.");
      // The complete snapshot is shared; scopeData() narrows it per user.
      // Without the cache, the read itself skips rows the user cannot see.
      const { data, generation } = this.viewCacheMaxAgeMs
        ? await this.#viewSnapshot(c)
        : await this.read(c, publicUser(active));
      return this.projectView(data, generation, active, c);
    }, true);
  }
  async actualView(u, query) {
    return this.transaction(async (c) => {
      const active = await this.findUser({ id: u._id }, c);
      if (!active?.active || active.version !== u.version)
        fail(401, "Oturum yenilenmeli.");
      const data = await readActualReportData(
        c,
        this.provider,
        publicUser(active),
        query,
        "actual",
      );
      return actualView(data, publicUser(active), query);
    }, true);
  }
  async activityReport(u, query) {
    return this.transaction(async (c) => {
      const active = await this.findUser({ id: u._id }, c);
      if (!active?.active || active.version !== u.version)
        fail(401, "Oturum yenilenmeli.");
      const data = await readActualReportData(
        c,
        this.provider,
        publicUser(active),
        query,
        "activity",
      );
      return activityReport(data, publicUser(active), query);
    }, true);
  }
  async projectView(data, generation, active, c) {
    if (active.role === "admin") {
      // New objects: `data` may be the shared, frozen view snapshot.
      const users = await this.users(c);
      data = {
        ...data,
        users: users.map(publicUser),
        revisions: { ...data.revisions },
      };
      for (const x of users) data.revisions["user:" + x._id] = x.revision;
    }
    const principal = publicUser(active);
    const scoped = scopeData(data, principal);
    return {
      data:
        principal.role === "normal"
          ? scoped
          : {
              ...scoped,
              // Only names of assigned organisational owners; no employee records,
              // calendars or personal actuals are exposed through these labels.
              planningUnitManagers: planningUnitManagerIndex(data),
            },
      generation,
      user: principal,
    };
  }
  async auditLog(u, { offset = 0, limit = 50, kind, q } = {}) {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      fail(400, "Geçersiz sayfa.");
    return this.transaction(async (c) => {
      const active = await this.findUser({ id: u._id }, c);
      if (!active?.active || active.version !== u.version)
        fail(401, "Oturum yenilenmeli.");
      admin(active);
      // Optional filters are fixed SQL fragments with bound parameters; the
      // search text is a LIKE pattern with its wildcards escaped. LOWER on both
      // sides keeps search case-insensitive under MSSQL's binary collation.
      const filters = [],
        values = [offset, limit];
      if (kind) {
        values.push(kind);
        filters.push("kind=@p" + (values.length - 1));
      }
      if (q) {
        values.push("%" + q.replace(/[\\%_[]/g, (x) => "\\" + x) + "%");
        const p = "@p" + (values.length - 1);
        filters.push(
          `(LOWER(record_name) LIKE LOWER(${p}) ESCAPE '\\' OR LOWER(actor_name) LIKE LOWER(${p}) ESCAPE '\\')`,
        );
      }
      const where = filters.length ? " WHERE " + filters.join(" AND ") : "";
      const total = Number(
        (
          await c.query(
            "SELECT COUNT(*) AS n FROM kp_audit_events" + where,
            values,
          )
        ).rows[0].n,
      );
      const page =
        this.provider === "mssql"
          ? "OFFSET @p0 ROWS FETCH NEXT @p1 ROWS ONLY"
          : "LIMIT @p1 OFFSET @p0";
      const rows = (
        await c.query(
          "SELECT * FROM kp_audit_events" +
            where +
            " ORDER BY occurred_at DESC,id DESC " +
            page,
          values,
        )
      ).rows;
      return {
        total,
        entries: rows.map((row) => ({
          ...row,
          changes: JSON.parse(row.changes),
        })),
      };
    }, true);
  }
  copySnapshot(data, { planningOnly = false } = {}) {
    return planningOnly
      ? clonePlanningMutationDraft(data)
      : cloneMutationSnapshot(data);
  }
  projectPlanningDelta(options) {
    return planningDeltaView(options);
  }
  validateSnapshot(data, options) {
    return validate(data, options);
  }
  prepareMutationSettings(before, valid) {
    return prepareMutationSettings(before, valid, { validatedCalendars: true });
  }
  async prepareMutationView({
    before,
    valid,
    generation,
    active,
    c,
    changeSet,
    planningDelta,
    metadataEquality = new Map(),
  }) {
    const metadataKeys = new Set([
      ...Object.keys(before),
      ...Object.keys(valid),
    ]);
    for (const key of numericSnapshotMaps) metadataKeys.delete(key);
    const unchanged = [...metadataKeys].every((key) =>
      metadataEquality.has(key)
        ? metadataEquality.get(key)
        : JSON.stringify(before[key]) === JSON.stringify(valid[key]),
    );
    const delta = this.projectPlanningDelta({
      before,
      valid,
      generation,
      active,
      changeSet,
      planningDelta,
      metadataUnchanged: unchanged,
    });
    if (delta) return delta;
    const responseData = unchanged
      ? {
          ...before,
          ...Object.fromEntries(
            numericSnapshotMaps.map((key) => [key, valid[key]]),
          ),
          revisions: { ...valid.revisions },
        }
      : (await this.read(c)).data;
    return this.projectView(responseData, generation + 1, active, c);
  }
  async mutate(
    u,
    fn,
    {
      auditUsers = false,
      returnView = false,
      returnResult = false,
      planningDelta,
      afterPersist,
    } = {},
  ) {
    return this.transaction(async (c) => {
      const active = await this.findUser({ id: u._id }, c);
      if (!active?.active || active.version !== u.version)
        fail(401, "Oturum yenilenmeli.");
      // Reject stale/unauthorized single-cell planning writes without loading
      // unrelated snapshots. A passing preflight still uses full validation,
      // persistence, auditing and response construction under this same lock.
      const prepared = preparePlanningCommand(fn);
      if (prepared)
        prepared.stage(await readPlanningPreflight(c, prepared.id), active);
      const snapshot = await this.read(c),
        planningOnly = isPlanningCommand(fn),
        copy = this.copySnapshot(snapshot.data, { planningOnly }),
        before = planningOnly ? snapshot.data : copy,
        data = planningOnly ? copy : snapshot.data,
        generation = snapshot.generation;
      const beforeUsers = auditUsers ? await this.users(c) : [];
      const result = await (prepared?.stage || fn)(data, active, c, generation);
      const valid = this.validateSnapshot(data, {
        previousResources: before.resources,
      });
      // Same transaction/lock as the command. Imports and cascading team edits
      // participate too; unrelated risk/project/allocation writes do not.
      if (directoryCatalogChanged(before, valid))
        valid.revisions[DIRECTORY_REVISION_KEY] = directoryRevision(before) + 1;
      // Prepare pure settings/equality after full validation and before diffing.
      // The validated pair stays stable throughout persistence and projection.
      const settings = this.prepareMutationSettings(before, valid);
      const changeSet = await this.persist(before, valid, c, { settings });
      // Server-owned hook runs after resource FKs exist, still under the same
      // transaction. Any account/audit/projection failure rolls back every write.
      if (afterPersist) await afterPersist(valid, active, c);
      const afterUsers = auditUsers ? await this.users(c) : [];
      await c.upsert(
        "audit_events",
        auditEntries(before, valid, active, {
          beforeUsers,
          afterUsers,
          changeSet,
        }),
      );
      const { assignments, values } = settings;
      await c.query(
        "UPDATE kp_settings SET " + assignments.join(",") + " WHERE id=1",
        values,
      );
      if (returnView) {
        // The optional result envelope carries import counters with this commit.
        // Preserve the SQL read representation of unchanged entities. If
        // validation normalized metadata, re-read within the same transaction.
        const view = await this.prepareMutationView({
          before,
          valid,
          generation,
          active,
          c,
          changeSet,
          planningDelta,
          metadataEquality: settings.metadataEquality,
        });
        return returnResult ? { view, result } : view;
      }
      return result;
    });
  }
  async persist(before, next, c, options) {
    return persistPlanningSnapshot(before, next, c, options);
  }
}
