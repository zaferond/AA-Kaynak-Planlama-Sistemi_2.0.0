ALTER TABLE [dbo].[kp_project_milestones] ADD [sort_order] int NOT NULL CONSTRAINT [DF_kp_project_milestones_sort_order] DEFAULT (0) CHECK ([sort_order]>=0);
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(26);
