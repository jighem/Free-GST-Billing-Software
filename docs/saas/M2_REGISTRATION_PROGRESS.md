# M2 implementation progress — development only

## Implemented
- POST /api/v1/registrations (only when ENABLE_REGISTRATION=1)
  - Normalizes registration inputs, applies per-hour PostgreSQL email/IP rate counters and returns a generic response for pre-existing accounts.
  - Hashes password with scrypt; stores a single-use SHA-256 verification token digest with 30-minute expiry.
  - Attempts configured SMTP delivery; token is placed in URL fragment to avoid ordinary GET logs.
- POST /api/v1/registrations/verify (only when enabled)
  - Locks the pending request with SELECT ... FOR UPDATE.
  - Creates tenant, owner account, owner membership and first company in one transaction, with tenant context bound to the transaction.
  - Marks token consumed only as part of successful transaction.
- Separate registration database role contract and CI SQL provisioning smoke test.

## Safeguards
- ENABLE_REGISTRATION defaults to 0. No public registration routes unless explicitly enabled.
- Requires separate REGISTRATION_DATABASE_URL, HMAC secret, SMTP config and dedicated role.
- Never use or expose production Plesk credentials. No production deployment.
- Registration role cannot be exposed to ordinary API consumers or used for arbitrary SQL.
- Authentication sessions are the existing M1 prototype; no public release is authorized.

## Blocking issues before staging/public use
- Replace inline SMTP send with durable outbox and reliable retry. A failed send can leave a pending registration without a user-visible recovery route.
- Expand anti-bot protection and rate limits (IP behind trusted proxy, abuse across distributed clients and persistent retention).
- Add stronger email verification and ownership checks, duplicate/concurrent registration tests, resend flow, account discovery review and audit.
- Review PostgreSQL grants/policies and negative tests for role escalation. Test real SMTP in an isolated staging environment.
- Add frontend registration/verification/onboarding UI and subscription entitlement workflow.
- Commit API package-lock.json and use npm ci for reproducible builds.
