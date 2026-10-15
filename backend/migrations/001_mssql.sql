-- Application tables only: kp_ prefix. Run inside an empty application database.

CREATE TABLE [dbo].[kp_leaders] (
  [name] nvarchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
  PRIMARY KEY ([name])
);

CREATE TABLE [dbo].[kp_teams] (
  [id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [name] nvarchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [leader_name] nvarchar(200) COLLATE Latin1_General_100_BIN2 NULL,
  [excel_capacity] float NOT NULL,
  [catalog] bit NOT NULL CHECK([catalog] IN (0,1)),
  PRIMARY KEY ([id]),
  FOREIGN KEY ([leader_name]) REFERENCES [dbo].[kp_leaders]([name])
);

CREATE TABLE [dbo].[kp_projects] (
  [id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [name] nvarchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [start_month] varchar(7) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [end_month] varchar(7) COLLATE Latin1_General_100_BIN2 NOT NULL,
  PRIMARY KEY ([id]),
  CHECK (start_month<=end_month),
  CHECK ([start_month] IS NULL OR (([start_month] LIKE '20[0-9][0-9]-[0-1][0-9]' OR [start_month] LIKE '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([start_month],6,2) BETWEEN '01' AND '12')),
  CHECK ([end_month] IS NULL OR (([end_month] LIKE '20[0-9][0-9]-[0-1][0-9]' OR [end_month] LIKE '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([end_month],6,2) BETWEEN '01' AND '12'))
);

CREATE TABLE [dbo].[kp_project_phases] (
  [project_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [month] varchar(7) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [label] nvarchar(3000) COLLATE Latin1_General_100_BIN2 NULL,
  [color] varchar(20) COLLATE Latin1_General_100_BIN2 NULL,
  PRIMARY KEY ([project_id],[month]),
  FOREIGN KEY ([project_id]) REFERENCES [dbo].[kp_projects]([id]) ON DELETE CASCADE,
  CHECK (color IS NULL OR color IN ('blue','green','amber','red','purple','gray')),
  CHECK ([month] IS NULL OR (([month] LIKE '20[0-9][0-9]-[0-1][0-9]' OR [month] LIKE '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([month],6,2) BETWEEN '01' AND '12'))
);

CREATE TABLE [dbo].[kp_resources] (
  [id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [name] nvarchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [note] nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [code] nvarchar(100) COLLATE Latin1_General_100_BIN2 NULL,
  PRIMARY KEY ([id])
);

CREATE TABLE [dbo].[kp_resource_versions] (
  [resource_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [effective_month] varchar(7) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [team_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NULL,
  [leader_name] nvarchar(200) COLLATE Latin1_General_100_BIN2 NULL,
  [status] nvarchar(50) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [included] bit NOT NULL CHECK([included] IN (0,1)),
  [start_month] varchar(7) COLLATE Latin1_General_100_BIN2 NULL,
  [end_month] varchar(7) COLLATE Latin1_General_100_BIN2 NULL,
  [amount] float NOT NULL,
  PRIMARY KEY ([resource_id],[effective_month]),
  FOREIGN KEY ([resource_id]) REFERENCES [dbo].[kp_resources]([id]) ON DELETE CASCADE,
  FOREIGN KEY ([team_id]) REFERENCES [dbo].[kp_teams]([id]),
  FOREIGN KEY ([leader_name]) REFERENCES [dbo].[kp_leaders]([name]),
  CHECK (status IN (N'Aktif Çalışan',N'SAAT Ücretli Ofis Ç.',N'Gear Up',N'Aktif İlan',N'Pasif İlan')),
  CHECK (amount>=0 AND amount<=100),
  CHECK (NOT(included=1 AND status=N'Aktif İlan') OR start_month IS NOT NULL),
  CHECK (start_month IS NULL OR end_month IS NULL OR start_month<=end_month),
  CHECK ([effective_month] IS NULL OR (([effective_month] LIKE '20[0-9][0-9]-[0-1][0-9]' OR [effective_month] LIKE '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([effective_month],6,2) BETWEEN '01' AND '12')),
  CHECK ([start_month] IS NULL OR (([start_month] LIKE '20[0-9][0-9]-[0-1][0-9]' OR [start_month] LIKE '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([start_month],6,2) BETWEEN '01' AND '12')),
  CHECK ([end_month] IS NULL OR (([end_month] LIKE '20[0-9][0-9]-[0-1][0-9]' OR [end_month] LIKE '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([end_month],6,2) BETWEEN '01' AND '12'))
);

CREATE TABLE [dbo].[kp_allocations] (
  [team_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [project_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [month] varchar(7) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [amount] float NOT NULL,
  PRIMARY KEY ([team_id],[project_id],[month]),
  FOREIGN KEY ([team_id]) REFERENCES [dbo].[kp_teams]([id]),
  FOREIGN KEY ([project_id]) REFERENCES [dbo].[kp_projects]([id]),
  CHECK (amount>=0 AND amount<=10000),
  CHECK ([month] IS NULL OR (([month] LIKE '20[0-9][0-9]-[0-1][0-9]' OR [month] LIKE '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([month],6,2) BETWEEN '01' AND '12'))
);

CREATE TABLE [dbo].[kp_revisions] (
  [kind] varchar(20) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [record_id] nvarchar(400) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [revision] bigint NOT NULL,
  PRIMARY KEY ([kind],[record_id]),
  CHECK (kind IN ('team','project','resource','allocation')),
  CHECK (revision>=0)
);

CREATE TABLE [dbo].[kp_users] (
  [id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [username] nvarchar(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [name] nvarchar(150) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [role] varchar(10) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [active] bit NOT NULL CHECK([active] IN (0,1)),
  [password_salt] varchar(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [password_hash] varchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [revision] bigint NOT NULL,
  [version] bigint NOT NULL,
  PRIMARY KEY ([id]),
  UNIQUE ([username]),
  CHECK (role IN ('admin','normal')),
  CHECK (revision>=1 AND version>=1)
);

CREATE TABLE [dbo].[kp_user_leaders] (
  [user_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [leader_name] nvarchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
  PRIMARY KEY ([user_id],[leader_name]),
  FOREIGN KEY ([user_id]) REFERENCES [dbo].[kp_users]([id]) ON DELETE CASCADE,
  FOREIGN KEY ([leader_name]) REFERENCES [dbo].[kp_leaders]([name])
);

CREATE TABLE [dbo].[kp_sessions] (
  [token_hash] varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [user_id] nvarchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [user_version] bigint NOT NULL,
  [csrf] varchar(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [expires_at] varchar(30) COLLATE Latin1_General_100_BIN2 NOT NULL,
  PRIMARY KEY ([token_hash]),
  FOREIGN KEY ([user_id]) REFERENCES [dbo].[kp_users]([id]) ON DELETE CASCADE
);

CREATE TABLE [dbo].[kp_settings] (
  [id] int NOT NULL,
  [generation] bigint NOT NULL,
  [legacy_archive] nvarchar(max) COLLATE Latin1_General_100_BIN2 NULL,
  PRIMARY KEY ([id]),
  CHECK (id=1),
  CHECK (generation>=0)
);

CREATE INDEX kp_team_leader_idx ON kp_teams(leader_name);

CREATE INDEX kp_alloc_project_month_idx ON kp_allocations(project_id,month);

CREATE INDEX kp_versions_team_month_idx ON kp_resource_versions(team_id,effective_month);

CREATE INDEX kp_sessions_user_idx ON kp_sessions(user_id);

CREATE INDEX kp_sessions_expiry_idx ON kp_sessions(expires_at);

CREATE TABLE kp_schema_migrations(version int PRIMARY KEY);

INSERT INTO kp_schema_migrations(version) VALUES(1);
