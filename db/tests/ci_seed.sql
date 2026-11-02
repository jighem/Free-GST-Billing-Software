-- CI fixture only: disposable database with non-sensitive synthetic values.
-- Intentionally keeps tenant A and B distinguishable for negative isolation checks.
\set ON_ERROR_STOP on
INSERT INTO tenants (id, slug, display_name)
VALUES
 ('11111111-1111-4111-8111-111111111111','tenant-a','CI Tenant A'),
 ('22222222-2222-4222-8222-222222222222','tenant-b','CI Tenant B');

INSERT INTO companies (id, tenant_id, legal_name)
VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Company A'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Company B');

GRANT USAGE ON SCHEMA public TO gst_app;
GRANT SELECT ON companies TO gst_app;
