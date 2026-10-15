-- Rebuild the user table to extend its original role CHECK constraint.
-- Existing sessions are deliberately revoked when the permission model changes.
CREATE TEMP TABLE [kp_user_leaders_migration] AS SELECT [user_id],[leader_name] FROM [kp_user_leaders];
DROP TABLE [kp_sessions];
DROP TABLE [kp_user_leaders];
CREATE TABLE [kp_users_next] (
  [id] TEXT NOT NULL CHECK(length([id])<=120),
  [username] TEXT NOT NULL CHECK(length([username])<=100),
  [name] TEXT NOT NULL CHECK(length([name])<=150),
  [role] TEXT NOT NULL CHECK(length([role])<=10),
  [resource_id] TEXT NULL REFERENCES [kp_resources]([id]) ON DELETE SET NULL,
  [active] INTEGER NOT NULL CHECK([active] IN (0,1)),
  [password_salt] TEXT NOT NULL CHECK(length([password_salt])<=100),
  [password_hash] TEXT NOT NULL CHECK(length([password_hash])<=200),
  [revision] INTEGER NOT NULL,
  [version] INTEGER NOT NULL,
  PRIMARY KEY ([id]),
  UNIQUE ([username]),
  CHECK ([role] IN ('admin','manager','normal')),
  CHECK ([revision]>=1 AND [version]>=1)
);
INSERT INTO [kp_users_next]([id],[username],[name],[role],[resource_id],[active],[password_salt],[password_hash],[revision],[version])
SELECT [id],[username],[name],[role],NULL,[active],[password_salt],[password_hash],[revision],[version] FROM [kp_users];
DROP TABLE [kp_users];
ALTER TABLE [kp_users_next] RENAME TO [kp_users];
CREATE UNIQUE INDEX [ux_kp_users_resource_id] ON [kp_users]([resource_id]) WHERE [resource_id] IS NOT NULL;
CREATE TABLE [kp_user_leaders] (
  [user_id] TEXT NOT NULL CHECK(length([user_id])<=120),
  [leader_name] TEXT NOT NULL CHECK(length([leader_name])<=200),
  PRIMARY KEY ([user_id],[leader_name]),
  FOREIGN KEY ([user_id]) REFERENCES [kp_users]([id]) ON DELETE CASCADE,
  FOREIGN KEY ([leader_name]) REFERENCES [kp_leaders]([name])
);
INSERT INTO [kp_user_leaders]([user_id],[leader_name]) SELECT [user_id],[leader_name] FROM [kp_user_leaders_migration];
DROP TABLE [kp_user_leaders_migration];
CREATE TABLE [kp_sessions] (
  [token_hash] TEXT NOT NULL CHECK(length([token_hash])<=64),
  [user_id] TEXT NOT NULL CHECK(length([user_id])<=120),
  [user_version] INTEGER NOT NULL,
  [csrf] TEXT NOT NULL CHECK(length([csrf])<=100),
  [expires_at] TEXT NOT NULL CHECK(length([expires_at])<=30),
  PRIMARY KEY ([token_hash]),
  FOREIGN KEY ([user_id]) REFERENCES [kp_users]([id]) ON DELETE CASCADE
);
INSERT INTO [kp_schema_migrations]([version]) VALUES(13);
