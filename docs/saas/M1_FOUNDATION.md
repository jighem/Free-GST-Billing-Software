# M1 — SaaS Foundation (draft PR, not production-ready)

## Verified baseline (fork main @ 316797ccb2adf8a527cfaa60f0a0e185019ae9db)
- Frontend: React 19, Vite 7, src/App.jsx, src/components/*, src/store.js.
- Legacy runtime: Express 5 server.js, localhost-only CORS and listener, JSON files under data/*.
- Existing modules include GST invoicing, customers, products, purchases, reporting, returns, TDS/TCS, inventory, backups, and offline PWA.
- Existing build/test/release scripts stay unchanged; Plesk site's deployed dist and server processes must remain untouched.
- Never expose the original Express /api routes on a public multi-user server. Its PIN is not SaaS authorization.

## Target topology
Existing React/Vite UI -> future authenticated API client -> NestJS /api/v1 -> PostgreSQL.
Add NestJS in apps/api as a separate process. M1 does NOT proxy legacy routes and does NOT switch frontend traffic.
Shared PostgreSQL database, tenant_id on each tenant-owned business row, composite tenant-bound foreign keys, and PostgreSQL FORCE RLS.
Redis/BullMQ, object storage, webhooks and integrations are later work; all must propagate authorized tenant identity.

## Module boundaries
- platform: configuration, health/readiness, tracing, background job infrastructure
- identity: authentication, user lifecycle, sessions, API credentials, authorization and membership
- tenancy: tenant provisioning, companies/businesses, tenant memberships and RLS context
- master-data: customers, products, tax codes, numbering policies
- invoicing: invoice aggregates, lines, payment state, credit/debit notes, PDF document versioning
- gst-compliance: GST calculations, GSTIN validation, GSTR exports, e-invoice/e-way integration
- accounting: receipts, expenses, purchase bills, stock and TDS/TCS
- integrations: scoped keys/OAuth, signed webhooks, idempotency and external CRM/accounting connectors
- reporting: tenant-filtered reports, exports and audit trails
- billing: subscription plans, metering and limits (not tax invoices)

## Isolation contract / fail-closed requirements
1. Authenticate first; resolve requested tenant only from verified membership or authorized scoped API key. Never trust a raw X-Tenant-ID header.
2. All tenant resource reads/writes run inside a transaction with SET LOCAL app.tenant_id bound to the verified UUID.
3. Use a non-owner, NOBYPASSRLS runtime database role; verify FORCE RLS with both tenants and no-context queries.
4. Composite (tenant_id, id) foreign keys prevent cross-tenant references even where a policy is missing.
5. APIs, cache keys, file paths, object keys, export jobs, queue payloads, idempotency keys, rate limits and webhook deliveries must all be tenant scoped.
6. Platform users and authentication data are internal to identity; they are not exposed as tenant resources.

## Change plan, phased
- M1a (this PR): repository reconnaissance, standalone NestJS liveness API, SQL schema/RLS draft, isolated environment example, deployment and security constraints. No database connection, authentication or business endpoints yet.
- M1b: dedicated dev Postgres, migration executor, runtime grants, auth/session, tenant membership authorization, transaction-bound tenant context and two-tenant RLS negative tests.
- M1c: first REST /api/v1 vertical slice: tenant/company -> customer -> draft invoice -> GET invoice, OpenAPI, validation, scoped auth and idempotency.
- M2: feature flag migration of one UI module at a time and data import with checksums, dry run, rollback and accounting reconciliation. Keep legacy untouched until parity tests pass.

## Verification before review/merge
- Root npm ci; npm run lint; npm run test:unit; npm run build.
- cd apps/api && npm install && npm run typecheck && npm run build (separate lockfile to be generated and committed after install).
- On isolated dev DB only: apply migration, explicitly verify RLS as gst_app for tenant A, B, missing context, cross-tenant INSERT and cross-tenant FK.
- Verify new GET /api/v1/health returns process liveness. Swagger at /api/docs is development-only.
- Smoke-test legacy invoices, GST returns, reports, CSV/PDF, backup/restore, and Plesk URL independently. Approval required for any deployment.

## Important security limitation
This PR intentionally exposes NO tenant business endpoint. RLS schema does not by itself create secure tenancy; production use must wait for identity, runtime grants and tenant-bound transaction access. API binds to 127.0.0.1 and no existing application routes were changed.
