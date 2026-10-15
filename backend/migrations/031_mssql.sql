CREATE TABLE [dbo].[kp_risk_systems] (
  [id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [name] nvarchar(200) NOT NULL
);
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(31);
