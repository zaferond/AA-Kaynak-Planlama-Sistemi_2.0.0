ALTER TABLE [dbo].[kp_project_milestones] ADD [bar_notes] nvarchar(max) NOT NULL CONSTRAINT [DF_kp_project_milestones_bar_notes] DEFAULT N'[]';
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(18);
