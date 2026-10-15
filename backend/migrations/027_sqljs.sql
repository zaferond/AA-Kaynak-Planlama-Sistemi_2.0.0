ALTER TABLE [kp_project_milestones] ADD COLUMN [display_kind] TEXT NOT NULL DEFAULT 'range' CHECK ([display_kind] IN ('range','milestone'));
INSERT INTO [kp_schema_migrations]([version]) VALUES(27);
