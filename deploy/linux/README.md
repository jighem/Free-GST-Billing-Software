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
