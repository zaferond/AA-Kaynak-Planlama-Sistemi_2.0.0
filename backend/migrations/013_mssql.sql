DECLARE @old_role_constraint sysname;
SELECT TOP 1 @old_role_constraint=[name]
FROM sys.check_constraints
WHERE [parent_object_id]=OBJECT_ID(N'dbo.kp_users') AND [definition] LIKE N'%role%';
IF @old_role_constraint IS NOT NULL
BEGIN
  DECLARE @drop_role_sql nvarchar(max);
  SET @drop_role_sql=N'ALTER TABLE [dbo].[kp_users] DROP CONSTRAINT '+QUOTENAME(@old_role_constraint);
  EXEC(@drop_role_sql);
END;
ALTER TABLE [dbo].[kp_users] ADD CONSTRAINT [ck_kp_users_role] CHECK ([role] IN ('admin','manager','normal'));
ALTER TABLE [dbo].[kp_users] ADD [resource_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NULL;
ALTER TABLE [dbo].[kp_users] ADD CONSTRAINT [fk_kp_users_resource] FOREIGN KEY ([resource_id]) REFERENCES [dbo].[kp_resources]([id]) ON DELETE SET NULL;
EXEC(N'CREATE UNIQUE INDEX [ux_kp_users_resource_id] ON [dbo].[kp_users]([resource_id]) WHERE [resource_id] IS NOT NULL;');
DELETE FROM [dbo].[kp_sessions];
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(13);
