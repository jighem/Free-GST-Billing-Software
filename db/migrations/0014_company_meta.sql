-- Original fork's invoice settings and counters scoped to the active company.
-- Stored separately from local JSON files; every row protected by FORCE RLS.
BEGIN;
CREATE TABLE IF NOT EXISTS company_meta (
 tenant_id uuid NOT NULL,
 company_id uuid NOT NULL,
 key text NOT NULL CHECK(length(key) BETWEEN 1 AND 180),
 value jsonb NOT NULL DEFAULT 'null'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,company_id,key),
 FOREIGN KEY (tenant_id,company_id) REFERENCES companies(tenant_id,id)
);
ALTER TABLE company_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_meta FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope ON company_meta;
CREATE POLICY tenant_scope ON company_meta FOR ALL
 USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT (tenant_id,company_id,key,value,updated_at) ON company_meta TO gst_app;
GRANT INSERT (tenant_id,company_id,key,value) ON company_meta TO gst_app;
GRANT UPDATE (value,updated_at) ON company_meta TO gst_app;
COMMIT;
