ALTER TABLE [kp_project_milestones] ADD COLUMN [has_critical_topics] INTEGER NOT NULL DEFAULT 1 CHECK ([has_critical_topics] IN (0,1));
INSERT INTO [kp_schema_migrations]([version]) VALUES(23);
