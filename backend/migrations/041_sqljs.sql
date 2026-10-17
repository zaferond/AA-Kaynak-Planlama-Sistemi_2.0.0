-- 013 rebuilt kp_sessions without the indexes 001 created; MSSQL kept them.
CREATE INDEX IF NOT EXISTS kp_sessions_user_idx ON kp_sessions(user_id);
CREATE INDEX IF NOT EXISTS kp_sessions_expiry_idx ON kp_sessions(expires_at);
INSERT INTO [kp_schema_migrations]([version]) VALUES(41);
