import initSqlJs from "sql.js";
import { isDeepStrictEqual } from "node:util";
import {
  migrationCatalog,
  migrationSql,
} from "../backend/migration-catalog.mjs";

const SQL = await initSqlJs();
function rows(db, sql) {
  const r = db.exec(sql)[0];
  return r
    ? r.values.map((values) =>
        Object.fromEntries(r.columns.map((name, i) => [name, values[i]])),
      )
    : [];
}
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
// Tokenize SQL so whitespace/case changes do not hide a missing CHECK, and
// quoted strings/comments containing CHECK or parentheses are handled correctly.
function checks(sql) {
  const tokens = (
    sql.match(
      /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"|\[[^\]]*\]|[a-zA-Z_][a-zA-Z_0-9]*|[^\s]/g,
    ) || []
  ).filter((t) => !t.startsWith("--") && !t.startsWith("/*"));
  const found = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].toUpperCase() !== "CHECK" || tokens[i + 1] !== "(") continue;
    let depth = 1;
    const expression = [];
    for (i += 2; i < tokens.length; i++) {
      if (tokens[i] === "(") depth++;
      else if (tokens[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
      expression.push(
        tokens[i].startsWith("'") ? tokens[i] : tokens[i].toLowerCase(),
      );
    }
    if (depth !== 0) throw Error("Şemadaki CHECK ifadesi geçersiz.");
    found.push(expression.join(" "));
  }
  return found.sort();
}
function structure(db, name) {
  const q = quote(name);
  const columns = rows(db, `PRAGMA table_xinfo(${q})`).map(
    ({ cid, ...column }) => column,
  );
  const foreignKeys = rows(db, `PRAGMA foreign_key_list(${q})`)
    .map(({ id, ...key }) => JSON.stringify(key))
    .sort();
  const unique = rows(db, `PRAGMA index_list(${q})`)
    .filter((r) => r.unique)
    .map((index) => ({
      partial: index.partial,
      columns: rows(db, `PRAGMA index_xinfo(${quote(index.name)})`)
        .filter((r) => r.key)
        .map(({ seqno, cid, ...column }) => column),
      // The WHERE predicate of a partial unique index is part of its constraint.
      predicate: index.partial
        ? rows(
            db,
            `SELECT sql FROM sqlite_master WHERE type='index' AND name=${"'" + index.name.replaceAll("'", "''") + "'"}`,
          )[0]?.sql
        : null,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const sql =
    rows(
      db,
      `SELECT sql FROM sqlite_master WHERE type='table' AND name=${"'" + name.replaceAll("'", "''") + "'"}`,
    )[0]?.sql || "";
  return { columns, foreignKeys, unique, checks: checks(sql) };
}
export async function expectedSchemaContract() {
  const db = new SQL.Database();
  try {
    // An empty reference DB runs DDL only; no business data or live DB is read.
    // Including legacy v2 supplies its optional table's contract as well.
    for (const m of migrationCatalog)
      if (m.sql) {
        const script = await migrationSql("sqljs", m.version);
        for (const batch of script.split(/^GO\s*$/gim).filter((s) => s.trim()))
          db.exec(batch);
      }
    return Object.fromEntries(
      rows(
        db,
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'kp_%'",
      ).map(({ name }) => [name, structure(db, name)]),
    );
  } finally {
    db.close();
  }
}
export function assertSchemaContract(db, contract) {
  for (const [name, expected] of Object.entries(contract)) {
    const actual = structure(db, name);
    if (name === "kp_person_allocations" && actual.columns.length === 0)
      continue;
    if (!isDeepStrictEqual(actual.columns, expected.columns))
      throw Error(
        "Gerekli sütun/tip/varsayılan/anahtar şeması eşleşmiyor: " + name + ".",
      );
    if (
      !isDeepStrictEqual(actual.foreignKeys, expected.foreignKeys) ||
      !isDeepStrictEqual(actual.unique, expected.unique) ||
      !isDeepStrictEqual(actual.checks, expected.checks)
    )
      throw Error("Gerekli ilişki veya kısıt şeması eşleşmiyor: " + name + ".");
  }
}
