-- M2 staging: least-privilege authentication and per-user workspace visibility.
-- Apply only after 0001..0006, with an audited migration-owner/admin role.
-- Role gst_auth must pre-exist, be NOSUPERUSER NOBYPASSRLS, and must not own the tables.
BEGIN;

GRANT USAGE ON SCHEMA public TO gst_auth;
-- Limit auth to only identity data used by the login/session code.
GRANT SELECT (id, email, password_hash) ON users TO gst_auth;
GRANT SELECT (user_id, token_hash, expires_at) ON user_sessions TO gst_auth;
GRANT INSERT (user_id, token_hash, expires_at) ON user_sessions TO gst_auth;

-- Membership SELECT is allowed only inside a trusted transaction with a verified
-- authenticated user ID supplied by the backend, not an arbitrary browser header.
GRANT SELECT (tenant_id, user_id, role) ON tenant_memberships TO gst_auth;
GRANT SELECT (id, display_name, status) ON tenants TO gst_auth;

DROP POLICY IF EXISTS auth_user_memberships_read ON tenant_memberships;
CREATE POLICY auth_user_memberships_read ON tenant_memberships
  FOR SELECT TO gst_auth
  USING (
    user_id = NULLIF(current_setting('app.auth_user_id', true), '')::uuid
  );

DROP POLICY IF EXISTS auth_user_tenants_read ON tenants;
CREATE POLICY auth_user_tenants_read ON tenants
  FOR SELECT TO gst_auth
  USING (
    EXISTS (
      SELECT 1 FROM tenant_memberships AS membership
      WHERE membership.tenant_id = tenants.id
        AND membership.user_id = NULLIF(current_setting('app.auth_user_id', true), '')::uuid
    )
  );

-- Retain FORCE RLS. These supplementary PERMISSIVE read policies do not grant
-- access to any tenant by default: a verified per-transaction user context is required.
-- Never enable these for gst_app or gst_registration.
COMMIT;
