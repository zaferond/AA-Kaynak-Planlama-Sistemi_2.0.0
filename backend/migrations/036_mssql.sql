-- Extend only the role constraint; keep existing rows, columns and indexes.
ALTER TABLE [dbo].[kp_resource_versions] DROP CONSTRAINT [ck_kp_resource_versions_assignment_role];
ALTER TABLE [dbo].[kp_resource_versions] WITH CHECK ADD CONSTRAINT [ck_kp_resource_versions_assignment_role]
  CHECK ([assignment_role] IS NULL OR [assignment_role] IN ('leader','productOwner','member','coe'));
ALTER TABLE [dbo].[kp_resource_versions] CHECK CONSTRAINT [ck_kp_resource_versions_assignment_role];
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(36);
