ALTER TABLE [dbo].[kp_project_milestones] ADD [display_kind] varchar(20) NOT NULL CONSTRAINT [DF_kp_project_milestones_display_kind] DEFAULT ('range') CONSTRAINT [CK_kp_project_milestones_display_kind] CHECK ([display_kind] IN ('range','milestone'));
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(27);
