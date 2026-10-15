ALTER TABLE [kp_project_milestones] ADD COLUMN [bar_text] TEXT NOT NULL DEFAULT '' CHECK(length([bar_text])<=200);
INSERT INTO [kp_schema_migrations]([version]) VALUES(10);
