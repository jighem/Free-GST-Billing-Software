-- M2 company setup: profile fields only, guarded by existing FORCE RLS.
-- Apply after migration 0007 in the dedicated staging database.
BEGIN;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
GRANT SELECT (id, tenant_id, legal_name, trade_name, gstin, state_code,
  billing_email, billing_address, onboarding_completed_at)
  ON companies TO gst_app;
GRANT UPDATE (legal_name, trade_name, gstin, state_code,
  billing_email, billing_address, onboarding_completed_at)
  ON companies TO gst_app;
-- No grant of INSERT/DELETE or tenant_id UPDATE.
COMMIT;
