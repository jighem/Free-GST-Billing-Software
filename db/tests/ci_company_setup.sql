-- Disposable CI database only. Verify updates cannot escape tenant scope.
\set ON_ERROR_STOP on
SET ROLE gst_app;
BEGIN;
SELECT set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
UPDATE companies SET trade_name='Tenant A Updated'
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $$
DECLARE own_count integer; foreign_count integer;
BEGIN
 SELECT count(*) INTO own_count FROM companies
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
   AND trade_name='Tenant A Updated';
 IF own_count<>1 THEN RAISE EXCEPTION 'A company update failed'; END IF;
 SELECT count(*) INTO foreign_count FROM companies
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 IF foreign_count<>0 THEN RAISE EXCEPTION 'Tenant A saw B company'; END IF;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
UPDATE companies SET trade_name='SHOULD NOT WORK'
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
DO $$
DECLARE changed_count integer;
BEGIN
 SELECT count(*) INTO changed_count FROM companies
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND trade_name='SHOULD NOT WORK';
 IF changed_count<>0 THEN RAISE EXCEPTION 'Cross-tenant update leaked'; END IF;
END $$;
ROLLBACK;
RESET ROLE;
