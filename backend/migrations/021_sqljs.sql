ALTER TABLE [kp_settings] ADD COLUMN [person_calendar] TEXT NOT NULL DEFAULT '{}';
INSERT INTO [kp_schema_migrations]([version]) VALUES(21);
