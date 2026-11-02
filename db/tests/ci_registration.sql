-- Synthetic disposable CI fixture only.
\set ON_ERROR_STOP on
CREATE ROLE gst_registration LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
GRANT USAGE ON SCHEMA public TO gst_registration;
GRANT SELECT,INSERT,UPDATE ON registration_requests,registration_rate_limits,registration_mail_outbox TO gst_registration;
GRANT SELECT (email,id), INSERT (email,password_hash) ON users TO gst_registration;
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

SET ROLE gst_registration;
BEGIN;
SELECT set_config('app.tenant_id','33333333-3333-4333-8333-333333333333',true);
INSERT INTO tenants (id,slug,display_name) VALUES
('33333333-3333-4333-8333-333333333333','ci-onboard','CI Onboarding');
WITH owner AS (
 INSERT INTO users(email,password_hash) VALUES('owner-ci@example.invalid','test-hash-not-a-password')
 RETURNING id
)
INSERT INTO tenant_memberships(tenant_id,user_id,role)
SELECT '33333333-3333-4333-8333-333333333333',id,'owner' FROM owner;
INSERT INTO companies(tenant_id,legal_name)
VALUES('33333333-3333-4333-8333-333333333333','CI Onboarding Company');
COMMIT;
RESET ROLE;

DO $$
BEGIN
 IF has_table_privilege('gst_app','registration_requests','SELECT') THEN
  RAISE EXCEPTION 'gst_app must not see registration requests';
 END IF;
 IF has_table_privilege('gst_app','registration_mail_outbox','SELECT') THEN
  RAISE EXCEPTION 'gst_app must not see mail outbox';
 END IF;
 IF has_table_privilege('gst_app','users','SELECT') THEN
  RAISE EXCEPTION 'gst_app must not see identity users';
 END IF;
END $$;
