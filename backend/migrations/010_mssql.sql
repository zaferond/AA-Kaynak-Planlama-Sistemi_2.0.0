ALTER TABLE [dbo].[kp_project_milestones] ADD [bar_text] nvarchar(200) NOT NULL CONSTRAINT [DF_kp_project_milestones_bar_text] DEFAULT N'';
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(10);
