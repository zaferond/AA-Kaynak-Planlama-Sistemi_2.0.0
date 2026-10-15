CREATE TABLE [dbo].[kp_audit_events] (
  [id] varchar(36) NOT NULL PRIMARY KEY,
  [occurred_at] varchar(30) NOT NULL,
  [actor_id] nvarchar(120) NOT NULL,
  [actor_name] nvarchar(150) NOT NULL,
  [kind] varchar(20) NOT NULL,
  [record_id] nvarchar(400) NOT NULL,
  [record_name] nvarchar(300) NOT NULL,
  [action] varchar(10) NOT NULL CHECK([action] IN ('create','update','delete')),
  [changes] nvarchar(max) NOT NULL
);
CREATE INDEX [ix_kp_audit_events_time] ON [dbo].[kp_audit_events]([occurred_at] DESC,[id] DESC);
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(25);
