# M2 registration + company onboarding — implementation contract

**Branch:** feat/m2-registration-onboarding. **Status:** design/schema/pure input validation only; registration is NOT exposed publicly.

## User journey
1. Visitor chooses sign-up and enters email, strong password, company legal name and workspace slug.
2. Server rate-limits by IP and normalized email, validates input, hashes password, stores short-lived pending registration with a SHA-256 digest of a cryptographically random single-use verification token, and queues email delivery. Responses do not disclose whether an email exists.
3. Verification endpoint atomically claims token before expiry; a trusted restricted provisioning operation creates global user, tenant, owner membership and first company in **one PostgreSQL transaction**. Concurrent claims must not produce duplicate tenants.
4. User selects a subscription plan. The account is limited to onboarding/trial until a server-side entitlement becomes active.
5. User signs in, selects an authorized tenant, adds company settings/GSTIN/state and then uses tenant-scoped invoicing APIs.

## Data boundaries
- The `registration_requests` table is platform-owned. Neither `gst_app` nor `gst_auth` receives direct access. Use a narrowly scoped server-side provisioning role or SECURITY DEFINER function following independent review.
- Never trust incoming user-specified `tenant_id`, `user_id`, `role`, `plan_price`, `subscription_status` or API limits.
- Never send token digests or password hashes to the frontend; never log credentials, user registration payload or verification tokens.
- Unique email and workspace slug conflicts must return generic messaging to unauthenticated callers, without side channels.
- GSTIN must be validated separately, including registration category/state consistency and company ownership. Not every company is GST-registered.
- Email verification, password reset and invitations have separate token types and purpose scopes.

## Release blockers
- No live email provider chosen/connected.
- No public registration/verification endpoints implemented.
- No rate limiting, captcha/bot challenge, outbox/retry, activation procedure or integration tests.
- No feature flag, admin review tooling, onboarding UI or subscription enforcement yet.
- Legacy React/Vite and existing Windows/Plesk website remain unchanged.
- Linux staging only after reviewed CI and user approval.

## Planned APIs (NOT implemented)
- POST /api/v1/registrations (accept request; generic response)
- POST /api/v1/registrations/verify (single-use token)
- GET /api/v1/onboarding/status (authenticated)
- POST /api/v1/tenants/:tenantId/companies (authenticated + tenant role)
- GET /api/v1/subscription-plans (public active catalog)
- POST /api/v1/subscriptions/checkout (authenticated + server-side plan lookup)

First test criteria: duplicate email, duplicate slug, expired/reused token, parallel verification, cross-tenant company creation, unauthorized owner role escalation, nonexistent plan, suspended tenant and idempotent retries.
