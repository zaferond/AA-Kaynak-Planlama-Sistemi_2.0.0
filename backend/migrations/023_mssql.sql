ALTER TABLE [dbo].[kp_project_milestones] ADD [has_critical_topics] bit NOT NULL CONSTRAINT [DF_kp_project_milestones_has_critical_topics] DEFAULT (1);
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(23);
