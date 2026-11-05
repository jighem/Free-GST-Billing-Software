# M2 — Registration → Login → Company Setup (AnytimeGST staging)

## Intended user journey

1. New customer chooses **Create an account** (only after registration is enabled).
2. Enters email, password (12+ characters), legal business name, and workspace slug.
3. API `POST /api/v1/registrations` returns 202 with a generic anti-enumeration response. A separate MailEnable worker sends an encrypted, single-use email verification link.
4. Customer opens verification link, confirms, then signs in.
5. `GET /api/v1/auth/tenants` returns authorized workspaces. A new owner with one incomplete company is sent straight to **Company setup**.
6. Company setup collects legal/trade names, optional GSTIN, state/UT, billing email and address. `PATCH /api/v1/tenants/:tenantId/companies/:companyId/setup` requires owner/admin and tenant-scoped RLS.
7. After saving, company overview is displayed. Invoicing will be a separate M3 phase.

This is **not** a public release. Public registration remains disabled in the currently running staging API. Do not enable it until all SMTP and security checks pass.

## Source changes

- `apps/portal/src/main.jsx` — registration/login/verification UX and new company setup form.
- `apps/api/src/modules/onboarding/registration.*` — existing registration workflow.
- `apps/api/src/modules/tenancy/companies.controller.ts` — owner/admin PATCH profile API.
- `apps/api/src/modules/tenancy/company-setup.ts` — validation (including GSTIN format and state prefix).
- `db/migrations/0008_company_setup_permissions.sql` — company onboarding completion column and least-privilege grants.

State code + GSTIN validation is **format-only**. It does not prove GST registration is genuine or active; verification against approved GST sources will be a later feature.

## Staging rollout order

1. Ensure PR #2 GitHub Actions portal build, API compile, unit and RLS tests have passed.
2. Create a fresh PostgreSQL backup of `gst_saas_dev` (never touch the host's Plesk database).
3. Apply **only** `db/migrations/0008_company_setup_permissions.sql` to `gst_saas_dev`, once.
4. Build updated `apps/api` from the PR branch as a new tagged Docker image. Start a temporary candidate on a **different loopback-only port**, preserving existing API ports 14101/14102.
5. Test /health, unauthenticated GET/PATCH, tenant membership restrictions and company setup on synthetic test accounts; switch the Plesk `staging-api.anytimegst.com` reverse proxy only after these pass.
6. Build updated `apps/portal` with `VITE_API_BASE_URL=https://staging-api.anytimegst.com/api/v1`. Deploy to a **new versioned frontend release directory**, set the frontend domain document root via Plesk, and preserve old release for rollback.
7. First logins to Test A and B will open company setup until saved; verify A cannot read/update B's company; verify viewer cannot PATCH.

Do not overwrite an existing frontend directory in place. Do not copy any backend code, credentials, database scripts or `.env` into a web-accessible folder.

## Registration activation gate — currently NOT met

Before enabling `ENABLE_REGISTRATION=1` in a separate reviewed API candidate or `VITE_ENABLE_SIGNUP=true` in a new portal build:

- Configure and test `REGISTRATION_DATABASE_URL` (restricted `gst_registration` account).
- Generate root-only `REGISTRATION_HMAC_SECRET` (>=32 random characters) and `REGISTRATION_MAIL_KEY` (32 random bytes as 64 hex characters).
- Set `REGISTRATION_VERIFY_URL=https://staging.anytimegst.com/` (link token is in the URL fragment).
- Set and verify `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, optional `SMTP_MESSAGE_ID_DOMAIN` for the authorized MailEnable relay.
- Configure the **separate** `registration-mail.worker` scheduler (it is not automatically started by the web API).
- Verify genuine SMTP delivery to a controlled test mailbox, encrypted link, single-use activation, expiry/resend and anti-abuse handling.
- Negative tests: cross-tenant access, duplicate email/slug, registration races, mail retry/replay, invalid tokens, rate limiting, and failure isolation.
- Approve login rate limiting, account recovery and session lifecycle before accepting real customer accounts.

Never expose registration secrets or generated verification links in logs, GitHub, chat, or frontend JS bundles.
