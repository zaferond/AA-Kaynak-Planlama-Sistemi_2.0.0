CREATE TABLE kp_rate_limits (
  bucket_hash varchar(64) PRIMARY KEY,
  window_id varchar(36) NOT NULL,
  attempts int NOT NULL CHECK(attempts>=0),
  expires_at bigint NOT NULL CHECK(expires_at>0)
);
CREATE INDEX idx_kp_rate_limits_expiry ON kp_rate_limits(expires_at);
INSERT INTO kp_schema_migrations(version) VALUES(29);
