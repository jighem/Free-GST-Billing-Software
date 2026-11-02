# Linux SaaS staging target

This directory replaces the **Windows/Plesk staging plan** for future work. Nothing here changes or deploys to production.

Recommended topology: HTTPS Nginx -> Vite-built React assets + NestJS API; private PostgreSQL 16+; backups outside the server; separate workers/storage when needed.

## Rules
- Separate Linux staging host or isolated Linux VM/container environment, with separate DNS and secrets.
- PostgreSQL must not be publicly reachable; roles `gst_auth` and `gst_app` have minimal permissions and are not database owners.
- API must use trusted tenant membership, subscription entitlements, and transaction-local RLS context. No public routes to the legacy Express JSON backend.
- Never copy production JSON records into the new database without migration validation and explicit approval.
- CI and tenant A/B tests are prerequisites for staging deployment.
- Production HTTPS, webhooks, backups, rate limiting, monitoring, key rotation and rollback procedures are mandatory release gates.
- No live billing or customer signup deployment until verified identity, provider callbacks and subscription access rules are implemented and tested.

## Next work
Implement isolated Linux development compose configuration, registration/verification and subscription entitlement service; choose payment gateway only after reviewing actual commercial terms and APIs. No payment provider is selected in M1.


## Installation record — 2026-11-02 (operator-verified)

**Overall status:** staging infrastructure installed and private API smoke-tested; public frontend shows the **wrong launcher screen**. This is *not* a working multi-tenant SaaS deployment. Working `invoices.udaanhost.com` remains out of scope.

### Host, source, and locations

| Item | Recorded value |
| --- | --- |
| Staging URL | `https://gst-dev.udaanhost.com` |
| Hosting | Active Linux Plesk; Node.js 22 and 24 available via Plesk |
| Plesk domain ID | 17 |
| Plesk SSL | Let's Encrypt assigned; HTTP-to-HTTPS redirect enabled |
| **Actual Plesk document root** | `/var/www/vhosts/udaanconnect.cloud/gst-dev.udaanhost.com` — **no trailing `httpdocs`** |
| Git checkout | `/opt/gst-saas-dev/source` |
| Branch and observed commit | `feat/m2-registration-onboarding`; `765ea20` |
| Docker network | `gst-saas-dev` |
| Database container / volume | `gst-saas-dev-postgres` / `gst-saas-dev-pgdata` |
| Database / version | `gst_saas_dev`; PostgreSQL **16.15** |
| Database port publishing | None (internal `5432/tcp` only) |
| API image / container | `gst-saas-api:staging` / `gst-saas-dev-api` |
| API bind | `127.0.0.1:4100` inside the API container (not publicly routed) |
| Frontend image | `gst-saas-frontend:staging` |
| Extracted frontend | `/opt/gst-saas-dev/releases/frontend-dist` (~44.7 MB) |
| Local build Dockerfiles | `/opt/gst-saas-dev/build/Dockerfile.api`, `Dockerfile.frontend` |
| Root-only DB credential file | `/root/gst-saas-secrets/db-roles.env`, mode 600, root:root |
| Root-only PostgreSQL admin file | `/root/gst-saas-secrets/postgres.env` |

**Do not commit or print the secrets, private keys, or live credentials.** The actual server public IP is omitted from this repository installation record; access should be controlled by operations.

### Completed and verified from operator SSH output

1. Docker PostgreSQL 16 initialized with persistent volume, healthy status, no host-published port. Existing host PostgreSQL 10.23 left alone.
2. Fresh `gst_saas_dev` database migrated successfully with **0001 through 0006**, creating **14 tables**: `tenants`, `users`, `tenant_memberships`, `companies`, `customers`, `invoices`, `invoice_lines`, `user_sessions`, `subscription_plans`, `tenant_subscriptions`, `subscription_events`, `registration_requests`, `registration_rate_limits`, `registration_mail_outbox`.
3. Database roles `gst_app`, `gst_auth`, `gst_registration` created with individual generated passwords; all have `rolsuper=false` and `rolbypassrls=false`. Each role authenticated successfully through the private Docker network.
4. Initial negative access check passed: `gst_app` sees zero companies without tenant context and SELECT on `registration_requests` is denied. **Full cross-tenant and privilege audit not yet done.**
5. Node 22 Docker API build passed `npm run typecheck`, `npm run build`, registration-policy and mail-crypto unit tests.
6. `gst-saas-dev-api` started with `ENABLE_REGISTRATION=0`, no host port, read-only filesystem and dropped capabilities. Internal `GET /api/v1/health` returned HTTP **200** with `{"status":"ok","service":"gst-saas-api","version":1}`; `POST /api/v1/registrations` returned **404** as intended; container status running.
7. Legacy frontend built via Docker Node 22 with `npm ci` and `npm run build`. Extracted build `index.html` exists.
8. Plesk CLI and Nginx/Apache configuration verified that the **domain directory itself** is document root. First copy attempt using a nonexistent `httpdocs` subdirectory failed safely with no changes. Corrected target was identified.
9. Browser screenshot shows the staging domain reachable via HTTPS and presenting the **desktop Quick Start launcher** instead of the GST invoicing application. No final corrected-copy command output was supplied; treat exact deployment content as **not independently verified**.

### Open issue: desktop launcher instead of browser application

Observed page heading: **“Free GST Billing Software Needs a Quick Start”**; instructions mention double-clicking a desktop icon and a persistent “Starting...” state. This is not a SaaS sign-in screen or usable web invoice UI.

Likely investigation area (not yet proven): repository's root `index.html` is a launcher, whereas the Vite source root is `src/`. Compare the deployed `index.html`, Vite-generated `dist/index.html`, source `src/index.html`, legacy Express API usage, assets and PWA service worker before changing live files. Do **not** delete data or blindly replace the Plesk site's document root.

Read-only checks on the staging host:

```bash
cd /opt/gst-saas-dev/source
ls -lh index.html src/index.html /opt/gst-saas-dev/releases/frontend-dist/index.html
grep -in -m 5 -E 'Quick Start|Starting|root|/assets/' /opt/gst-saas-dev/releases/frontend-dist/index.html || true
grep -in -m 5 -E 'Quick Start|Starting|root|/assets/' /var/www/vhosts/udaanconnect.cloud/gst-dev.udaanhost.com/index.html || true
curl -sSI https://gst-dev.udaanhost.com/
```

### Mandatory remaining work

- Fix/confirm correct browser frontend entry point. Legacy application is offline-first and is **not** yet backed by SaaS PostgreSQL tenant storage.
- Integrate frontend sign-up, email verification, login, tenant/company onboarding, and subscription flows.
- Configure audited private API networking/proxy; current API binds only to loopback **inside** its Docker container.
- Configure/test MailEnable authenticated TLS SMTP with dedicated account and sender DNS; no worker delivery has been verified.
- Complete DB RLS cross-tenant tests, user/role privilege review, error/abuse protection, registration concurrency and retry tests.
- Commit a reviewed API npm lockfile, run reproducible CI, implement staging backups, secret management and rollback.
- Preserve `ENABLE_REGISTRATION=0` until gates pass; do not merge draft PR #2 or modify production invoicing site.
