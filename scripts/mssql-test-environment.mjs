import sql from "mssql";
import { MssqlAdapter, sqlConfig } from "../backend/adapters/mssql.mjs";
import { tables } from "../backend/tables.mjs";

// Deliberately never inherit DB_* or load the application's .env.
export function mssqlTestEnvironment(input = process.env) {
  const env = {
    NODE_ENV: "test",
    DB_PROVIDER: "mssql",
    DB_AUTO_MIGRATE: "true",
  };
  for (const key of [
    "SERVER",
    "PORT",
    "INSTANCE",
    "DATABASE",
    "AUTH",
    "USER",
    "PASSWORD",
    "DOMAIN",
    "ENCRYPT",
    "TRUST_SERVER_CERTIFICATE",
  ]) {
    const value = input["TEST_DB_" + key];
    if (value !== undefined && value !== "") env["DB_" + key] = value;
  }
  for (const key of ["SERVER", "DATABASE", "USER", "PASSWORD"])
    if (!env["DB_" + key])
      throw Error(
        "TEST_DB_" + key + " tanımlanmalı; uygulama bağlantısı kullanılmaz.",
      );
  if (
    !/^[a-z][a-z0-9_]*_test$/i.test(env.DB_DATABASE) ||
    env.DB_DATABASE.length > 128
  )
    throw Error(
      "TEST_DB_DATABASE ayrı bir veritabanı olmalı; adı _test ile bitmeli.",
    );
  for (const key of ["ENCRYPT", "TRUST_SERVER_CERTIFICATE"])
    if (
      env["DB_" + key] !== undefined &&
      !["true", "false"].includes(env["DB_" + key])
    )
      throw Error("TEST_DB_" + key + " true veya false olmalı.");
  if (env.DB_AUTH === "ntlm" && !env.DB_DOMAIN)
    throw Error("NTLM için TEST_DB_DOMAIN tanımlanmalı.");
  sqlConfig(env);
  return env;
}

export function validateTestDatabase(info, objects, database) {
  if (info?.database_name !== database)
    throw Error("Bağlanılan veritabanı TEST_DB_DATABASE ile eşleşmiyor.");
  if (info.default_schema !== "dbo")
    throw Error("Test hesabının varsayılan şeması dbo olmalı.");
  if (
    !Number.isInteger(Number(info.compatibility_level)) ||
    Number(info.compatibility_level) < 130
  )
    throw Error("OPENJSON için compatibility_level en az 130 olmalı.");
  if (
    ![
      info.can_inspect,
      info.can_create,
      info.can_alter,
      info.can_select,
      info.can_insert,
      info.can_update,
      info.can_delete,
    ].every((v) => Number(v) === 1)
  )
    throw Error(
      "Test hesabı VIEW DEFINITION, CREATE TABLE ve dbo ALTER/SELECT/INSERT/UPDATE/DELETE yetkilerine sahip olmalı.",
    );
  if (objects.length)
    throw Error(
      "Test veritabanı boş değil. Hiçbir test tablosu oluşturulmadı veya silinmedi.",
    );
}

const objectQuery =
  "SELECT SCHEMA_NAME(schema_id) AS schema_name,name FROM sys.objects WHERE is_ms_shipped=0 AND type IN ('U','V','P','PC','FN','IF','TF','SN','SO','TR','TA')";
const expectedNames = new Set([
  ...Object.keys(tables).map((name) => "kp_" + name),
  "kp_schema_migrations",
]);

export function validateCleanupObjects(objects) {
  if (
    objects.some((r) => r.schema_name !== "dbo" || !expectedNames.has(r.name))
  )
    throw Error(
      "Test sırasında beklenmeyen nesne oluştu. Otomatik temizleme durduruldu.",
    );
}

export async function cleanupTestTables(adapter) {
  await adapter.transaction(async (c) => {
    validateCleanupObjects((await c.query(objectQuery)).rows);
    for (const name of [...Object.keys(tables)].reverse()) {
      // The identifiers are from the fixed application table catalog only.
      await c.query(
        `IF OBJECT_ID(N'dbo.kp_${name}',N'U') IS NOT NULL DROP TABLE [dbo].[kp_${name}]`,
      );
    }
    await c.query(
      "IF OBJECT_ID(N'dbo.kp_schema_migrations',N'U') IS NOT NULL DROP TABLE [dbo].[kp_schema_migrations]",
    );
    if ((await c.query(objectQuery)).rows.length)
      throw Error("Test tabloları tamamen temizlenemedi.");
  });
}

export async function withMssqlTestDatabase(
  env,
  run,
  {
    adapter = new MssqlAdapter(sqlConfig(env)),
    leaseFactory = (pool) => new sql.Transaction(pool),
  } = {},
) {
  // A separate transaction holds a runner lease, not the application data lock.
  // This closes the empty-check/create/cleanup race between two test processes.
  const inspect = adapter;
  let lease,
    leaseStarted = false,
    leaseAborted = false,
    owned = false,
    value,
    failure;
  try {
    await inspect.open();
    lease = leaseFactory(inspect.pool);
    lease.on?.("rollback", () => (leaseAborted = true));
    await lease.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    leaseStarted = true;
    await inspect.request(
      lease,
      "DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=N'aa_kaynak_native_test', @LockMode=N'Exclusive', @LockOwner=N'Transaction', @LockTimeout=0; IF @r<0 THROW 50002,'Native test database is already in use',1;",
    );
    const info = (
      await inspect.request(
        lease,
        "SELECT DB_NAME() AS database_name,SCHEMA_NAME() AS default_schema,d.compatibility_level,CONVERT(nvarchar(128),SERVERPROPERTY('ProductVersion')) AS product_version,CONVERT(nvarchar(128),SERVERPROPERTY('Edition')) AS edition,HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION') AS can_inspect,HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE') AS can_create,HAS_PERMS_BY_NAME('dbo','SCHEMA','ALTER') AS can_alter,HAS_PERMS_BY_NAME('dbo','SCHEMA','SELECT') AS can_select,HAS_PERMS_BY_NAME('dbo','SCHEMA','INSERT') AS can_insert,HAS_PERMS_BY_NAME('dbo','SCHEMA','UPDATE') AS can_update,HAS_PERMS_BY_NAME('dbo','SCHEMA','DELETE') AS can_delete FROM sys.databases d WHERE d.database_id=DB_ID()",
      )
    ).rows[0];
    validateTestDatabase(
      info,
      (await inspect.request(lease, objectQuery)).rows,
      env.DB_DATABASE,
    );
    owned = true;
    value = await run({
      compatibilityLevel: Number(info.compatibility_level),
      productVersion: info.product_version,
      edition: info.edition,
    });
  } catch (e) {
    failure = e;
  } finally {
    if (owned) {
      try {
        await cleanupTestTables(inspect);
      } catch (e) {
        failure = failure
          ? new AggregateError([failure, e], "Test ve temizleme başarısız.")
          : e;
      }
    }
    if (leaseStarted && !leaseAborted) {
      try {
        await lease.rollback();
      } catch (e) {
        failure = failure
          ? new AggregateError([failure, e], "Test kilidi bırakılamadı.")
          : e;
      }
    }
    try {
      await inspect.close();
    } catch (e) {
      failure = failure
        ? new AggregateError([failure, e], "Test bağlantısı kapatılamadı.")
        : e;
    }
  }
  if (failure) throw failure;
  return value;
}
