import { MssqlAdapter, sqlConfig } from "./adapters/mssql.mjs";
if (process.env.DB_PROVIDER !== "mssql") {
  console.log(
    "Yerel sql.js modu seçili. Yerel test için npm start kullanın. MSSQL kontrolü için DB_PROVIDER=mssql olmalı.",
  );
  process.exit(0);
}
const db = new MssqlAdapter(sqlConfig());
try {
  await db.open();
  const result = await db.query(
    "SELECT CONVERT(varchar(50),SERVERPROPERTY('ProductVersion')) AS server_version,DB_NAME() AS database_name,compatibility_level FROM sys.databases WHERE name=DB_NAME()",
  );
  console.log(result.rows[0]);
  if (result.rows[0]?.compatibility_level < 130)
    throw Error("OPENJSON için compatibility level en az 130 olmalı.");
  const found = (
    await db.query("SELECT OBJECT_ID(N'dbo.kp_schema_migrations',N'U') AS id")
  ).rows[0]?.id;
  console.log(
    found
      ? "Bağlantı başarılı; şema sürüm tablosu görünüyor."
      : "Bağlantı başarılı; şema yok veya görüntüleme yetkisi eksik. IT ile npm run db:migrate adımını tamamlayın.",
  );
} catch (e) {
  console.error("MSSQL kontrolü başarısız:", e.code || e.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
