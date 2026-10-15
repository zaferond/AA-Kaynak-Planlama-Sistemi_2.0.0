CREATE TABLE [kp_project_risks] (
  [id] TEXT NOT NULL PRIMARY KEY CHECK(length([id])<=120),
  [project_id] TEXT NOT NULL CHECK(length([project_id])<=120),
  [payload] TEXT NOT NULL,
  FOREIGN KEY ([project_id]) REFERENCES [kp_projects]([id]) ON DELETE CASCADE
);
CREATE INDEX [ix_kp_project_risks_project] ON [kp_project_risks]([project_id]);
INSERT INTO [kp_schema_migrations]([version]) VALUES(24);
