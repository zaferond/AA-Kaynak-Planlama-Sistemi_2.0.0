CREATE TABLE [dbo].[kp_actual_allocations] (
  [resource_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [project_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [month] varchar(7) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [amount] float NOT NULL CHECK([amount]>=0 AND [amount]<=100),
  PRIMARY KEY ([resource_id],[project_id],[month]),
  FOREIGN KEY ([resource_id]) REFERENCES [dbo].[kp_resources]([id]) ON DELETE CASCADE,
  FOREIGN KEY ([project_id]) REFERENCES [dbo].[kp_projects]([id]) ON DELETE CASCADE
);
CREATE INDEX [kp_actual_allocations_project_month_idx] ON [dbo].[kp_actual_allocations]([project_id],[month]);
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(7);
