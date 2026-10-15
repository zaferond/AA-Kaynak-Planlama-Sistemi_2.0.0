-- Stable directory identity; legacy accounts remain local and keep their credentials.
ALTER TABLE [kp_users] ADD COLUMN [directory_id] TEXT NULL CHECK([directory_id] IS NULL OR length([directory_id])=32);
ALTER TABLE [kp_users] ADD COLUMN [email] TEXT NOT NULL DEFAULT '' CHECK(length([email])<=320);
ALTER TABLE [kp_users] ADD COLUMN [auth_source] TEXT NOT NULL DEFAULT 'local' CHECK([auth_source] IN ('local','ldap')) CHECK(([auth_source]='local' AND [directory_id] IS NULL) OR ([auth_source]='ldap' AND [directory_id] IS NOT NULL));
CREATE UNIQUE INDEX [ux_kp_users_directory_id] ON [kp_users]([directory_id]) WHERE [directory_id] IS NOT NULL;
INSERT INTO [kp_schema_migrations]([version]) VALUES(32);
