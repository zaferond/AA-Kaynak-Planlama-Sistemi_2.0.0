ALTER TABLE [kp_users] ADD COLUMN [project_editor] INTEGER NOT NULL DEFAULT 0 CHECK([project_editor] IN (0,1));
INSERT INTO [kp_schema_migrations]([version]) VALUES(39);
