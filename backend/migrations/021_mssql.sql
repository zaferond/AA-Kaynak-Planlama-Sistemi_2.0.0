ALTER TABLE [dbo].[kp_settings] ADD [person_calendar] nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [DF_kp_settings_person_calendar] DEFAULT N'{}';
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(21);
