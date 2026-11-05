-- Disposable PostgreSQL CI product RLS checks.
\set ON_ERROR_STOP on
INSERT INTO products (tenant_id,company_id,name,details) VALUES
('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A product','{"hsn":"1234","sellingPrice":10}'::jsonb),
('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','B service','{"kind":"service","sellingPrice":100}'::jsonb);
SET ROLE gst_app;
BEGIN;
SELECT set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE count_a int; count_b int;
BEGIN
 SELECT count(*) INTO count_a FROM products WHERE name='A product';
 SELECT count(*) INTO count_b FROM products WHERE name='B service';
 IF count_a<>1 OR count_b<>0 THEN RAISE EXCEPTION 'A product tenant read leaked'; END IF;
 UPDATE products SET name='ATTACK' WHERE company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 IF FOUND THEN RAISE EXCEPTION 'A updated B product'; END IF;
 DELETE FROM products WHERE company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 IF FOUND THEN RAISE EXCEPTION 'A deleted B product'; END IF;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',true);
DO $$
DECLARE count_a int; count_b int;
BEGIN
 SELECT count(*) INTO count_a FROM products WHERE name='A product';
 SELECT count(*) INTO count_b FROM products WHERE name='B service';
 IF count_a<>0 OR count_b<>1 THEN RAISE EXCEPTION 'B product tenant read leaked'; END IF;
END $$;
ROLLBACK;
RESET ROLE;
