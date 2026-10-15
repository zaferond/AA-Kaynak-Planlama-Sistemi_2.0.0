CREATE TABLE [kp_user_planning_teams] (
  [user_id] TEXT NOT NULL CHECK(length([user_id])<=120),
  [team_id] TEXT NOT NULL CHECK(length([team_id])<=120),
  PRIMARY KEY ([user_id],[team_id]),
  FOREIGN KEY ([user_id]) REFERENCES [kp_users]([id]) ON DELETE CASCADE,
  FOREIGN KEY ([team_id]) REFERENCES [kp_teams]([id])
);
CREATE INDEX [ix_kp_user_planning_teams_team] ON [kp_user_planning_teams]([team_id]);
INSERT INTO kp_schema_migrations(version) VALUES(37);
