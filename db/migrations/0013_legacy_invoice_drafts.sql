-- Original fork invoice object preserved for reversible draft editing.
-- Do not trust client-side totals for statutory issue or reporting.
BEGIN;
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS legacy_document jsonb NOT NULL DEFAULT '{}'::jsonb;
GRANT SELECT (id,tenant_id,company_id,invoice_number,financial_year,document_type,
  issued_on,currency,status,legacy_document,created_at) ON invoices TO gst_app;
GRANT INSERT (tenant_id,company_id,invoice_number,financial_year,document_type,
  issued_on,currency,status,legacy_document) ON invoices TO gst_app;
GRANT UPDATE (legacy_document,issued_on,currency) ON invoices TO gst_app;
-- Existing FORCE RLS and unique numbering constraints remain enforced.
COMMIT;
