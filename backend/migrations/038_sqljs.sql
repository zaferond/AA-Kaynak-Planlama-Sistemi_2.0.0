ALTER TABLE [kp_projects] ADD COLUMN [access_restricted] INTEGER NOT NULL DEFAULT 0 CHECK([access_restricted] IN (0,1));
CREATE TABLE [kp_project_access] (
  [project_id] TEXT NOT NULL CHECK(length([project_id])<=120),
  [kind] TEXT NOT NULL CHECK([kind] IN ('role','leader','team','person')),
  [target] TEXT NOT NULL CHECK(length([target]) BETWEEN 1 AND 200),
  PRIMARY KEY ([project_id],[kind],[target]),
  FOREIGN KEY ([project_id]) REFERENCES [kp_projects]([id]) ON DELETE CASCADE
);
INSERT INTO [kp_schema_migrations]([version]) VALUES(38);
