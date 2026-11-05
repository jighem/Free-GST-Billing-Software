-- Tenant-safe product catalogue adapting original InventoryView product fields.
BEGIN;
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  company_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 200),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,company_id) REFERENCES companies(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS products_company_idx ON products(tenant_id,company_id,name);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope ON products;
CREATE POLICY tenant_scope ON products FOR ALL
 USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT (id,tenant_id,company_id,name,details,created_at,updated_at) ON products TO gst_app;
GRANT INSERT (tenant_id,company_id,name,details) ON products TO gst_app;
GRANT UPDATE (name,details,updated_at) ON products TO gst_app;
GRANT DELETE ON products TO gst_app;
COMMIT;
