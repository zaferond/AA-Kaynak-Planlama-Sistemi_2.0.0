ALTER TABLE [dbo].[kp_users] ADD [must_change_password] bit NOT NULL CONSTRAINT [DF_kp_users_must_change_password] DEFAULT 0;
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(42);
