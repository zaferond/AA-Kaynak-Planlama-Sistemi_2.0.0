ALTER TABLE [kp_users] ADD COLUMN [must_change_password] INTEGER NOT NULL DEFAULT 0 CHECK([must_change_password] IN (0,1));
INSERT INTO [kp_schema_migrations]([version]) VALUES(42);
