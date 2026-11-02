-- M3 first dashboard: tenant-safe, read-only counters from existing billing tables.
-- The forked billing UI remains the reference; no legacy local-file APIs exposed.
BEGIN;
GRANT SELECT (id, tenant_id, company_id) ON customers TO gst_app;
GRANT SELECT (id, tenant_id, company_id, status, issued_on) ON invoices TO gst_app;
COMMIT;
