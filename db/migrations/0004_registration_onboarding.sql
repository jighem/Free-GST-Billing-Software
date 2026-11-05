-- M2 foundation: self-service registration state and company registration details.
-- Apply to disposable PostgreSQL dev DB after 0001-0003. No public signup routes yet.
BEGIN;

CREATE TABLE registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  company_legal_name text NOT NULL,
  requested_slug text NOT NULL,
  verification_token_hash char(64) NOT NULL UNIQUE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
  CHECK (requested_slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  CHECK (expires_at > requested_at),
  CHECK (length(company_legal_name) BETWEEN 2 AND 200)
);

-- Incomplete registrations are short-lived; exclude password hashes and
-- verification tokens from logs, analytics, platform dashboards and webhooks.
CREATE INDEX registration_requests_unconsumed_idx
  ON registration_requests (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_address jsonb NOT NULL DEFAULT '{}'::jsonb;

-- A company belongs to the tenant even if it has no GSTIN (unregistered business).
-- GSTIN uniqueness is scoped per tenant by migration 0001.
-- Registration requests are platform-owned; app runtime roles get NO grants.
REVOKE ALL ON registration_requests FROM PUBLIC;
COMMIT;
