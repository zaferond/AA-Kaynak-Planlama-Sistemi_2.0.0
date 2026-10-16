CREATE TABLE [kp_schedule_scenarios] (
  [id] TEXT NOT NULL PRIMARY KEY CHECK(length([id])<=120),
  [payload] TEXT NOT NULL
);
INSERT INTO [kp_schema_migrations]([version]) VALUES(40);
