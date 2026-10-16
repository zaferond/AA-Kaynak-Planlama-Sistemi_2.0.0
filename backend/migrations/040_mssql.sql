CREATE TABLE [dbo].[kp_schedule_scenarios] (
  [id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [payload] nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL
);
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(40);
