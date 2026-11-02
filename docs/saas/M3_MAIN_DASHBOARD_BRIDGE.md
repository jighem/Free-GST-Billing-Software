# Anytime GST — from onboarding into the forked billing dashboard

**Brand:** Anytime GST  
**Tagline:** Your GST. Anytime. Anywhere.

## Current implementation boundary

The original fork is preserved under `src/App.jsx`, `src/components/Dashboard.jsx` and the other billing components. Its user experience, menu labels and modular organization inform the new authenticated dashboard. The legacy `src/store.js` uses a file-based Express `/api/*` backend. It is **not safe to enable in a shared SaaS** and has not been exposed.

M3 bridge adds `apps/portal/src/BillingWorkspace.jsx` containing the fork's dashboard/sidebar menu organization and real read-only tenant-scoped counts, plus the existing company profile. It does **not** claim invoice creation, customers, products, PDF, or reports are available: those menu buttons are disabled until their per-tenant data migration completes.

## User journey

- Unregistered user: registration (still feature-gated), email verification (via reviewed MailEnable worker), login.
- Single-tenant user: after login, workspace is selected automatically. Multi-tenant users select workspace.
- First-time owner/admin whose sole company is incomplete: company setup form.
- After saving company details: navigate immediately into Anytime GST business dashboard.
- Returning user with completed company: open dashboard immediately after login.
- Each dashboard request is authorized by bearer session + tenant membership + scoped company ownership and PostgreSQL FORCE RLS.

## API and DB

- `GET /api/v1/tenants/:tenantId/companies/:companyId/dashboard`
  - Returns authorized company name and real company-scoped counts of customers, invoices, draft and issued invoices.
  - Does not return financial data from other tenants.
- `db/migrations/0009_dashboard_read_permissions.sql`: narrow read grants to runtime `gst_app` on `customers` and `invoices`. Apply after 0008, to `gst_saas_dev` only.
- `db/tests/ci_dashboard_rls.sql`: two-tenant negative RLS checks.

## Stage/release without disturbing current working site

1. Require successful GitHub Actions checks for API/DB, portal build and legacy regression on the exact branch head.
2. Take separate `gst_saas_dev` backup, then apply migration 0009. Never run migrations on the host's PostgreSQL 10 or other websites.
3. Build new `gst-saas-api:m3-dashboard` from the checked-out source, start on loopback-only port 14104 alongside existing 14103.
4. Verify health, unauthenticated dashboard HTTP 401, authenticated two-tenant dashboard metrics, and negative tenant ID tests before switching Plesk API reverse proxy from 14103 to 14104.
5. Build `apps/portal` using `VITE_API_BASE_URL=https://staging-api.anytimegst.com/api/v1` and **no** public signup flag. Deploy to a new versioned frontend folder `portal-m3` and point Plesk frontend document root there only after testing.
6. Verify Test A and Test B company dashboard isolation through their own accounts and confirm inactive billing menu entries cannot execute legacy requests.
7. Rollback by restoring the previous Plesk proxy port and frontend document root. Keep older API container and release files until validation is done.

**Public signup remains disabled** until MailEnable SMTP delivery, rate limits, mail worker, verification token replay and expiry checks are complete. No payment or real GST/financial data in staging.

## Future migration of the original functional dashboard

Migrate original `src/store.js` legacy file APIs as tenant-aware NestJS endpoints behind the authenticated portal. Reuse the existing invoice/customer/product components and print templates after replacing legacy storage imports with reviewed adapters and end-to-end tenant isolation tests. Do not publicly serve the original `server.js`, use JSON files shared between tenants, or grant `BYPASSRLS`.
