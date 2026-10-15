-- Existing catalogs start with no parent links.
ALTER TABLE [kp_settings] ADD COLUMN [leader_parents] TEXT NOT NULL DEFAULT '{}' CHECK(json_valid([leader_parents]));
ALTER TABLE [kp_settings] ADD COLUMN [leadership_units] TEXT NOT NULL DEFAULT '{}' CHECK(json_valid([leadership_units]));
INSERT INTO [kp_schema_migrations]([version]) VALUES(33);
