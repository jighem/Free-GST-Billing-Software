-- AnytimeGST dashboard read-only permissions for tenant-scoped overview.
-- Requires 0001-0009. Does not grant invoice/customer creation or updates.
BEGIN;
GRANT USAGE ON SCHEMA public TO gst_app;
GRANT SELECT (id, tenant_id, legal_name) ON public.companies TO gst_app;
GRANT SELECT (tenant_id, company_id) ON public.customers TO gst_app;
GRANT SELECT (tenant_id, company_id, status) ON public.invoices TO gst_app;
COMMIT;
