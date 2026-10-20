CREATE TABLE [kp_warning_configs] (
  [id] TEXT NOT NULL PRIMARY KEY CHECK(length([id])<=120),
  [payload] TEXT NOT NULL
);
CREATE TABLE [kp_warning_assessments] (
  [id] TEXT NOT NULL PRIMARY KEY CHECK(length([id])<=120),
  [payload] TEXT NOT NULL
);
CREATE TABLE [kp_scenario_warnings] (
  [id] TEXT NOT NULL PRIMARY KEY CHECK(length([id])<=240),
  [payload] TEXT NOT NULL
);
INSERT INTO [kp_schema_migrations]([version]) VALUES(44);
