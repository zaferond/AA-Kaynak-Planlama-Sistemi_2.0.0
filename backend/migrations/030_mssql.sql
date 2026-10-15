ALTER TABLE [dbo].[kp_projects] ADD [sort_order] int NULL CONSTRAINT [CK_kp_projects_sort_order] CHECK ([sort_order] IS NULL OR [sort_order] BETWEEN 0 AND 1000000000);
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(30);
