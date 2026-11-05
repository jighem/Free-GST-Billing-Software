-- AnytimeGST: reconcile authentication privilege and per-user RLS policies.
-- Applied manually to staging on 2026-11-02; keep in source for reproducible installs.
-- Requires migrations 0001-0008. Run as migration owner, never as gst_auth.
BEGIN;
DROP POLICY IF EXISTS identity_memberships_read ON public.tenant_memberships;
DROP POLICY IF EXISTS identity_tenants_read ON public.tenants;
GRANT USAGE ON SCHEMA public TO gst_auth;
GRANT SELECT (id, email, password_hash) ON public.users TO gst_auth;
GRANT SELECT (user_id, token_hash, expires_at),
      INSERT (user_id, token_hash, expires_at) ON public.user_sessions TO gst_auth;
GRANT SELECT (tenant_id, user_id, role) ON public.tenant_memberships TO gst_auth;
GRANT SELECT (id, display_name, status) ON public.tenants TO gst_auth;
COMMIT;
