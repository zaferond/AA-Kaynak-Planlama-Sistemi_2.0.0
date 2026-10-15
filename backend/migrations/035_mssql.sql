ALTER TABLE [dbo].[kp_projects] ADD [project_code] nvarchar(100) NULL;
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(35);
