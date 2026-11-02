-- M2: registration anti-abuse and tenant provisioning state. Dev/test only.
BEGIN;
CREATE TABLE registration_rate_limits (
  key_hash char(64) PRIMARY KEY,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);
-- This table stores HMAC digests; never store raw emails or IPs in it.
CREATE INDEX registration_rate_limits_window_idx ON registration_rate_limits (window_start);
ALTER TABLE registration_requests ADD COLUMN dispatched_at timestamptz;
COMMIT;
