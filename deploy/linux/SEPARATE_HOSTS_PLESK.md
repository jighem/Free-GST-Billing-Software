# GST SaaS — separated Plesk staging hosts

## Website layout

| Purpose | Public URL | Files/services |
|---|---|---|
| Frontend browser portal | `https://gst-dev.udaanhost.com` | **Only** compiled `apps/portal/dist` assets |
| NestJS API | `https://gst-api-dev.udaanhost.com` | Reverse proxy to dedicated Docker API listener, not source code |
| PostgreSQL | No public URL | `gst-saas-dev-postgres:5432` on private `gst-saas-dev` Docker network |
| MailEnable | Remote SMTP relay | Dedicated authenticated SMTP account, configuration remains private |

**Create `gst-api-dev.udaanhost.com` in DNS and Plesk** before trying cross-origin login. Assign HTTPS certificate to both sites. Do not publish the original desktop `server.js` Express API.

## Why the old document root has only a few files

Vite compiles hundreds of React source modules and dependencies into a small number of fingerprinted JS/CSS assets. Browser sites need only `index.html` and files under `assets/`. The current screenshot also contains `tesseract`, icons, manifest and service-worker files from the *old offline desktop application*. Those are **not** the new SaaS portal. The real source remains at `/opt/gst-saas-dev/source`; database migrations, backend code and secrets should NEVER be copied into a Plesk document root.

## New staging frontend artifact

GitHub Actions workflow `M1 SaaS foundation validation` now includes `Standalone SaaS portal build` and uploads an artifact named `gst-saas-portal-staging` containing the **compiled** `apps/portal/dist/` directory.

Download it from the successful workflow run for PR #2; extract the ZIP into a fresh staging release directory, not into the currently live domain root. It is built with:

```
VITE_API_BASE_URL=https://gst-api-dev.udaanhost.com/api/v1
```

The portal's CSP permits a connection to this exact API domain. Do not upload `node_modules`, `apps/api`, SQL migration files, `.env`, or secrets to the site.

## Recommended Plesk web layout

Set the **frontend domain's document root** in Plesk → Hosting Settings to a clean, dedicated folder such as `public` under the domain's existing vhost directory:

```text
/var/www/vhosts/udaanconnect.cloud/gst-dev.udaanhost.com/
  public/                  # only compiled portal assets, Plesk Document root
    index.html
    assets/
```

Staging builds, source and secrets stay elsewhere:

```text
/opt/gst-saas-dev/
  source/                  # checkout (not public)
  releases/                # build artifacts, rollback snapshots
  build/                   # Dockerfiles and scripts
/root/gst-saas-secrets/    # DB credentials (root-only)
/var/lib/docker/volumes/   # PostgreSQL data, Docker managed
```

The previous root-level legacy build can be backed up to the private `/opt/gst-saas-dev/releases/` directory *after inspecting the current document root and before any replacement*. Do not delete it until rollback is verified. Changing the Plesk document root requires separate authorization/operation; **no deployment is performed by this documentation**.

## Private backend routing

The API is already in a separate container `gst-saas-dev-api`, but its current process is bound to `127.0.0.1:4100` **inside** the container, so a host proxy cannot reach it.

New code permits `API_BIND_HOST=0.0.0.0` only if `ALLOW_CONTAINER_BIND=1`. This must be combined with a Docker port published **only on the host loopback**, e.g. `-p 127.0.0.1:14100:4100`, and restrictive proxy config scoped to the API staging hostname. Never use `-p 0.0.0.0:4100:4100` or `--network host`.

Configure the API hostname's Plesk proxy to forward `/api/v1/*` to `127.0.0.1:14100`, preserving HTTPS request metadata and disallowing other paths. The exact Plesk directives need review against the generated Nginx and Apache vhost config to avoid duplicate `location /` directives. Apply only to the new API domain.

Use `CORS_ORIGINS=https://gst-dev.udaanhost.com` on NestJS. The frontend sends `Authorization: Bearer` and uses no cookies. No untrusted Origin reflection. Do not enable Swagger or registration for the first gateway test.

## Current release limitations

- This is a **sign-in and workspace UI preview**, not a complete cloud invoicing service.
- Existing frontend invoices use local desktop Express contracts and **are not available** in the new portal.
- The registration feature is deliberately off until security review, MailEnable SMTP staging delivery, and concurrency/abuse testing.
- There are no seeded customer accounts; successful login requires audited account provisioning.
- Subscription entitlements and the invoicing data model must be implemented before real customer use.

**Do not deploy to or modify `invoices.udaanhost.com`.**
