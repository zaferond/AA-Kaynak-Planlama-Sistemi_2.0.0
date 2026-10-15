ALTER TABLE [dbo].[kp_project_milestones] ADD [diamond_style] varchar(20) NOT NULL CONSTRAINT [DF_kp_project_milestones_diamond_style] DEFAULT ('solid') CONSTRAINT [CK_kp_project_milestones_diamond_style] CHECK ([diamond_style] IN ('solid','outline'));
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(28);
