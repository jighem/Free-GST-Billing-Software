-- Run after 0013 and ci_seed.sql on disposable CI DB.
-- Verify draft invoices are tenant-scoped and cannot be updated across tenants.
\set ON_ERROR_STOP on
INSERT INTO invoices(tenant_id,company_id,invoice_number,financial_year,document_type,issued_on,status,legacy_document)
VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'CI-DRAFT-01','2026-27','tax_invoice','2026-11-05','draft',
  '{"id":"CI-DRAFT-01","invoiceNumber":"CI-DRAFT-01","status":"draft"}'::jsonb),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'CI-DRAFT-01','2026-27','tax_invoice','2026-11-05','draft',
  '{"id":"CI-DRAFT-01","invoiceNumber":"CI-DRAFT-01","status":"draft"}'::jsonb);

SET ROLE gst_app;
BEGIN;
SELECT set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE mine integer; foreign_count integer;
BEGIN
 SELECT count(*) INTO mine FROM invoices WHERE invoice_number='CI-DRAFT-01';
 SELECT count(*) INTO foreign_count FROM invoices WHERE company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 IF mine<>1 OR foreign_count<>0 THEN RAISE EXCEPTION 'Invoice A tenant read leak'; END IF;
 UPDATE invoices SET legacy_document='{"tampered":true}'::jsonb
 WHERE company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 IF FOUND THEN RAISE EXCEPTION 'Invoice A modified B'; END IF;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',true);
DO $$
DECLARE mine integer; foreign_count integer;
BEGIN
 SELECT count(*) INTO mine FROM invoices WHERE invoice_number='CI-DRAFT-01';
 SELECT count(*) INTO foreign_count FROM invoices WHERE company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 IF mine<>1 OR foreign_count<>0 THEN RAISE EXCEPTION 'Invoice B tenant read leak'; END IF;
END $$;
ROLLBACK;
RESET ROLE;
