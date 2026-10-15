DECLARE @bar_text_default sysname, @bar_text_definition nvarchar(max), @bar_text_sql nvarchar(max);
SELECT @bar_text_default=[name], @bar_text_definition=[definition]
FROM sys.default_constraints
WHERE [parent_object_id]=OBJECT_ID(N'dbo.kp_project_milestones')
  AND [parent_column_id]=COLUMNPROPERTY(OBJECT_ID(N'dbo.kp_project_milestones'),N'bar_text',N'ColumnId');
IF @bar_text_default IS NOT NULL
BEGIN
  SET @bar_text_sql=N'ALTER TABLE [dbo].[kp_project_milestones] DROP CONSTRAINT '+QUOTENAME(@bar_text_default);
  EXEC(@bar_text_sql);
END;
ALTER TABLE [dbo].[kp_project_milestones] ALTER COLUMN [bar_text] nvarchar(max) NOT NULL;
IF @bar_text_default IS NOT NULL
BEGIN
  SET @bar_text_sql=N'ALTER TABLE [dbo].[kp_project_milestones] ADD CONSTRAINT '+QUOTENAME(@bar_text_default)+N' DEFAULT '+@bar_text_definition+N' FOR [bar_text];';
  EXEC(@bar_text_sql);
END;
INSERT INTO [dbo].[kp_schema_migrations]([version]) VALUES(19);
