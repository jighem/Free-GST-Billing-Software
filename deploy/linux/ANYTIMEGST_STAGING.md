# AnytimeGST — isolated staging deployment

New staging hosts (same Plesk server):
- Frontend: https://staging.anytimegst.com
- Backend: https://staging-api.anytimegst.com

Previous gst-dev.udaanhost.com / gst-api-dev.udaanhost.com may remain as rollback endpoints. Do not alter invoices.udaanhost.com.

## Portal build change

M2 portal is built from apps/portal with:
```
VITE_API_BASE_URL=https://staging-api.anytimegst.com/api/v1
```
Its HTML CSP now permits this API hostname, rather than the old gst-api-dev host. Vite bakes the API URL into the compiled JS. **Copying the old compiled frontend ZIP to the new domain will keep the old API origin**. Use the latest CI `gst-saas-portal-staging` artifact from a successful workflow run after this change, or rebuild from GitHub checkout. Frontend deployment is static files only; no Node app in Plesk document root.

## Backend API

Keep the existing private listener on 127.0.0.1:14100. Configure the **new** Plesk HTTPS API domain (not the old domain) to proxy only /api/v1/ to that listener. Preserve Plesk-generated root location and ACME challenge locations; never edit generated nginx.conf directly. Existing Plesk Nginx custom configuration must be inspected before applying changes.

The running candidate `gst-saas-dev-api-v2` currently uses:
```
CORS_ORIGINS=https://gst-dev.udaanhost.com
ENABLE_REGISTRATION=0
```
To allow the new frontend, replace the candidate container with a reviewed deployment that sets CORS_ORIGINS=https://staging.anytimegst.com; do not assume environment variable changes affect running containers. For a temporary dual-origin switch, use a comma-separated allowed origin list explicitly. Container replacement must retain `--network gst-saas-dev`, `-p 127.0.0.1:14100:4100`, `--read-only`, dropped capabilities, non-root-supplied database role URLs, and registration disabled. Back up the current container configuration before replacing anything. Verify preflight using the new Origin.

## Auth permissions blocker — do not create login users yet

Operator's read-only `has_table_privilege` check returned **false for all five**:
```
gst_auth: SELECT users, INSERT/SELECT user_sessions,
          SELECT tenant_memberships, SELECT tenants
```

This is an expected blocker for real login, not a CORS issue. Table GRANT alone will not automatically make tenant membership joins work because tenancy tables use FORCE RLS, and the identity service currently does not set RLS tenant/user scope for membership lookup.

Security design task before staging sign-in:
1. Grant **only required columns/commands** for users and user_sessions to gst_auth, review USAGE schema privilege.
2. Implement a restricted, parameterized authenticated-membership DB read path with appropriate RLS policy scoped to the verified authenticated user (or a tightly audited SECURITY DEFINER function), not blanket cross-tenant table policies.
3. Add integration tests: known user login/session, permitted tenant membership, different user's forbidden tenant/company, absent/expired bearer rejection, no raw password or token logs.
4. Provision two isolated synthetic users/tenants only after permissions and policies pass.

Never set gst_auth superuser/BYPASSRLS or disable FORCE RLS to make login work. Do not run production seed scripts on this database.

## Deployment validation order

1. Verify new Plesk DNS+TLS domains and empty/new document roots.
2. Deploy new portal artifact to a **dedicated** frontend public folder; verify HTTP 200 plus absence of legacy desktop service worker.
3. Configure new API host with HTTPS -> 127.0.0.1:14100 reverse proxy and test health.
4. Replace API candidate only when ready to set new CORS origins; verify OPTIONS /api/v1/auth/login from staging.anytimegst.com and invalid login HTTP 401.
5. Complete auth-role DB work; run two-tenant negative security integration before seeded sign-in.
6. Keep ENABLE_REGISTRATION=0 until SMTP mail relay and anti-abuse tests have passed.
