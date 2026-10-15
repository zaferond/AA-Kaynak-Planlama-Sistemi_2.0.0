ALTER TABLE kp_resource_versions ADD COLUMN assignment_role TEXT NULL CHECK (assignment_role IS NULL OR assignment_role IN ('leader','productOwner','member'));
INSERT INTO kp_schema_migrations(version) VALUES(34);
