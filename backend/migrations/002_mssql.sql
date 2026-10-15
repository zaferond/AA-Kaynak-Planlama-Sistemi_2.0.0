CREATE TABLE [dbo].[kp_person_allocations] (
  [resource_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [project_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [month] varchar(7) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [amount] float NOT NULL,
  PRIMARY KEY ([resource_id],[project_id],[month]),
  FOREIGN KEY ([resource_id]) REFERENCES [dbo].[kp_resources]([id]) ON DELETE CASCADE,
  FOREIGN KEY ([project_id]) REFERENCES [dbo].[kp_projects]([id]) ON DELETE CASCADE,
  CHECK ([amount]>=0 AND [amount]<=100),
  CHECK (([month] LIKE '20[0-9][0-9]-[0-1][0-9]' OR [month] LIKE '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([month],6,2) BETWEEN '01' AND '12')
);

CREATE INDEX kp_person_alloc_project_month_idx ON [dbo].[kp_person_allocations](project_id,month);

DELETE FROM [dbo].[kp_revisions] WHERE kind='allocation';

INSERT INTO kp_schema_migrations(version) VALUES(2);
