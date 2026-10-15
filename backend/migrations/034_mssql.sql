ALTER TABLE [dbo].[kp_resource_versions] ADD [assignment_role] varchar(20) COLLATE Latin1_General_100_BIN2 NULL;
EXEC(N'ALTER TABLE [dbo].[kp_resource_versions] ADD CONSTRAINT [ck_kp_resource_versions_assignment_role] CHECK ([assignment_role] IS NULL OR [assignment_role] IN (''leader'',''productOwner'',''member''));');
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(34);
