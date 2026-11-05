# Dedicated Linux SaaS registration DB role — staging only

Use `gst_registration` as a separate non-owner LOGIN role with NOSUPERUSER, NOBYPASSRLS and NOINHERIT; its credentials must not be shared with the tenant application or identity readers.

Execute with the migration owner after migrations 0001-0006:

```sql
GRANT USAGE ON SCHEMA public TO gst_registration;
GRANT SELECT,INSERT,UPDATE ON registration_requests,registration_rate_limits,registration_mail_outbox TO gst_registration;
GRANT SELECT (email) ON users TO gst_registration;
GRANT INSERT (email,password_hash), SELECT (id) ON users TO gst_registration;
GRANT SELECT (slug) ON tenants TO gst_registration;
GRANT INSERT (id,slug,display_name) ON tenants TO gst_registration;
GRANT INSERT (tenant_id,user_id,role) ON tenant_memberships TO gst_registration;
GRANT INSERT (tenant_id,legal_name) ON companies TO gst_registration;
CREATE POLICY registration_tenant_insert ON tenants FOR INSERT TO gst_registration
 WITH CHECK (id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY registration_membership_insert ON tenant_memberships FOR INSERT TO gst_registration
 WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY registration_company_insert ON companies FOR INSERT TO gst_registration
 WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
```

No DB grants are made by the migration itself. Review policy composition and column privileges under the exact runtime role before enabling signup. The outbox contains encrypted verification links, but `gst_registration` can read ciphertext; protect DB credentials and encryption key independently.

Registration API uses `REGISTRATION_DATABASE_URL` only when `ENABLE_REGISTRATION=1`. Mail worker runs separately on Linux; it needs access to the restricted outbox, MailEnable SMTP credentials, and encryption key. Never allow SQL injection, arbitrary SQL endpoints, untrusted proxy headers, wildcard CORS or production exposure without security testing.
