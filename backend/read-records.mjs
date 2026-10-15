import { table, tableSpec, ident } from "./tables.mjs";
import { DIRECTORY_REVISION_KEY } from "../shared/directory-policy.ts";
const identity = (value) => value;
const firstValue = (values) => values[0];

// SQL and column names come from fixed Store queries. Adapters without scan
// retain their ordinary query contract; both paths build the same record map.
export async function readRecordMap(
  c,
  sql,
  columns,
  recordKey,
  convert = identity,
  parameters = [],
) {
  const collector = recordCollector(columns.length - 1, recordKey, convert);
  if (typeof c.scan === "function") {
    const result = await c.scan(sql, parameters, collector.consume);
    return collector.finish(result?.rowCount);
  }
  const { rows } = await c.query(sql, parameters);
  for (const row of rows)
    collector.consume(columns.map((column) => row[column]));
  return collector.finish(rows.length);
}

function recordCollector(valueIndex, recordKey, convert) {
  const records = {};
  let consumedRows = 0;
  const consume = (values) => {
    const key = recordKey(values),
      value = convert(values[valueIndex]);
    if (key === "__proto__")
      Object.defineProperty(records, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    else records[key] = value;
    consumedRows++;
  };
  return {
    consume,
    finish(rowCount) {
      if (rowCount !== consumedRows)
        throw Error("SQL satır okuması tamamlanamadı.");
      return records;
    },
  };
}

// SQLite can return the complete composite key as one text value, reducing
// WASM-to-JS column decoding. Other adapters keep their original column types.
export async function readCompositeMap(
  c,
  provider,
  name,
  valueColumn,
  ownerIds,
  period,
  projectIds,
) {
  return readRecordMap(
    c,
    ...compositeRead(provider, name, valueColumn, ownerIds, period, projectIds),
  );
}

function compositeRead(
  provider,
  name,
  valueColumn,
  ownerIds,
  period,
  projectIds,
) {
  const spec = tableSpec(name),
    keys = spec.key;
  if (
    !["sqljs", "mssql"].includes(provider) ||
    ![2, 3].includes(keys.length) ||
    ![...keys, valueColumn].every((column) =>
      Object.hasOwn(spec.columns, column),
    )
  )
    throw Error("Invalid composite map specification");
  let where = "",
    parameters = [];
  if (ownerIds !== undefined) {
    if (
      ![
        "allocations",
        "actual_allocations",
        "actual_worked_hours",
        "actual_percent_entries",
      ].includes(name) ||
      !Array.isArray(ownerIds) ||
      !ownerIds.every((id) => typeof id === "string")
    )
      throw Error("Invalid composite read scope");
    const ids = [...new Set(ownerIds)];
    // Stay below SQLite's conservative 999 / MSSQL's 2100 bind limits. Larger
    // scopes fall back to the complete read, then scopeData; never truncate.
    if (ids.length <= 900 && !ids.some((id) => id.includes("|"))) {
      parameters = ids;
      where = ids.length
        ? ` WHERE ${ident(keys[0])} IN (${ids.map((_, i) => "@p" + i).join(",")})`
        : " WHERE 1=0";
    }
  }
  if (period !== undefined) {
    if (
      ![
        "actual_allocations",
        "actual_worked_hours",
        "actual_percent_entries",
      ].includes(name) ||
      !Array.isArray(period) ||
      period.length !== 2 ||
      !period.every(
        (month) =>
          typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
      )
    )
      throw Error("Invalid actual report period");
    const offset = parameters.length;
    where +=
      (where ? " AND " : " WHERE ") +
      `[month]>=@p${offset} AND [month]<=@p${offset + 1}`;
    parameters.push(...period);
  }
  if (projectIds !== undefined) {
    if (
      name !== "actual_allocations" ||
      !Array.isArray(projectIds) ||
      !projectIds.every((id) => typeof id === "string")
    )
      throw Error("Invalid actual project scope");
    const ids = [...new Set(projectIds)];
    if (
      ids.length + parameters.length <= 900 &&
      !ids.some((id) => id.includes("|"))
    ) {
      const offset = parameters.length;
      where +=
        (where ? " AND " : " WHERE ") +
        (ids.length
          ? `[project_id] IN (${ids.map((_, i) => "@p" + (offset + i)).join(",")})`
          : "1=0");
      parameters.push(...ids);
    }
  }
  if (provider === "sqljs") {
    const key = keys.map(ident).join("||'|'||");
    // Filtered index seeks group by owner. Preserve the existing table-scan
    // insertion order for JSON, compression and downstream accumulation.
    const order = where ? " ORDER BY rowid" : "";
    return [
      `SELECT ${key} AS [record_key],${ident(valueColumn)} FROM ${table(name)}${where}${order}`,
      ["record_key", valueColumn],
      firstValue,
      identity,
      parameters,
    ];
  }
  const columns = [...keys, valueColumn];
  return [
    `SELECT ${columns.map(ident).join(",")} FROM ${table(name)}${where}`,
    columns,
    (values) =>
      keys.length === 2
        ? values[0] + "|" + values[1]
        : values[0] + "|" + values[1] + "|" + values[2],
    identity,
    parameters,
  ];
}

// Only remove planned revision rows that scopeData cannot expose. Keep every
// special @ namespace (including deleted risks/calendar/person/actual records),
// and leave the final resource-month visibility check to scopeData.
export async function readRevisionMap(c, provider, planningTeams) {
  return readRecordMap(c, ...revisionRead(provider, planningTeams));
}

function revisionRead(provider, planningTeams) {
  if (!["sqljs", "mssql"].includes(provider))
    throw Error("Invalid revision read provider");
  let where = "",
    parameters = [];
  if (planningTeams !== undefined) {
    if (
      !Array.isArray(planningTeams) ||
      !planningTeams.every((id) => typeof id === "string")
    )
      throw Error("Invalid revision read scope");
    const ids = [...new Set(planningTeams)];
    // Large/legacy scopes keep complete reads; never truncate a team's revisions.
    if (ids.length <= 900 && !ids.some((id) => id.includes("|"))) {
      parameters = ids;
      const team =
        provider === "sqljs"
          ? "substr([record_id],1,instr([record_id]||'|','|')-1)"
          : "LEFT([record_id],CHARINDEX('|',[record_id]+'|')-1) COLLATE Latin1_General_100_BIN2";
      where =
        " WHERE ([kind]<>'allocation' OR [record_id] LIKE '@%'" +
        (ids.length
          ? ` OR ${team} IN (${ids.map((_, i) => "@p" + i).join(",")})`
          : "") +
        ")";
    }
  }
  const order = where && provider === "sqljs" ? " ORDER BY rowid" : "";
  return [
    "SELECT kind,record_id,revision FROM kp_revisions" + where + order,
    ["kind", "record_id", "revision"],
    revisionRecordKey,
    Number,
    parameters,
  ];
}

export function revisionRecordKey(values) {
  const kind = values[0],
    id = values[1];
  if (kind === "allocation" && id === "@directory:shared")
    return DIRECTORY_REVISION_KEY;
  return kind === "allocation" && id.startsWith("@riskSystem:")
    ? "riskSystem:" + id.slice(12)
    : kind === "allocation" && id.startsWith("@risk:")
      ? "risk:" + id.slice(6)
      : kind === "allocation" && id.startsWith("@actual:")
        ? "actual:" + id.slice(8)
        : kind === "allocation" && id.startsWith("@worked:")
          ? "workedHours:" + id.slice(8)
          : kind === "allocation" && id.startsWith("@calendar:")
            ? "calendar:" + id.slice(10)
            : kind === "allocation" && id.startsWith("@person:")
              ? "personDay:" + id.slice(8)
              : kind + ":" + id;
}

// Full snapshots only. All five maps remain complete and retain SELECT order;
// only the number of native requests changes. No cross-transaction cache.
export async function readNumericSnapshot(c, provider) {
  if (provider !== "mssql" || typeof c.scanMany !== "function")
    throw Error("Native numeric snapshot batch is unavailable.");
  const maps = [
    ["allocations", "allocations", "amount"],
    ["actualAllocations", "actual_allocations", "amount"],
    ["actualWorkedHours", "actual_worked_hours", "hours"],
    ["actualPercentEntries", "actual_percent_entries", "percent"],
  ];
  const specs = [
    ...maps.map(([, name, column]) => compositeRead(provider, name, column)),
    revisionRead(provider),
  ];
  const collectors = specs.map(([, columns, key, convert]) =>
    recordCollector(columns.length - 1, key, convert),
  );
  const results = await c.scanMany(
    specs.map(([sql]) => sql),
    collectors.map((collector) => collector.consume),
  );
  if (!Array.isArray(results) || results.length !== specs.length)
    throw Error("SQL numeric snapshot batch was incomplete.");
  return Object.fromEntries(
    [...maps.map(([key]) => key), "revisions"].map((key, index) => [
      key,
      collectors[index].finish(results[index]?.rowCount),
    ]),
  );
}
