-- Disposable CI-only fixtures validating billing counts with FORCE RLS.
\set ON_ERROR_STOP on
INSERT INTO customers (tenant_id,company_id,display_name) VALUES
('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A only'),
('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','B only');
INSERT INTO invoices (tenant_id,company_id,invoice_number,financial_year,document_type,issued_on,status) VALUES
('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A-1','2026-27','tax_invoice','2026-11-02','draft'),
('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','B-1','2026-27','tax_invoice','2026-11-02','issued');

SET ROLE gst_app;
BEGIN;
SELECT set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE a_customers integer; a_drafts integer; b_invoices integer; b_customers integer;
BEGIN
 SELECT count(*) INTO a_customers FROM customers WHERE company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 SELECT count(*) INTO a_drafts FROM invoices WHERE company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND status='draft';
 SELECT count(*) INTO b_invoices FROM invoices WHERE company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 SELECT count(*) INTO b_customers FROM customers WHERE company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 IF a_customers<>1 OR a_drafts<>1 OR b_invoices<>0 OR b_customers<>0
 THEN RAISE EXCEPTION 'Dashboard leaked tenant data: %, %, %, %',a_customers,a_drafts,b_invoices,b_customers; END IF;
END $$;
ROLLBACK;

BEGIN;
SELECT set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',true);
DO $$
DECLARE b_customers integer; b_issued integer; a_invoices integer;
BEGIN
 SELECT count(*) INTO b_customers FROM customers WHERE company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 SELECT count(*) INTO b_issued FROM invoices WHERE company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND status='issued';
 SELECT count(*) INTO a_invoices FROM invoices WHERE company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 IF b_customers<>1 OR b_issued<>1 OR a_invoices<>0
 THEN RAISE EXCEPTION 'Dashboard leaked tenant data on B: %, %, %',b_customers,b_issued,a_invoices; END IF;
END $$;
ROLLBACK;
RESET ROLE;
