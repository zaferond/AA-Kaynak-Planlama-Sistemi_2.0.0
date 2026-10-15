import { Store } from "../backend/store.mjs";
import { validate } from "../backend/domain/index.mjs";
import { publicUser, validPasswordRecord } from "../backend/auth.mjs";

// Uses the application's actual model/account projection on an already-open,
// query-only private SQL.js image. Never connect/migrate/close a Store or file.
export async function verifySnapshotModel(db) {
  const connection = {
    async query(sql, values = []) {
      const statement = db.prepare(sql);
      try {
        statement.bind(
          Object.fromEntries(
            values.map((v, i) => ["@p" + i, v === undefined ? null : v]),
          ),
        );
        const columns = statement.getColumnNames(),
          rows = [];
        while (statement.step()) {
          const values = statement.get();
          rows.push(
            Object.fromEntries(columns.map((name, i) => [name, values[i]])),
          );
        }
        return { rows, rowCount: rows.length };
      } finally {
        statement.free();
      }
    },
  };
  const store = new Store({
    env: { DB_PROVIDER: "sqljs" },
    adapter: connection,
  });
  try {
    const { data } = await store.read(connection);
    const users = await store.users(connection);
    if (users.some((user) => !validPasswordRecord(user.password)))
      throw Error("Yedekteki hesapların parola kayıt biçimi geçersiz.");
    data.users = users.map(publicUser);
    validate(data, { previousResources: data.resources });
  } catch (error) {
    throw Error(
      "Yedek uygulama modeli okunamıyor veya geçersiz: " + error.message,
    );
  }
}
