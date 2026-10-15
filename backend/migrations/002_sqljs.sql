CREATE TABLE [kp_person_allocations] (
  [resource_id] TEXT NOT NULL CHECK(length([resource_id])<=120),
  [project_id] TEXT NOT NULL CHECK(length([project_id])<=120),
  [month] TEXT NOT NULL CHECK(length([month])<=7),
  [amount] REAL NOT NULL CHECK([amount]>=0 AND [amount]<=100),
  PRIMARY KEY ([resource_id],[project_id],[month]),
  FOREIGN KEY ([resource_id]) REFERENCES [kp_resources]([id]) ON DELETE CASCADE,
  FOREIGN KEY ([project_id]) REFERENCES [kp_projects]([id]) ON DELETE CASCADE,
  CHECK (([month] GLOB '20[0-9][0-9]-[0-1][0-9]' OR [month] GLOB '21[0-9][0-9]-[0-1][0-9]') AND SUBSTRING([month],6,2) BETWEEN '01' AND '12')
);

CREATE INDEX kp_person_alloc_project_month_idx ON kp_person_allocations(project_id,month);

DELETE FROM kp_revisions WHERE kind='allocation';

INSERT INTO kp_schema_migrations(version) VALUES(2);
