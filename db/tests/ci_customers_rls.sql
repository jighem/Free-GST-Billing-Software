-- CI fixture only. Verify legacy client profile fields and per-tenant RLS
-- after migrations 0001–0010 and ci_seed.sql.
\set ON_ERROR_STOP on
INSERT INTO customers (tenant_id,company_id,display_name,gstin,profile)
VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A customer',NULL,'{"city":"Mumbai"}'::jsonb),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','B customer',NULL,'{"city":"Pune"}'::jsonb);

SET ROLE gst_app;
BEGIN;
SELECT set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE count_a int; count_b int; city_a text;
BEGIN
 SELECT count(*) INTO count_a FROM customers WHERE company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND display_name='A customer';
 SELECT count(*) INTO count_b FROM customers WHERE company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND display_name='B customer';
 SELECT profile->>'city' INTO city_a FROM customers WHERE company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND display_name='A customer';
 IF count_a<>1 OR count_b<>0 OR city_a<>'Mumbai'
 THEN RAISE EXCEPTION 'Tenant A client isolation failure'; END IF;
 UPDATE customers SET display_name='A updated' WHERE company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND display_name='B customer';
 IF FOUND THEN RAISE EXCEPTION 'Tenant A updated tenant B customer'; END IF;
 DELETE FROM customers WHERE company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND display_name='B customer';
 IF FOUND THEN RAISE EXCEPTION 'Tenant A deleted tenant B customer'; END IF;
END $$;
ROLLBACK;

BEGIN;
SELECT set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',true);
DO $$
DECLARE count_a int; count_b int; city_b text;
BEGIN
 SELECT count(*) INTO count_a FROM customers WHERE company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND display_name='A customer';
 SELECT count(*) INTO count_b FROM customers WHERE company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND display_name='B customer';
 SELECT profile->>'city' INTO city_b FROM customers WHERE company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND display_name='B customer';
 IF count_a<>0 OR count_b<>1 OR city_b<>'Pune'
 THEN RAISE EXCEPTION 'Tenant B client isolation failure'; END IF;
END $$;
ROLLBACK;
RESET ROLE;
