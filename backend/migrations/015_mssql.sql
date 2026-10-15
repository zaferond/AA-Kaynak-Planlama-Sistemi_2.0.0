ALTER TABLE [dbo].[kp_projects] ADD [responsible_name] nvarchar(200) NOT NULL CONSTRAINT [DF_kp_projects_responsible_name] DEFAULT N'';
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(15);
