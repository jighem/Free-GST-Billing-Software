-- M2 company setup: permit only scoped column updates to gst_app.
-- Execute after migrations 0001-0007, with staging migration owner.
-- Existing FORCE ROW LEVEL SECURITY policies must remain enabled.
BEGIN;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
GRANT SELECT (id, tenant_id, legal_name, trade_name, gstin, state_code, billing_email, billing_address)\n  ON companies TO gst_app;\nGRANT UPDATE (legal_name, trade_name, gstin, state_code, billing_email, billing_address, onboarding_completed_at)
  ON companies TO gst_app;
-- SELECT permission for company listing is provisioned in initial deployment;
-- keep its existing grants intact. Do not grant INSERT/DELETE or tenant_id UPDATE.
COMMIT;
