CREATE TABLE [kp_project_milestones] (
  [project_id] TEXT NOT NULL CHECK(length([project_id])<=120),
  [id] TEXT NOT NULL CHECK(length([id])<=120),
  [name] TEXT NOT NULL CHECK(length([name]) BETWEEN 1 AND 200),
  [start_month] TEXT NOT NULL CHECK(length([start_month])=7),
  [end_month] TEXT NOT NULL CHECK(length([end_month])=7),
  PRIMARY KEY ([project_id],[id]),
  FOREIGN KEY ([project_id]) REFERENCES [kp_projects]([id]) ON DELETE CASCADE,
  CHECK ([start_month]<=[end_month]),
  CHECK (([start_month] GLOB '20[0-9][0-9]-[0-1][0-9]' OR [start_month] GLOB '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([start_month],6,2) BETWEEN '01' AND '12'),
  CHECK (([end_month] GLOB '20[0-9][0-9]-[0-1][0-9]' OR [end_month] GLOB '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([end_month],6,2) BETWEEN '01' AND '12')
);

CREATE INDEX [kp_project_milestones_project_start_idx] ON [kp_project_milestones]([project_id],[start_month]);

INSERT INTO [kp_schema_migrations]([version]) VALUES(4);
