# Linux-first hosted GST SaaS — adopted architecture

Status: target architecture and implementation backlog; not a deployment approval.

## Product experience
Customers access our hosted React application from a browser. They sign up with an email address, verify email, create a workspace/tenant and register one or more companies (including GSTIN and state). Each company may have separate invoice numbering, branding, customers, products and permitted users. They select and subscribe to a plan. No user needs to install software.

## Architecture
- Linux server (Ubuntu LTS or equivalent maintained distribution); reverse proxy (Nginx) with HTTPS and separate frontend/API services.
- React/Vite frontend; NestJS REST /api/v1 backend; PostgreSQL shared database with tenant_id and FORCE RLS; separate least-privilege identity and tenant database roles.
- Background workers and Redis queues only when required; S3-compatible object storage for PDFs, logos, exports and backups (separate environment and scoped keys).
- API-first connectors to customer CRM/accounting applications with hashed scoped API keys, signed webhooks, idempotency, retries and audit records.
- Dedicated nonproduction Linux staging environment, separate credentials, data and DNS from live Windows/Plesk installation.
- No production DNS changes or release without testing and approval.

## Registration and activation contract
1. Register email and password; email verification required before business-data access. Protect with strong password policy, throttling and bot-abuse controls. Never reveal whether a user exists.
2. A trusted backend transaction creates a tenant, owner membership and first company; validate normalized unique GSTIN per tenant and company identification.
3. Tenant begins in pending_activation until a validated subscription/trial entitlement is recorded.
4. Subscriptions are determined server-side. The payment gateway's signed webhook is verified, de-duplicated and reconciled to the provider's API before entitlement is activated. Never trust browser success redirects.
5. Every API request must authenticate a real membership, resolve tenant context from authorized membership, check tenant status and plan entitlements, then execute business SQL with transaction-local app.tenant_id.
6. Expired/cancelled subscription: preserve historical invoices and allow limited read/export according to documented retention rules. Do not destroy tenant data automatically.
7. Never let a registration request specify plan price, role, tenant UUID, payment status or granted limits.

## Modules and phases
- M1 foundation: CI, PostgreSQL tenant isolation, authentication hardening and registration lifecycle.
- M2 tenant onboarding: email verification, workspace creation, company registration, user invitations and RBAC.
- M3 subscription management: plans/features/limits, checkout, billing provider webhook, idempotency, renewal and cancellation.
- M4 first business workflows: customers, invoice drafts, invoice issue/numbering, PDF, GST calculations; adapt existing React screens progressively.
- M5 reports/returns, purchases/inventory, API integrations, exports and migration tools.
- M6 Linux staging hardening and production release, disaster recovery and monitoring.

## Deployment boundary
Windows/Plesk preparation documents in earlier commits are **superseded and must not be executed for this project**. The existing working production application stays untouched as a separate legacy installation. Linux deployment artifacts must remain nonproduction until approval.
