ALTER TABLE [kp_project_milestones] ADD COLUMN [diamond_style] TEXT NOT NULL DEFAULT 'solid' CHECK ([diamond_style] IN ('solid','outline'));
INSERT INTO [kp_schema_migrations]([version]) VALUES(28);
