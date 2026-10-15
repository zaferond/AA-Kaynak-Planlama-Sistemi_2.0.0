CREATE TABLE [kp_actual_allocations] (
  [resource_id] TEXT NOT NULL CHECK(length([resource_id])<=120),
  [project_id] TEXT NOT NULL CHECK(length([project_id])<=120),
  [month] TEXT NOT NULL CHECK(length([month])=7),
  [amount] REAL NOT NULL CHECK([amount]>=0 AND [amount]<=100),
  PRIMARY KEY ([resource_id],[project_id],[month]),
  FOREIGN KEY ([resource_id]) REFERENCES [kp_resources]([id]) ON DELETE CASCADE,
  FOREIGN KEY ([project_id]) REFERENCES [kp_projects]([id]) ON DELETE CASCADE
);
CREATE INDEX [kp_actual_allocations_project_month_idx] ON [kp_actual_allocations]([project_id],[month]);
INSERT INTO [kp_schema_migrations]([version]) VALUES(7);
