CREATE TABLE [dbo].[kp_user_planning_teams] (
  [user_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [team_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  PRIMARY KEY ([user_id],[team_id]),
  FOREIGN KEY ([user_id]) REFERENCES [dbo].[kp_users]([id]) ON DELETE CASCADE,
  FOREIGN KEY ([team_id]) REFERENCES [dbo].[kp_teams]([id])
);
CREATE INDEX [ix_kp_user_planning_teams_team] ON [dbo].[kp_user_planning_teams]([team_id]);
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(37);
