# M1b — isolated NestJS prototype (not production-ready)

Legacy React/Vite, Express and file storage remain unchanged. This service listens on loopback only.

## Preparation
1. Create a NEW isolated PostgreSQL 15+ development database. Run `db/migrations/0001_saas_foundation.sql` and then `0002_identity_sessions.sql` as a migration-owner role.
2. Create restricted `gst_auth` and `gst_app` login roles and apply `db/roles/README.md`. Store their connection strings in environment variables `AUTH_DATABASE_URL` and `DATABASE_URL` (do not commit secrets).
3. Provision a development test tenant, user, active membership and sample company as migration owner. The `users.email` must be stored lowercase and `users.password_hash` is in `scrypt$<salt>$<hash>` format. There is intentionally no public registration endpoint yet.
4. Install dependencies from this directory (`npm install`), generate and commit a lockfile, then `npm run typecheck && npm run build`. Run with `npm run dev`.
5. Use `POST /api/v1/auth/login` with JSON email/password; send `Authorization: Bearer <token>` to `GET /api/v1/auth/tenants` and `GET /api/v1/tenants/:tenantId/companies`.

## Isolation checks before approval
- Cross-tenant company query should be 403 for a nonmember.
- As gst_app, a transaction with tenant A context must not read tenant B companies; missing tenant context returns no rows.
- Changing active membership to removed, or status to suspended, must immediately deny access.
- Pool connection reuse must not leak tenant context between transactions.
- Wrong password, invalid bearer token and expired token must reject.
- Untrusted company/customer/invoice foreign keys from another tenant must fail.

## Still required
- Reproducible lockfile and CI checks, tested database migration, tenant A/B integration tests, rate limiting, MFA, reset/revocation, account provisioning and audit logging.
- Never deploy publicly or merge without security review and testing.
