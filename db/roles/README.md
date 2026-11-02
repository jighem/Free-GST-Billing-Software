# Development-only PostgreSQL role boundaries

Create two distinct LOGIN roles with unique secrets: `gst_auth` and `gst_app`. Both must be NOSUPERUSER, NOBYPASSRLS, NOINHERIT and not owners of tables. Apply schema migrations as a separate owner. Provision role credentials outside GitHub.

After 0001 and 0002, the migration owner can execute:

```sql
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gst_auth, gst_app;
GRANT SELECT (id,email,password_hash) ON users TO gst_auth;
GRANT SELECT (id,display_name,status) ON tenants TO gst_auth;
GRANT SELECT (tenant_id,user_id,role) ON tenant_memberships TO gst_auth;
GRANT SELECT (user_id,token_hash,expires_at), INSERT (user_id,token_hash,expires_at) ON user_sessions TO gst_auth;
GRANT SELECT ON companies TO gst_app;

-- Identity role reads only membership/tenant metadata; never GST business data.
-- Its two identity-only read policies are intentionally broad for internal membership
-- resolution, and do not grant invoice, customer or company access.
CREATE POLICY identity_memberships_read ON tenant_memberships FOR SELECT TO gst_auth USING (true);
CREATE POLICY identity_tenants_read ON tenants FOR SELECT TO gst_auth USING (true);
```

Authentication uses `AUTH_DATABASE_URL` and business queries use `DATABASE_URL`; never reuse credentials. The global identity reader can see tenant metadata and all memberships (not customer/company/invoice data), so its credentials must be protected and it must only execute fixed parameterized identity SQL.

The transaction-scoped RLS setting `app.tenant_id` prevents accidental cross-tenant application queries but is not safe against arbitrary SQL executed by a compromised tenant DB role; such SQL could set the context itself. Never expose raw SQL endpoints; test with restricted roles, not a migration owner. Do not enable public network exposure before audit, login throttling, MFA and session revocation are added.
