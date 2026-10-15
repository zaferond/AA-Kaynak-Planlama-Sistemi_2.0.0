-- Application tables only: kp_ prefix. Run inside an empty application database.

CREATE TABLE [kp_leaders] (
  [name] TEXT NOT NULL CHECK(length([name])<=200),
  PRIMARY KEY ([name])
);

CREATE TABLE [kp_teams] (
  [id] TEXT NOT NULL CHECK(length([id])<=120),
  [name] TEXT NOT NULL CHECK(length([name])<=200),
  [leader_name] TEXT NULL CHECK(length([leader_name])<=200),
  [excel_capacity] REAL NOT NULL,
  [catalog] INTEGER NOT NULL CHECK([catalog] IN (0,1)),
  PRIMARY KEY ([id]),
  FOREIGN KEY ([leader_name]) REFERENCES [kp_leaders]([name])
);

CREATE TABLE [kp_projects] (
  [id] TEXT NOT NULL CHECK(length([id])<=120),
  [name] TEXT NOT NULL CHECK(length([name])<=200),
  [start_month] TEXT NOT NULL CHECK(length([start_month])<=7),
  [end_month] TEXT NOT NULL CHECK(length([end_month])<=7),
  PRIMARY KEY ([id]),
  CHECK (start_month<=end_month),
  CHECK ([start_month] IS NULL OR (([start_month] GLOB '20[0-9][0-9]-[0-1][0-9]' OR [start_month] GLOB '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([start_month],6,2) BETWEEN '01' AND '12')),
  CHECK ([end_month] IS NULL OR (([end_month] GLOB '20[0-9][0-9]-[0-1][0-9]' OR [end_month] GLOB '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([end_month],6,2) BETWEEN '01' AND '12'))
);

CREATE TABLE [kp_project_phases] (
  [project_id] TEXT NOT NULL CHECK(length([project_id])<=120),
  [month] TEXT NOT NULL CHECK(length([month])<=7),
  [label] TEXT NULL CHECK(length([label])<=3000),
  [color] TEXT NULL CHECK(length([color])<=20),
  PRIMARY KEY ([project_id],[month]),
  FOREIGN KEY ([project_id]) REFERENCES [kp_projects]([id]) ON DELETE CASCADE,
  CHECK (color IS NULL OR color IN ('blue','green','amber','red','purple','gray')),
  CHECK ([month] IS NULL OR (([month] GLOB '20[0-9][0-9]-[0-1][0-9]' OR [month] GLOB '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([month],6,2) BETWEEN '01' AND '12'))
);

CREATE TABLE [kp_resources] (
  [id] TEXT NOT NULL CHECK(length([id])<=120),
  [name] TEXT NOT NULL CHECK(length([name])<=200),
  [note] TEXT NOT NULL,
  [code] TEXT NULL CHECK(length([code])<=100),
  PRIMARY KEY ([id])
);

CREATE TABLE [kp_resource_versions] (
  [resource_id] TEXT NOT NULL CHECK(length([resource_id])<=120),
  [effective_month] TEXT NOT NULL CHECK(length([effective_month])<=7),
  [team_id] TEXT NULL CHECK(length([team_id])<=120),
  [leader_name] TEXT NULL CHECK(length([leader_name])<=200),
  [status] TEXT NOT NULL CHECK(length([status])<=50),
  [included] INTEGER NOT NULL CHECK([included] IN (0,1)),
  [start_month] TEXT NULL CHECK(length([start_month])<=7),
  [end_month] TEXT NULL CHECK(length([end_month])<=7),
  [amount] REAL NOT NULL,
  PRIMARY KEY ([resource_id],[effective_month]),
  FOREIGN KEY ([resource_id]) REFERENCES [kp_resources]([id]) ON DELETE CASCADE,
  FOREIGN KEY ([team_id]) REFERENCES [kp_teams]([id]),
  FOREIGN KEY ([leader_name]) REFERENCES [kp_leaders]([name]),
  CHECK (status IN ('Aktif Çalışan','SAAT Ücretli Ofis Ç.','Gear Up','Aktif İlan','Pasif İlan')),
  CHECK (amount>=0 AND amount<=100),
  CHECK (NOT(included=1 AND status='Aktif İlan') OR start_month IS NOT NULL),
  CHECK (start_month IS NULL OR end_month IS NULL OR start_month<=end_month),
  CHECK ([effective_month] IS NULL OR (([effective_month] GLOB '20[0-9][0-9]-[0-1][0-9]' OR [effective_month] GLOB '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([effective_month],6,2) BETWEEN '01' AND '12')),
  CHECK ([start_month] IS NULL OR (([start_month] GLOB '20[0-9][0-9]-[0-1][0-9]' OR [start_month] GLOB '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([start_month],6,2) BETWEEN '01' AND '12')),
  CHECK ([end_month] IS NULL OR (([end_month] GLOB '20[0-9][0-9]-[0-1][0-9]' OR [end_month] GLOB '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([end_month],6,2) BETWEEN '01' AND '12'))
);

CREATE TABLE [kp_allocations] (
  [team_id] TEXT NOT NULL CHECK(length([team_id])<=120),
  [project_id] TEXT NOT NULL CHECK(length([project_id])<=120),
  [month] TEXT NOT NULL CHECK(length([month])<=7),
  [amount] REAL NOT NULL,
  PRIMARY KEY ([team_id],[project_id],[month]),
  FOREIGN KEY ([team_id]) REFERENCES [kp_teams]([id]),
  FOREIGN KEY ([project_id]) REFERENCES [kp_projects]([id]),
  CHECK (amount>=0 AND amount<=10000),
  CHECK ([month] IS NULL OR (([month] GLOB '20[0-9][0-9]-[0-1][0-9]' OR [month] GLOB '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([month],6,2) BETWEEN '01' AND '12'))
);

CREATE TABLE [kp_revisions] (
  [kind] TEXT NOT NULL CHECK(length([kind])<=20),
  [record_id] TEXT NOT NULL CHECK(length([record_id])<=400),
  [revision] INTEGER NOT NULL,
  PRIMARY KEY ([kind],[record_id]),
  CHECK (kind IN ('team','project','resource','allocation')),
  CHECK (revision>=0)
);

CREATE TABLE [kp_users] (
  [id] TEXT NOT NULL CHECK(length([id])<=120),
  [username] TEXT NOT NULL CHECK(length([username])<=100),
  [name] TEXT NOT NULL CHECK(length([name])<=150),
  [role] TEXT NOT NULL CHECK(length([role])<=10),
  [active] INTEGER NOT NULL CHECK([active] IN (0,1)),
  [password_salt] TEXT NOT NULL CHECK(length([password_salt])<=100),
  [password_hash] TEXT NOT NULL CHECK(length([password_hash])<=200),
  [revision] INTEGER NOT NULL,
  [version] INTEGER NOT NULL,
  PRIMARY KEY ([id]),
  UNIQUE ([username]),
  CHECK (role IN ('admin','normal')),
  CHECK (revision>=1 AND version>=1)
);

CREATE TABLE [kp_user_leaders] (
  [user_id] TEXT NOT NULL CHECK(length([user_id])<=120),
  [leader_name] TEXT NOT NULL CHECK(length([leader_name])<=200),
  PRIMARY KEY ([user_id],[leader_name]),
  FOREIGN KEY ([user_id]) REFERENCES [kp_users]([id]) ON DELETE CASCADE,
  FOREIGN KEY ([leader_name]) REFERENCES [kp_leaders]([name])
);

CREATE TABLE [kp_sessions] (
  [token_hash] TEXT NOT NULL CHECK(length([token_hash])<=64),
  [user_id] TEXT NOT NULL CHECK(length([user_id])<=120),
  [user_version] INTEGER NOT NULL,
  [csrf] TEXT NOT NULL CHECK(length([csrf])<=100),
  [expires_at] TEXT NOT NULL CHECK(length([expires_at])<=30),
  PRIMARY KEY ([token_hash]),
  FOREIGN KEY ([user_id]) REFERENCES [kp_users]([id]) ON DELETE CASCADE
);

CREATE TABLE [kp_settings] (
  [id] INTEGER NOT NULL,
  [generation] INTEGER NOT NULL,
  [legacy_archive] TEXT NULL,
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
