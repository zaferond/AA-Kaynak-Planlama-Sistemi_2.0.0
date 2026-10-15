ALTER TABLE [dbo].[kp_project_milestones] ADD [start_date] varchar(10) COLLATE Latin1_General_100_BIN2 NULL;
ALTER TABLE [dbo].[kp_project_milestones] ADD [end_date] varchar(10) COLLATE Latin1_General_100_BIN2 NULL;
ALTER TABLE [dbo].[kp_project_milestones] ADD [bar_color] varchar(20) NOT NULL CONSTRAINT [DF_kp_project_milestones_bar_color] DEFAULT 'red';
ALTER TABLE [dbo].[kp_project_milestones] ADD [bar_style] varchar(20) NOT NULL CONSTRAINT [DF_kp_project_milestones_bar_style] DEFAULT 'solid';

GO

UPDATE [dbo].[kp_project_milestones]
SET [start_date]=[start_month] + '-01',
    [end_date]=CONVERT(varchar(10),EOMONTH(CONVERT(date,[end_month] + '-01')),23);

GO

ALTER TABLE [dbo].[kp_project_milestones] ALTER COLUMN [start_date] varchar(10) COLLATE Latin1_General_100_BIN2 NOT NULL;
ALTER TABLE [dbo].[kp_project_milestones] ALTER COLUMN [end_date] varchar(10) COLLATE Latin1_General_100_BIN2 NOT NULL;
ALTER TABLE [dbo].[kp_project_milestones] ADD CONSTRAINT [CK_kp_project_milestones_date_order] CHECK ([start_date]<=[end_date]);
ALTER TABLE [dbo].[kp_project_milestones] ADD CONSTRAINT [CK_kp_project_milestones_bar_color] CHECK ([bar_color] IN ('blue','green','amber','red','purple','gray'));
ALTER TABLE [dbo].[kp_project_milestones] ADD CONSTRAINT [CK_kp_project_milestones_bar_style] CHECK ([bar_style] IN ('solid','striped','outline'));

INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(5);
