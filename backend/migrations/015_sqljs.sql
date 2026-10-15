ALTER TABLE [kp_projects] ADD COLUMN [responsible_name] TEXT NOT NULL DEFAULT '' CHECK(length([responsible_name])<=200);
INSERT INTO [kp_schema_migrations]([version]) VALUES(15);
