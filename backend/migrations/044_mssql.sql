CREATE TABLE [dbo].[kp_warning_configs] (
  [id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [payload] nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL
);
CREATE TABLE [dbo].[kp_warning_assessments] (
  [id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [payload] nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL
);
CREATE TABLE [dbo].[kp_scenario_warnings] (
  [id] nvarchar(240) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [payload] nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL
);
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(44);
