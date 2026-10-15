CREATE TABLE [kp_audit_events] (
  [id] TEXT NOT NULL PRIMARY KEY,
  [occurred_at] TEXT NOT NULL,
  [actor_id] TEXT NOT NULL,
  [actor_name] TEXT NOT NULL,
  [kind] TEXT NOT NULL,
  [record_id] TEXT NOT NULL,
  [record_name] TEXT NOT NULL,
  [action] TEXT NOT NULL CHECK([action] IN ('create','update','delete')),
  [changes] TEXT NOT NULL
);
CREATE INDEX [ix_kp_audit_events_time] ON [kp_audit_events]([occurred_at] DESC,[id] DESC);
INSERT INTO [kp_schema_migrations]([version]) VALUES(25);
