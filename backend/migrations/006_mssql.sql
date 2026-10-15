ALTER TABLE [dbo].[kp_resource_versions] ADD [start_date] varchar(10) COLLATE Latin1_General_100_BIN2 NULL;
ALTER TABLE [dbo].[kp_resource_versions] ADD [end_date] varchar(10) COLLATE Latin1_General_100_BIN2 NULL;

GO

UPDATE [dbo].[kp_resource_versions]
SET [start_date]=CASE WHEN [start_month] IS NULL THEN NULL ELSE [start_month] + '-01' END,
    [end_date]=CASE WHEN [end_month] IS NULL THEN NULL ELSE CONVERT(varchar(10),EOMONTH(CONVERT(date,[end_month] + '-01')),23) END;

ALTER TABLE [dbo].[kp_resource_versions] ADD CONSTRAINT [CK_kp_resource_versions_date_order] CHECK ([start_date] IS NULL OR [end_date] IS NULL OR [start_date]<=[end_date]);

INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(6);
