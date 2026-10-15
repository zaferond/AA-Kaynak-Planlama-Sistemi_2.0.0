CREATE TABLE [kp_actual_worked_hours] (
  [resource_id] TEXT NOT NULL CHECK(length([resource_id])<=120),
  [month] TEXT NOT NULL CHECK(length([month])=7),
  [hours] REAL NOT NULL CHECK([hours]>=0 AND [hours]<=1000),
  PRIMARY KEY ([resource_id],[month]),
  FOREIGN KEY ([resource_id]) REFERENCES [kp_resources]([id]) ON DELETE CASCADE
);
CREATE TABLE [kp_actual_percent_entries] (
  [resource_id] TEXT NOT NULL CHECK(length([resource_id])<=120),
  [project_id] TEXT NOT NULL CHECK(length([project_id])<=120),
  [month] TEXT NOT NULL CHECK(length([month])=7),
  [percent] REAL NOT NULL CHECK([percent]>=0 AND [percent]<=10000),
  PRIMARY KEY ([resource_id],[project_id],[month]),
  FOREIGN KEY ([resource_id]) REFERENCES [kp_resources]([id]) ON DELETE CASCADE,
  FOREIGN KEY ([project_id]) REFERENCES [kp_projects]([id]) ON DELETE CASCADE
);
INSERT INTO [kp_schema_migrations]([version]) VALUES(11);
