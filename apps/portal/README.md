# GST SaaS browser portal — M2 development preview

This separate React/Vite application is the **SaaS entry point**. It does not run the original local desktop launcher or issue legacy `/api/bills`, `/api/lock`, `/api/profile` or other desktop Express requests.

## What it currently supports

- Sign in with `POST /api/v1/auth/login`.
- Fetch accessible workspaces from `GET /api/v1/auth/tenants`.
- Display companies through membership-checked `GET /api/v1/tenants/:tenantId/companies`.
- Feature-gated signup, verification and resend against `/api/v1/registrations` endpoints; **off by default**.
- Verification token is extracted from the URL **fragment**, cleared immediately, and only sent to the API after an explicit verification action.
- Bearer token is held **only in JS memory**, not persisted to localStorage or sessionStorage. Reloading signs out. This is a temporary staging choice; production needs a reviewed, safer session/token lifecycle.
- No offline/PWA caching of bearer credentials or personal financial data.

## Run local checks

```bash
cd apps/portal
npm install --no-audit --no-fund
npm run build
node --test tests/*.test.mjs
```

Build output: `apps/portal/dist/`, **not** the legacy root `dist/`.

## Required infrastructure before testing login

A single-origin HTTPS reverse proxy must send **only** `/api/v1/*` to the audited NestJS service. The legacy Express server **must never** be routed publicly. The API currently listens on `127.0.0.1` inside its container; it is not reachable from Plesk. Configure a reviewed container-to-proxy connection, firewall binding and HTTP header rules before publishing API routes.

Use a fresh static webroot deployment of this portal only after verifying its build and carefully backing up the existing staging webroot. Do not publish the previous desktop-oriented React build as a SaaS UI.

Signup remains **disabled** by default:
- Portal: build without `VITE_ENABLE_SIGNUP=true`.
- API: `ENABLE_REGISTRATION=0`.
Enabling both requires security approval, real MailEnable SMTP relay validation, verified registration DB policies, abuse protections, and negative end-to-end tests.

## M2 remaining security gates

- Fix and test `gst_auth` session and `gst_registration` privileges against live staging DB roles.
- Cross-tenant integration tests, authorization and entitlement enforcement.
- Mail worker live delivery tests with an isolated test mailbox, retries and revocations.
- Stronger brute force, trusted proxy and account recovery protection.
- API dependency lockfile, CI review, full subscription lifecycle.
- Move to an audited server-managed session strategy before accepting actual customer data.

**No live invoices, payments or customer data on this preview.**
