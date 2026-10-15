-- No legacy user is implicitly claimed by a matching directory username.
ALTER TABLE [dbo].[kp_users] ADD [directory_id] varchar(32) COLLATE Latin1_General_100_BIN2 NULL;
ALTER TABLE [dbo].[kp_users] ADD [email] nvarchar(320) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [df_kp_users_email] DEFAULT '';
ALTER TABLE [dbo].[kp_users] ADD [auth_source] varchar(10) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [df_kp_users_auth_source] DEFAULT 'local';
-- Defer compilation until the newly added columns exist, within the same transaction.
EXEC(N'
ALTER TABLE [dbo].[kp_users] ADD CONSTRAINT [ck_kp_users_directory_id] CHECK ([directory_id] IS NULL OR LEN([directory_id])=32);
ALTER TABLE [dbo].[kp_users] ADD CONSTRAINT [ck_kp_users_auth_source] CHECK ([auth_source] IN (''local'',''ldap''));
ALTER TABLE [dbo].[kp_users] ADD CONSTRAINT [ck_kp_users_directory_link] CHECK (([auth_source]=''local'' AND [directory_id] IS NULL) OR ([auth_source]=''ldap'' AND [directory_id] IS NOT NULL));
CREATE UNIQUE INDEX [ux_kp_users_directory_id] ON [dbo].[kp_users]([directory_id]) WHERE [directory_id] IS NOT NULL;
');
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(32);
