ALTER TABLE [kp_project_milestones] ADD COLUMN [extra_ranges] TEXT NOT NULL DEFAULT '[]' CHECK(length([extra_ranges])<=4000);
INSERT INTO [kp_schema_migrations]([version]) VALUES(16);
