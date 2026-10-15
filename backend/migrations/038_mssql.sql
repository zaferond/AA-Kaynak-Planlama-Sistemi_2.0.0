ALTER TABLE [dbo].[kp_projects] ADD [access_restricted] bit NOT NULL CONSTRAINT [DF_kp_projects_access_restricted] DEFAULT 0;
CREATE TABLE [dbo].[kp_project_access] (
  [project_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [kind] varchar(10) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [target] nvarchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
  PRIMARY KEY ([project_id],[kind],[target]),
  FOREIGN KEY ([project_id]) REFERENCES [dbo].[kp_projects]([id]) ON DELETE CASCADE,
  CHECK ([kind] IN ('role','leader','team','person')),
  CHECK (LEN([target]) BETWEEN 1 AND 200)
);
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(38);
