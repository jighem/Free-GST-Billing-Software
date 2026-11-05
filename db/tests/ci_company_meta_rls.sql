-- Disposable CI: verify company settings and atomic counters remain tenant scoped.
\set ON_ERROR_STOP on
INSERT INTO company_meta(tenant_id,company_id,key,value) VALUES
('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','invoiceNumberSettings','{"startNumber":5}'::jsonb),
('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','invoiceNumberSettings','{"startNumber":100}'::jsonb);
SET ROLE gst_app;
BEGIN;
SELECT set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE own int; foreign_count int;
BEGIN
 SELECT (value->>'startNumber')::int INTO own FROM company_meta WHERE key='invoiceNumberSettings';
 SELECT count(*) INTO foreign_count FROM company_meta WHERE company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 IF own<>5 OR foreign_count<>0 THEN RAISE EXCEPTION 'Company settings A leaked'; END IF;
 UPDATE company_meta SET value='{"startNumber":1}'::jsonb WHERE company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 IF FOUND THEN RAISE EXCEPTION 'Cross-tenant settings write succeeded'; END IF;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',true);
DO $$
DECLARE own int; foreign_count int;
BEGIN
 SELECT (value->>'startNumber')::int INTO own FROM company_meta WHERE key='invoiceNumberSettings';
 SELECT count(*) INTO foreign_count FROM company_meta WHERE company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 IF own<>100 OR foreign_count<>0 THEN RAISE EXCEPTION 'Company settings B leaked'; END IF;
END $$;
ROLLBACK;
RESET ROLE;
