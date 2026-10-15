ALTER TABLE [kp_projects] ADD COLUMN [sort_order] INTEGER CHECK ([sort_order] IS NULL OR [sort_order] BETWEEN 0 AND 1000000000);
INSERT INTO [kp_schema_migrations]([version]) VALUES(30);
