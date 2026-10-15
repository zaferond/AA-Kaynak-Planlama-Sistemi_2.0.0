ALTER TABLE [kp_resource_versions] ADD COLUMN [start_date] TEXT NULL;
ALTER TABLE [kp_resource_versions] ADD COLUMN [end_date] TEXT NULL;

UPDATE [kp_resource_versions]
SET [start_date]=CASE WHEN [start_month] IS NULL THEN NULL ELSE [start_month] || '-01' END,
    [end_date]=CASE WHEN [end_month] IS NULL THEN NULL ELSE date([end_month] || '-01','+1 month','-1 day') END;

INSERT INTO [kp_schema_migrations]([version]) VALUES(6);
