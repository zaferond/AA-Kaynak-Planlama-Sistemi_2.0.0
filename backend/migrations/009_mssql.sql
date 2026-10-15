ALTER TABLE [dbo].[kp_leaders] ADD [manager_name] nvarchar(200) NOT NULL CONSTRAINT [DF_kp_leaders_manager_name] DEFAULT N'';
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(9);
