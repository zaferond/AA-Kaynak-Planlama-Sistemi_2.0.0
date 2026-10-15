DECLARE @old_status_constraint sysname;
SELECT TOP 1 @old_status_constraint=[name]
FROM sys.check_constraints
WHERE [parent_object_id]=OBJECT_ID(N'dbo.kp_resource_versions')
  AND [definition] LIKE N'%Aktif Çalışan%'
  AND [definition] LIKE N'%Pasif İlan%';
IF @old_status_constraint IS NULL
  THROW 50014, N'Kaynak statüsü kısıtı bulunamadı.', 1;
DECLARE @drop_status_sql nvarchar(max);
SET @drop_status_sql=N'ALTER TABLE [dbo].[kp_resource_versions] DROP CONSTRAINT '+QUOTENAME(@old_status_constraint);
EXEC(@drop_status_sql);
ALTER TABLE [dbo].[kp_resource_versions] ADD CONSTRAINT [ck_kp_resource_versions_status]
  CHECK ([status] IN (N'Aktif Çalışan',N'SAAT Ücretli Ofis Ç.',N'Gear Up',N'Aktif İlan',N'Pasif İlan',N'İşten Ayrıldı'));
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(14);
