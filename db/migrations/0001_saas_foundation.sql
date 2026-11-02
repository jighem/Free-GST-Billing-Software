-- M1 foundation, PostgreSQL 15+. Run only on a NEW EMPTY dedicated development DB.
-- Never run on the legacy JSON-file data or existing Plesk production installation.
-- Apply migration with a dedicated owner role, NOT with the runtime gst_app role.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- The users table is platform-owned; no direct runtime grants. Auth implementation is deferred.

CREATE TABLE tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id),
  UNIQUE (tenant_id, id)
);

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  legal_name text NOT NULL,
  gstin varchar(15),
  state_code varchar(2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, gstin)
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  company_id uuid NOT NULL,
  display_name text NOT NULL,
  gstin varchar(15),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, company_id) REFERENCES companies (tenant_id, id)
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  company_id uuid NOT NULL,
  customer_id uuid,
  invoice_number text NOT NULL,
  financial_year text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('tax_invoice','proforma','credit_note','bill_of_supply','delivery_challan')),
  issued_on date NOT NULL,
  currency char(3) NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','void')),
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, company_id, financial_year, document_type, invoice_number),
  FOREIGN KEY (tenant_id, company_id) REFERENCES companies (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id)
);

CREATE TABLE invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  invoice_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  description text NOT NULL,
  quantity numeric(18,4) NOT NULL,
  unit_price numeric(18,4) NOT NULL,
  tax_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, invoice_id, line_number),
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES invoices (tenant_id, id)
);

-- Tenant context MUST be set by a trusted auth-to-tenant membership check inside
-- every DB transaction: SELECT set_config('app.tenant_id', $1, true);
-- Never accept tenant IDs from unverified request headers.
-- Runtime role must be NON-SUPERUSER, NOBYPASSRLS and not the table owner.
-- FORCE RLS keeps owner access subject to policies; migration owner bypass is disallowed.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenants','tenant_memberships','companies','customers','invoices','invoice_lines']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF t = 'tenants' THEN
      EXECUTE format(
        'CREATE POLICY tenant_scope ON %I FOR ALL USING (id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
        t
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY tenant_scope ON %I FOR ALL USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;

CREATE INDEX ON tenant_memberships (tenant_id, role);
CREATE INDEX ON companies (tenant_id);
CREATE INDEX ON customers (tenant_id, company_id);
CREATE INDEX ON invoices (tenant_id, company_id, issued_on);
CREATE INDEX ON invoice_lines (tenant_id, invoice_id);

COMMIT;

-- Deployment operator must separately provision least-privilege gst_app and grant
-- only necessary schema/table/sequence permissions; never grant BYPASSRLS.
-- No runtime SQL client or tenant endpoints are wired in this first scaffold PR.
