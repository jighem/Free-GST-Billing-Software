# MailEnable verification delivery — Linux GST SaaS (development)

## Decision
Use the existing company MailEnable SMTP server as a *remote transactional email relay* for the Linux SaaS application. This plan does not modify the MailEnable installation, Plesk, DNS, or production application.

## Security and configuration
- Create a **dedicated authenticated SMTP account** for GST SaaS verification. Avoid sharing HR/OTP mailboxes and existing application's credentials.
- Use SMTP host FQDN matching the server certificate (not an IP literal), port 587 with STARTTLS; ensure certificate verification succeeds. Port 465 with implicit TLS is supported if configured on MailEnable. No plaintext SMTP fallback.
- Configure MailEnable sender permissions, From address and SPF, DKIM, DMARC. Review limits, bounces, queue growth, and blacklisting as part of staging testing.
- Linux staging API: `ENABLE_REGISTRATION=0` unless explicitly audited. Put `REGISTRATION_DATABASE_URL`, `REGISTRATION_HMAC_SECRET`, `REGISTRATION_MAIL_KEY` into secure environment or a secret manager, not GitHub.
- `REGISTRATION_MAIL_KEY` is a random 32-byte secret encoded as 64 hex characters. Rotating it requires draining/re-encrypting outstanding outbox jobs; retaining old ciphertext without its key makes jobs undeliverable.
- Worker-only secrets: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_MESSAGE_ID_DOMAIN`.
- Use a real HTTPS `REGISTRATION_VERIFY_URL` with no fragment. The worker sends an HTTPS link with verification token in URL fragment; frontend must read the fragment and POST the token to `/api/v1/registrations/verify`, then clear URL fragment. Do not place the token in analytics or logs.

## Delivery lifecycle
1. Signup inserts short-lived pending registration and encrypted outbox job in the same DB transaction. No email delivery occurs inline with API.
2. A separate Linux scheduler executes `npm run mail:once`, which processes at most 20 due jobs; concurrent workers lock jobs using SKIP LOCKED.
3. Failed SMTP attempts reschedule with bounded exponential retry, maximum six attempts. Delivery errors are classified generically to avoid logging secrets.
4. `POST /api/v1/registrations/resend` rotates the token for an existing unconsumed, unexpired pending registration, resets the queued job, and returns a generic response. Request rate limits apply.
5. The verification transaction consumes the registration once, provisions tenant/owner/company, and invalidates pending delivery state.
6. An operational cleanup job and observability metrics are still needed for expired requests, old rate-limit rows and abandoned encrypted outbox payloads.

## Validation before enabling signup
- Test against a safe MailEnable test recipient: TLS hostname/certificate validation, AUTH, delivery and SPF/DKIM alignment; do not send bulk test mail.
- Simulate SMTP outage and recovery; verify bounded retries and no lost signup job.
- Exercise simultaneous resend/worker execution, expired tokens and repeated verification.
- Protect client IP attribution behind the reverse proxy (trusted proxy config) and add distributed abuse prevention.
- Validate account-enumeration resistance, registration duplicate concurrency, worker crash at SMTP-accepted boundary and rate-limit pressure.
- Review database role privileges; ensure `gst_app` cannot read the outbox or registration secrets.
- Complete client registration/verification screens and integrate email verification UI.
- **Do not deploy to production** or modify MailEnable until explicitly approved.

## Limitations
SMTP acceptance is not confirmed mailbox delivery. Sender reputation, bounces and final inbox delivery must be monitored. Retrying after SMTP accepted but before DB acknowledgement may send a duplicate; deterministic Message-ID reduces some operational confusion but does not guarantee recipient deduplication.
