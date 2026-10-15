CREATE TABLE [dbo].[kp_project_milestones] (
  [project_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [name] nvarchar(200) NOT NULL,
  [start_month] varchar(7) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [end_month] varchar(7) COLLATE Latin1_General_100_BIN2 NOT NULL,
  PRIMARY KEY ([project_id],[id]),
  FOREIGN KEY ([project_id]) REFERENCES [dbo].[kp_projects]([id]) ON DELETE CASCADE,
  CHECK ([start_month]<=[end_month]),
  CHECK (([start_month] LIKE '20[0-9][0-9]-[0-1][0-9]' OR [start_month] LIKE '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([start_month],6,2) BETWEEN '01' AND '12'),
  CHECK (([end_month] LIKE '20[0-9][0-9]-[0-1][0-9]' OR [end_month] LIKE '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([end_month],6,2) BETWEEN '01' AND '12')
);

CREATE INDEX [kp_project_milestones_project_start_idx] ON [dbo].[kp_project_milestones]([project_id],[start_month]);

INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(4);
