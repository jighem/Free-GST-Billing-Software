# Anytime GST — Authenticated refresh and logout

Brand: **Anytime GST** — **Your GST. Anytime. Anywhere.**

## Root cause
The SaaS React portal previously held the bearer token only in component memory. Shift+F5 / Ctrl+Shift+R / browser reload cleared the token even though its PostgreSQL `user_sessions` row remained valid for up to 12 hours.

## Fix (staging, tab-scoped)
- `apps/portal/src/session.js` saves only the bearer token, expiry timestamp and last selected tenant UUID to **sessionStorage**, not localStorage. No password, customer data, financial data or tenant details are cached.
- At initial mount, React shows a "Restoring session" state and calls `GET /api/v1/auth/tenants` using the recovered bearer token. It restores a previously selected authorized workspace only after the backend verifies the active membership. `GET /tenants/:tenantId/companies` revalidates access and company setup state.
- Invalid or expired credentials are dropped and the user returns to login. A transient API outage does not destroy a potentially valid browser session.
- `POST /api/v1/auth/logout` authenticates and revokes only the current token hash in PostgreSQL. Migration `0012_logout_session_revoke.sql` grants the dedicated `gst_auth` role DELETE on `user_sessions`; this does not broaden tenant-data permissions.
- The UI clears the tab session immediately on sign-out, then sends logout revocation request. If the request fails, the browser is signed out but the server token may remain valid until the 12-hour expiry. The warning is displayed.
- The dashboard, Clients and Products redirect to login on HTTP 401 after expiry.
- `apps/portal/tests/session.test.mjs` covers persistence, expiry, storage denial and sign-out. The live candidate `deploy/linux/test-m3-tenant-dashboard.mjs` checks bearer revocation and 401 on subsequent session use.

## Scope and security caveats
- **Shift+F5 now preserves the login within the current browser tab** after this release is deployed. Closing all browser tabs or ending the browser session may still require logging in again. No indefinite "Remember me" login is promised.
- sessionStorage is accessible to scripts running on the application's origin; protect it with strict CSP, dependency review, no untrusted HTML/scripts, and a limited bearer TTL. **For production, prefer Secure, HttpOnly, SameSite cookies plus CSRF defenses instead of JavaScript-readable stored bearer tokens.**
- No data is served based on a cached tenant ID without server membership authorization.
- Never paste bearer tokens, passwords, private env files or login payloads into chat or GitHub.
- Registration remains disabled pending MailEnable verification tests.

## Deployment staging
1. Require passing GitHub CI on the exact source head. Checkout `feat/m2-registration-onboarding` on the server.
2. Run `bash deploy/linux/prepare-session-refresh.sh` as root. It backs up the dedicated staging DB and applies safe migrations `0009`–`0012`, starts localhost-only port `14106`, verifies authenticated A/B company isolation, customer/product CRUD and logout, then builds `portal-m3-session`.
3. **The script does not change public Plesk settings**. After successful tests, change the existing staging API nginx `proxy_pass` port to `14106`, then the frontend document root to `staging.anytimegst.com/portal-m3-session`. Keep the previous port and `portal-m2` as rollback.
4. Login Test B: dashboard loads. Shift+F5 repeatedly, confirm no login prompt. Sign out; Shift+F5 must show login. Expire/revoke a test session server-side and verify the next reload returns to login. Repeat for Test A and check no cross-tenant access.
5. Full original fork invoice/GST app integration **is separate and not yet complete**.
