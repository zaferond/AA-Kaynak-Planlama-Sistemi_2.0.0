CREATE TABLE [dbo].[kp_actual_worked_hours] (
  [resource_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [month] varchar(7) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [hours] float NOT NULL CHECK([hours]>=0 AND [hours]<=1000),
  PRIMARY KEY ([resource_id],[month]),
  FOREIGN KEY ([resource_id]) REFERENCES [dbo].[kp_resources]([id]) ON DELETE CASCADE
);
CREATE TABLE [dbo].[kp_actual_percent_entries] (
  [resource_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [project_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [month] varchar(7) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [percent] float NOT NULL CHECK([percent]>=0 AND [percent]<=10000),
  PRIMARY KEY ([resource_id],[project_id],[month]),
  FOREIGN KEY ([resource_id]) REFERENCES [dbo].[kp_resources]([id]) ON DELETE CASCADE,
  FOREIGN KEY ([project_id]) REFERENCES [dbo].[kp_projects]([id]) ON DELETE CASCADE
);
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(11);
