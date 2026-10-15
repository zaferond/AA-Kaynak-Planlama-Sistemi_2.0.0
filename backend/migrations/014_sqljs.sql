-- Extend resource status without discarding existing dated versions.
CREATE TABLE [kp_resource_versions_next] (
  [resource_id] TEXT NOT NULL CHECK(length([resource_id])<=120),
  [effective_month] TEXT NOT NULL CHECK(length([effective_month])<=7),
  [team_id] TEXT NULL CHECK(length([team_id])<=120),
  [leader_name] TEXT NULL CHECK(length([leader_name])<=200),
  [status] TEXT NOT NULL CHECK(length([status])<=50),
  [included] INTEGER NOT NULL CHECK([included] IN (0,1)),
  [start_month] TEXT NULL CHECK(length([start_month])<=7),
  [end_month] TEXT NULL CHECK(length([end_month])<=7),
  [amount] REAL NOT NULL,
  [start_date] TEXT NULL,
  [end_date] TEXT NULL,
  PRIMARY KEY ([resource_id],[effective_month]),
  FOREIGN KEY ([resource_id]) REFERENCES [kp_resources]([id]) ON DELETE CASCADE,
  FOREIGN KEY ([team_id]) REFERENCES [kp_teams]([id]),
  FOREIGN KEY ([leader_name]) REFERENCES [kp_leaders]([name]),
  CHECK ([status] IN ('Aktif Çalışan','SAAT Ücretli Ofis Ç.','Gear Up','Aktif İlan','Pasif İlan','İşten Ayrıldı')),
  CHECK ([amount]>=0 AND [amount]<=100),
  CHECK (NOT([included]=1 AND [status]='Aktif İlan') OR [start_month] IS NOT NULL),
  CHECK ([start_month] IS NULL OR [end_month] IS NULL OR [start_month]<=[end_month]),
  CHECK ([effective_month] IS NULL OR (([effective_month] GLOB '20[0-9][0-9]-[0-1][0-9]' OR [effective_month] GLOB '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([effective_month],6,2) BETWEEN '01' AND '12')),
  CHECK ([start_month] IS NULL OR (([start_month] GLOB '20[0-9][0-9]-[0-1][0-9]' OR [start_month] GLOB '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([start_month],6,2) BETWEEN '01' AND '12')),
  CHECK ([end_month] IS NULL OR (([end_month] GLOB '20[0-9][0-9]-[0-1][0-9]' OR [end_month] GLOB '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([end_month],6,2) BETWEEN '01' AND '12'))
);
INSERT INTO [kp_resource_versions_next]
 ([resource_id],[effective_month],[team_id],[leader_name],[status],[included],[start_month],[end_month],[amount],[start_date],[end_date])
SELECT [resource_id],[effective_month],[team_id],[leader_name],[status],[included],[start_month],[end_month],[amount],[start_date],[end_date]
FROM [kp_resource_versions];
DROP TABLE [kp_resource_versions];
ALTER TABLE [kp_resource_versions_next] RENAME TO [kp_resource_versions];
CREATE INDEX [kp_versions_team_month_idx] ON [kp_resource_versions]([team_id],[effective_month]);
INSERT INTO [kp_schema_migrations]([version]) VALUES(14);
