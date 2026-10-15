ALTER TABLE [kp_settings] ADD COLUMN [calendar_days] TEXT NOT NULL DEFAULT '{}';
INSERT INTO [kp_schema_migrations]([version]) VALUES(20);
