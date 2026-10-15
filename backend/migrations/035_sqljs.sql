ALTER TABLE kp_projects ADD COLUMN project_code TEXT NULL CHECK (project_code IS NULL OR length(project_code)<=100);
INSERT INTO kp_schema_migrations(version) VALUES(35);
