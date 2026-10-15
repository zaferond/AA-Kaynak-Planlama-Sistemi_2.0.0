ALTER TABLE [dbo].[kp_settings] ADD [calendar_days] nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [DF_kp_settings_calendar_days] DEFAULT N'{}';
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(20);
