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
