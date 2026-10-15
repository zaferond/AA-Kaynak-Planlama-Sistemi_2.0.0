ALTER TABLE [dbo].[kp_users] ADD [project_editor] bit NOT NULL CONSTRAINT [DF_kp_users_project_editor] DEFAULT 0;
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(39);
