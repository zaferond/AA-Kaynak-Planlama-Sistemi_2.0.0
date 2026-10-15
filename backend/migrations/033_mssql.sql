-- Parent links are validated as a complete, acyclic leadership catalog.
ALTER TABLE [dbo].[kp_settings] ADD [leader_parents] nvarchar(max) NOT NULL CONSTRAINT [df_kp_settings_leader_parents] DEFAULT N'{}';
EXEC(N'ALTER TABLE [dbo].[kp_settings] ADD CONSTRAINT [ck_kp_settings_leader_parents] CHECK (ISJSON([leader_parents])=1);');
ALTER TABLE [dbo].[kp_settings] ADD [leadership_units] nvarchar(max) NOT NULL CONSTRAINT [df_kp_settings_leadership_units] DEFAULT N'{}';
EXEC(N'ALTER TABLE [dbo].[kp_settings] ADD CONSTRAINT [ck_kp_settings_leadership_units] CHECK (ISJSON([leadership_units])=1);');
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(33);
