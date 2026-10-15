ALTER TABLE [kp_project_milestones] ADD COLUMN [sort_order] INTEGER NOT NULL DEFAULT 0 CHECK ([sort_order]>=0);
INSERT INTO [kp_schema_migrations]([version]) VALUES(26);
