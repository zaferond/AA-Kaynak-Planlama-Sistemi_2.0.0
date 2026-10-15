import initSqlJs from "sql.js";
import fs from "node:fs/promises";
import path from "node:path";
import { tableSpec, table, ident, validateRows } from "../tables.mjs";
export class SqlJsAdapter {
  constructor(file) {
    this.file = path.resolve(file);
    this.tail = Promise.resolve();
  }
  async open() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    this.lockPath = this.file + ".lock";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        this.lock = await fs.open(this.lockPath, "wx", 0o600);
        try {
          await this.lock.writeFile(String(process.pid));
        } catch (error) {
          await this.lock.close();
          this.lock = null;
          await fs.unlink(this.lockPath);
          throw error;
        }
        break;
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        const recovered = attempt === 0 && (await this.removeStaleLock());
        if (!recovered)
          throw Error("Yerel dosya kullanımda. Önce diğer portalı durdurun.");
      }
    }
    try {
      this.SQL = await initSqlJs();
      let bytes;
      try {
        bytes = await fs.readFile(this.file);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      this.db = new this.SQL.Database(bytes);
      this.configure();
    } catch (e) {
      await this.lock.close();
      await fs.unlink(this.lockPath);
      throw e;
    }
  }
  async removeStaleLock() {
    let contents;
    try {
      contents = await fs.readFile(this.lockPath, "utf8");
    } catch {
      return false;
    }
    const pid = Number(contents.trim());
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      if (error.code !== "ESRCH") return false;
    }
    try {
      if ((await fs.readFile(this.lockPath, "utf8")) !== contents) return false;
      await fs.unlink(this.lockPath);
      return true;
    } catch {
      return false;
    }
  }
  configure() {
    this.db.exec("PRAGMA foreign_keys=ON");
  }
  async serial(fn) {
    const run = this.tail.then(fn);
    this.tail = run.catch(() => {});
    return run;
  }
  raw(sql, values = [], consume) {
    if (consume !== undefined && typeof consume !== "function")
      throw new TypeError("Satır okuyucu bir işlev olmalıdır.");
    const params = Object.fromEntries(
      values.map((v, i) => [
        "@p" + i,
        v === undefined ? null : typeof v === "boolean" ? Number(v) : v,
      ]),
    );
    const st = this.db.prepare(sql);
    try {
      st.bind(params);
      const rows = [];
      let consumedRows = 0;
      let columns;
      while (st.step()) {
        if (consume) {
          // Synchronous consumers use the explicit SELECT column order. Avoid
          // building and retaining objects for rows immediately reduced to maps.
          consume(st.get());
          consumedRows++;
          continue;
        }
        // A prepared statement has the same result columns for every row.
        columns ??= st.getColumnNames();
        const values = st.get(),
          row = {};
        for (let i = 0; i < columns.length; i++) {
          const key = columns[i];
          if (key === "__proto__")
            Object.defineProperty(row, key, {
              value: values[i],
              enumerable: true,
              writable: true,
              configurable: true,
            });
          else row[key] = values[i];
        }
        rows.push(row);
      }
      return {
        rows,
        rowCount: /^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql)
          ? consume
            ? consumedRows
            : rows.length
          : this.db.getRowsModified(),
      };
    } finally {
      st.free();
    }
  }
  async transaction(fn, readOnly = false) {
    return this.serial(async () => {
      let snapshot;
      if (!readOnly) {
        snapshot = this.db.export();
        this.configure();
      }
      this.db.exec("BEGIN");
      const c = {
        query: async (sql, v) => this.raw(sql, v),
        scan: async (sql, v, consume) => this.raw(sql, v, consume),
        batch: async (sql) => this.db.exec(sql),
        upsert: (t, r) => this.upsert(t, r),
        remove: (t, r) => this.remove(t, r),
      };
      try {
        const result = await fn(c);
        this.db.exec("COMMIT");
        if (!readOnly) {
          const bytes = this.db.export();
          this.configure();
          const temp = this.file + ".tmp";
          const f = await fs.open(temp, "w", 0o600);
          try {
            await f.writeFile(bytes);
            await f.sync();
          } finally {
            await f.close();
          }
          await fs.rename(temp, this.file);
        }
        return result;
      } catch (e) {
        try {
          this.db.exec("ROLLBACK");
        } catch {}
        if (snapshot) {
          this.db.close();
          this.db = new this.SQL.Database(snapshot);
          this.configure();
        }
        throw e;
      }
    });
  }
  async query(sql, v) {
    return this.transaction((c) => c.query(sql, v), true);
  }
  async scan(sql, v, consume) {
    return this.transaction((c) => c.scan(sql, v, consume), true);
  }
  async upsert(name, rows) {
    if (!rows.length) return;
    validateRows(name, rows);
    const spec = tableSpec(name),
      cols = Object.keys(spec.columns),
      others = cols.filter((c) => !spec.key.includes(c));
    const q = `INSERT INTO ${table(name)} (${cols.map(ident)}) VALUES (${cols.map((_, i) => "@p" + i)}) ON CONFLICT (${spec.key.map(ident)}) ${others.length ? "DO UPDATE SET " + others.map((c) => `${ident(c)}=excluded.${ident(c)}`).join(",") : "DO NOTHING"}`;
    for (const row of rows)
      this.raw(
        q,
        cols.map((c) => row[c] ?? null),
      );
  }
  async remove(name, keys) {
    const spec = tableSpec(name);
    for (const row of keys)
      this.raw(
        `DELETE FROM ${table(name)} WHERE ${spec.key.map((c, i) => ident(c) + "=@p" + i).join(" AND ")}`,
        spec.key.map((k) => row[k]),
      );
  }
  async close() {
    await this.tail;
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    if (this.lock) {
      await this.lock.close();
      await fs.unlink(this.lockPath);
      this.lock = null;
    }
  }
}
