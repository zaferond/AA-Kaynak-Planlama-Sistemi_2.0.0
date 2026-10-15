ALTER TABLE [kp_leaders] ADD COLUMN [manager_name] TEXT NOT NULL DEFAULT '' CHECK(length([manager_name])<=200);
INSERT INTO [kp_schema_migrations]([version]) VALUES(9);
