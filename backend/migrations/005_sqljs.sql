ALTER TABLE [kp_project_milestones] ADD COLUMN [start_date] TEXT;
ALTER TABLE [kp_project_milestones] ADD COLUMN [end_date] TEXT;
ALTER TABLE [kp_project_milestones] ADD COLUMN [bar_color] TEXT NOT NULL DEFAULT 'red' CHECK ([bar_color] IN ('blue','green','amber','red','purple','gray'));
ALTER TABLE [kp_project_milestones] ADD COLUMN [bar_style] TEXT NOT NULL DEFAULT 'solid' CHECK ([bar_style] IN ('solid','striped','outline'));

UPDATE [kp_project_milestones]
SET [start_date]=[start_month] || '-01',
    [end_date]=date([end_month] || '-01','+1 month','-1 day');

INSERT INTO [kp_schema_migrations]([version]) VALUES(5);
