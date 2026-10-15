CREATE TABLE [kp_risk_systems] (
  [id] TEXT NOT NULL PRIMARY KEY CHECK (length([id]) BETWEEN 1 AND 120),
  [name] TEXT NOT NULL CHECK (length([name]) BETWEEN 1 AND 200)
);
INSERT INTO [kp_schema_migrations]([version]) VALUES(31);
