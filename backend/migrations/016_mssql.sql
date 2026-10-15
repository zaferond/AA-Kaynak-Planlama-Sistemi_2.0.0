ALTER TABLE [dbo].[kp_project_milestones] ADD [extra_ranges] nvarchar(max) NOT NULL CONSTRAINT [DF_kp_project_milestones_extra_ranges] DEFAULT N'[]';
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(16);
