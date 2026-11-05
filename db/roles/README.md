# AnytimeGST — least-privilege PostgreSQL roles

Use separate credentials for `AUTH_DATABASE_URL` (`gst_auth`) and `DATABASE_URL` (`gst_app`). Neither runtime role may own tables, be a superuser, or have BYPASSRLS. Keep migration credentials outside the running application and GitHub.

Apply migrations in order through `0009_auth_policy_reconciliation.sql`. Migration 0009 supersedes the **obsolete unrestricted** `identity_memberships_read` and `identity_tenants_read` policies (`USING (true)`). **Never recreate those policies.** The old guidance has been removed because permissive policies are OR-combined in PostgreSQL and would expose other users' membership metadata once SELECT was granted.

The restricted `gst_auth` role receives column-level access solely for password verification, hashed sessions and workspace membership lookup. Membership queries run in a transaction with a verified `app.auth_user_id` and the `auth_user_memberships_read` / `auth_user_tenants_read` RLS policies. Tenant business queries use `gst_app`, FORCE RLS, and a transaction-scoped `app.tenant_id`; every route must first authenticate the session and authorize tenant membership and company access.

## Required validation

- No user context: `gst_auth` reads zero memberships and tenants.
- Two isolated users: each sees only their own membership and tenant.
- No `identity_*_read` policies with `USING (true)`.
- Missing, invalid and expired bearer tokens fail; login and company access tested through the running NestJS API.
- Business table reads use minimum column grants and tenant/company filters.
- No live customer, GST or invoice data until integration, rate limiting, account recovery, session revocation and security review pass.

Custom `app.auth_user_id` and `app.tenant_id` settings are not protected against arbitrary SQL under a compromised runtime role. Never expose arbitrary SQL execution, and test the database with restricted roles rather than a migration owner.
