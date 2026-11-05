-- M3 session lifecycle: revoke only the current validated bearer session.
-- The auth role is distinct from the tenant-data role. The controller
-- authenticates the token first and deletes only the matching SHA-256 digest.
BEGIN;
GRANT DELETE ON user_sessions TO gst_auth;
COMMIT;
