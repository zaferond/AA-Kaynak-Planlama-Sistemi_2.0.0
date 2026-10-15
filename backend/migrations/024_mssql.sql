CREATE TABLE [dbo].[kp_project_risks] (
  [id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [project_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [payload] nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
  CONSTRAINT [FK_kp_project_risks_project] FOREIGN KEY ([project_id]) REFERENCES [dbo].[kp_projects]([id]) ON DELETE CASCADE
);
CREATE INDEX [ix_kp_project_risks_project] ON [dbo].[kp_project_risks]([project_id]);
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(24);
