# Anytime GST — original fork integration (in progress)

**Brand:** Anytime GST — **Your GST. Anytime. Anywhere.**

## Non-negotiable implementation choice

The fork's **original `src/App.jsx`**, dashboard, invoicing, clients, inventory, reports, and printable invoice components are the user-facing application. The separately implemented `apps/portal/src/BillingWorkspace.jsx` is an interim screen, **not** the final billing UI. Do not re-create individual GST screens unnecessarily.

## Initial original-fork integration committed

- `src/saas-main.jsx` and `src/saas-index.html`: isolated SaaS entry that imports **the original `src/App.jsx`** via `src/saas/SaasGate.jsx`.
- The gate reads the existing staging tab login, validates active membership using NestJS `GET /auth/tenants`, loads companies using `GET /tenants/:tenantId/companies`, and requires completed onboarding. The selected, server-authorized company ID is passed to the adapter before mounting `App`.
- `src/store.js`: **the same original store functions**, with opt-in `VITE_ANYTIME_SAAS_MODE=true` routing to `src/saas/storeAdapter.js`. Customer and product GET/POST/DELETE translate to existing tenant/company-scoped NestJS APIs. Original desktop mode remains on its existing API untouched.
- Original business profile GET and profiles GET are mapped to company onboarding data; the original `App.jsx` health/profile bootstrap obtains the authenticated company profile in SaaS mode. No new visual dashboard has been authored.
- Unsupported original legacy endpoints (invoices, backup/restore, imports, privileged update operations, stock adjustment, reports, etc.) **throw explicitly**. They never fall back to unscoped JSON-file storage in SaaS mode.
- Build the original fork SaaS variant with `npm run build:saas` from repository root; Vite produces `dist-saas`, separate from the original desktop `dist`. Intended same-origin path `/billing/`. This preview **must not yet be publicly deployed**.
- `tests/saas-adapter.test.mjs` and CI test original API translation, profile compatibility, and fail-closed unmigrated operations. Original root build and tests remain in CI.

## Remaining blockers before turning on original application

The fork's `src/App.jsx` and its child components include calls outside `src/store.js` and depend on various original Express API contracts. Migrate those calls and all required business records to NestJS/PostgreSQL, keeping the original UI code. No public deployment until original billing modules have end-to-end working functionality.

Work ahead: profile settings writes, invoice numbering and save/edit/void/PDF, stock ledger and purchases, expenses/receipts, reports/GST exports, rich-text templates, attachments, full company-scoped user preferences, and safe handling of unsupported local desktop operations. Replace direct `/api/*` calls, review print templates and PWA/offline behavior (the SaaS entry does not mount original PWA bootstrap).

## Deployment boundary

- Existing staging `https://staging.anytimegst.com` and API remain unchanged.
- Do not point production or staging webroots to `dist-saas` as a complete billing portal yet.
- The next validated integration must use original components, not new replacement screens, with real Test A/B negative reads and writes and browser workflow tests.

## Phase 2 — original invoice contracts (development-only)

The original fork still owns the invoice screens and calculation utilities. Its existing `saveBill()` / `getAllBills()` paths are now connected in SaaS mode to a **draft-only** NestJS storage interface, rather than the local JSON-file Express API:

- `apps/api/src/modules/tenancy/legacy-invoice-draft.ts` validates the original fork's invoice object and permits draft status only. Do not claim that browser-supplied GST totals have been independently verified.
- `apps/api/src/modules/tenancy/legacy-invoice-drafts.controller.ts` provides authenticated company-scoped draft create/read/update. It enforces a unique invoice number for each company, financial year and document type. Updates require an existing draft and explicit overwrite.
- `db/migrations/0013_legacy_invoice_drafts.sql` retains the fork's complete original document as JSONB alongside the normalized invoice columns; the table remains protected by FORCE RLS. No financial totals are trusted as issued bookkeeping.
- `db/tests/ci_legacy_invoice_drafts_rls.sql` checks tenant A/B draft isolation.
- `apps/api/src/modules/tenancy/legacy-meta.controller.ts` and migration `0014_company_meta.sql` store the fork's original `/api/meta/:key` settings and atomic per-company numbering counters. Reviewed settings keys are write-allowlisted; `appLock` cannot be modified through meta.
- `db/tests/ci_company_meta_rls.sql` checks tenant A/B settings isolation.
- The existing `src/store.js` wrapper and `src/saas/storeAdapter.js` preserve the fork's public method names and translate allowed meta/invoice-draft API calls without redesigning the original invoice editor.

**Not yet ready for customer use:** normal original invoices often have statuses such as unpaid/paid/cancelled, not `draft`. The secure draft adapter intentionally refuses these states until payment, immutable issue records, tax computation, numbering audit, stock effects, PDF and ledger migrations are implemented and verified. A successful compile is **not** full invoice workflow acceptance.

**Deployment:** do not run migrations 0013–0014 or switch the public frontend merely to enable this increment. Prepare a separate API candidate and run authenticated company/tenant negative tests after implementing the full invoice workflow. Existing staging services remain unchanged.
