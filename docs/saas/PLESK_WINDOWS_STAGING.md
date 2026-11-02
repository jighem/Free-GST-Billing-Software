# M1 staging plan — existing Windows Plesk host (not a deployment authorization)

## Current decision
Keep production `invoices.udaanhost.com` unchanged. Stage on the same **Windows server** but in separate disk paths, processes, IIS website/application pool and PostgreSQL database, with no shared secrets, service names, data directories or scheduled tasks. **Do not repoint the production domain, replace production `dist`, change production Node settings or migrate any production JSON files.**

Plesk for Windows supports connecting to **remote** PostgreSQL servers through Plesk, but does **not** manage a local PostgreSQL server through Plesk. A standalone localhost-only PostgreSQL service installed directly on Windows therefore has separate lifecycle, update, backup and security management. Do not assume it appears in Plesk Databases.

## Stage 0: read-only preflight
Run `scripts/plesk/GST-SaaS-StagingPreflight.ps1` in PowerShell on the intended Windows server. Review its report for the OS, Node version, port 5432/4100 conflicts, existing Node processes, disks and PostgreSQL services. This script is read-only; it does not create `D:\Extractlog` if absent.

## Stage 1: isolated PostgreSQL (explicit administrator approval required)
- Before installation, take a verified machine/system backup, record existing IIS/Plesk bindings and determine available RAM/disk. Installing new software on the production host still carries operational risk.
- If no supported PostgreSQL is already present, install a standalone supported PostgreSQL 16+ Windows package as a separate Windows service under a non-admin service account. Never overwrite/replace Plesk MariaDB or Microsoft SQL.
- Listen on **127.0.0.1 only** for IPv4; no public TCP 5432 firewall allowance. Configure `pg_hba.conf` to require SCRAM-SHA-256 for local TCP clients, keep a dedicated data path outside `D:\HostingSpaces` production application directories, and configure secure local backups.
- Create a dedicated empty database `gst_saas_dev` with a separate migration owner, tenant runtime role `gst_app`, and identity runtime role `gst_auth`. Use unique generated passwords in Windows secret management; do not paste real credentials into GitHub or chat logs.
- Apply `db/migrations/0001_saas_foundation.sql` and `0002_identity_sessions.sql` as migration owner. Apply the minimum grants and policies in `db/roles/README.md`.
- All SQL migrations must run first on a disposable CI or local database; inspect PostgreSQL service health and backup/restore before applying them to persistent staging.

## Stage 2: isolated Node API (after successful DB tests)
- Check out `feat/m1-saas-foundation` into a **new** staging folder; never perform `git pull`, `npm install` or `npm run build` in the production website folder.
- Install API dependencies in `apps/api`; commit `package-lock.json` and use `npm ci` thereafter. Provide runtime variables through a staging-only secure configuration mechanism; the sample .env is not automatically loaded by NestJS.
- Run the API at `127.0.0.1:4100` under a separate low-privilege Windows service account. Prevent public routing until auth rate limiting, security review, tenant A/B tests and an HTTPS reverse-proxy design are approved.
- Reserve a *new* staging IIS binding / DNS name only after verification; do not reuse or modify the production domain or site/application pool.

## Validation gate
1. GitHub CI: root lint, GST unit tests and Vite build; API typecheck/build; two-tenant PostgreSQL smoke test.
2. API integration: invalid passwords/tokens, membership revoked, tenant suspended, expired sessions and tenant A/B cross-access.
3. Database access: verify `gst_auth` has no business-data grants; `gst_app` has no identity-table grants; neither is SUPERUSER/BYPASSRLS/table owner.
4. Confirm no route crosses from the old Express JSON backend into the new API. No user data is moved until reconciled migration and approval.
5. Capture staging backup and rollback procedure; review physical server utilization impacts.

## Operational caveat
A separate database on the *same* physical server protects against logical tenant mix-ups but does **not** isolate disk, CPU, memory, operating system or availability risk. If stability concerns emerge during preflight, migrate staging to a separate host before installing a database engine.
