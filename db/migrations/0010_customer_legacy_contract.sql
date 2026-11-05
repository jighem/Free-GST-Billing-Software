-- M3 adaptation of original /api/clients store contract: one company per customer.
-- Preserve additional legacy customer fields for future original React UI reuse.
BEGIN;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb;
GRANT SELECT (id, tenant_id, company_id, display_name, gstin, profile, created_at) ON customers TO gst_app;
GRANT INSERT (tenant_id, company_id, display_name, gstin, profile) ON customers TO gst_app;
GRANT UPDATE (display_name, gstin, profile) ON customers TO gst_app;
GRANT DELETE ON customers TO gst_app;
-- Existing tenant-scope FORCE RLS remains enabled.
COMMIT;
