# Dedicated onboarding database role — staging only

Create `gst_registration` as a LOGIN role (NOSUPERUSER, NOBYPASSRLS, NOINHERIT, no CREATE privilege and not the table owner). Use a different secret from `gst_auth` and `gst_app`.

After migrations, execute as the migration owner:

```sql
GRANT USAGE ON SCHEMA public TO gst_registration;
GRANT SELECT, INSERT, UPDATE ON registration_requests TO gst_registration;
GRANT SELECT, INSERT, UPDATE ON registration_rate_limits TO gst_registration;
GRANT SELECT (email) ON users TO gst_registration;
GRANT INSERT (email,password_hash), SELECT (id) ON users TO gst_registration;
GRANT SELECT (slug) ON tenants TO gst_registration;
GRANT INSERT (id,slug,display_name) ON tenants TO gst_registration;
GRANT INSERT (tenant_id,user_id,role) ON tenant_memberships TO gst_registration;
GRANT INSERT (tenant_id,legal_name) ON companies TO gst_registration;

-- Policy scope: the registration role must only see its own tenant context
-- for business tables. Other identity metadata remains private.
CREATE POLICY registration_tenant_insert ON tenants FOR INSERT TO gst_registration
 WITH CHECK (id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY registration_membership_insert ON tenant_memberships FOR INSERT TO gst_registration
 WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY registration_company_insert ON companies FOR INSERT TO gst_registration
 WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
```

This role has powerful onboarding authority, even though narrowly granted: it must never be exposed through an arbitrary SQL interface or publicly routed service account. Review grants and RLS interaction with the broad `tenant_scope` policies before enabling registration. Never use the migration owner as the runtime role.

**Feature remains disabled by default.** For production, replace the prototype's inline SMTP send with a durable outbox and add email/HTTP abuse and signup concurrency tests.
