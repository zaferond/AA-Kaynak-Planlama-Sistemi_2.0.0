-- SQL.js-only repair (013 dropped its session indexes). MSSQL kept them;
-- recreate only if a database lost them some other way.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'kp_sessions_user_idx' AND object_id = OBJECT_ID(N'[dbo].[kp_sessions]'))
  CREATE INDEX kp_sessions_user_idx ON [dbo].[kp_sessions](user_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'kp_sessions_expiry_idx' AND object_id = OBJECT_ID(N'[dbo].[kp_sessions]'))
  CREATE INDEX kp_sessions_expiry_idx ON [dbo].[kp_sessions](expires_at);
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(41);
