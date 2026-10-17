CREATE TABLE [kp_project_progress] (
  [id] TEXT NOT NULL PRIMARY KEY CHECK(length([id])<=120),
  [payload] TEXT NOT NULL
);
CREATE TABLE [kp_progress_locks] (
  [id] TEXT NOT NULL PRIMARY KEY CHECK(length([id])<=7),
  [payload] TEXT NOT NULL
);
INSERT INTO [kp_schema_migrations]([version]) VALUES(43);
