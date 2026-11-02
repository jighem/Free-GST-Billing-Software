-- M1 Linux SaaS subscription data foundation.
-- Apply only to a disposable PostgreSQL development/staging DB, after 0001 and 0002.
-- Not a payment integration; entitlements are never inferred from a browser callback.
BEGIN;

CREATE TABLE subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Pricing/provider mappings and taxes will be separate audited billing configuration.

CREATE TABLE tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  plan_id uuid NOT NULL REFERENCES subscription_plans(id),
  status text NOT NULL CHECK (status IN ('pending','trialing','active','past_due','cancelled','expired')),
  valid_from timestamptz,
  valid_until timestamptz,
  external_provider text,
  external_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from),
  UNIQUE (tenant_id, id),
  UNIQUE (external_provider, external_subscription_id)
);
CREATE INDEX tenant_subscriptions_lookup_idx ON tenant_subscriptions (tenant_id, status, valid_until);

CREATE TABLE subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  subscription_id uuid NOT NULL,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload_digest text NOT NULL,
  UNIQUE (provider, provider_event_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, subscription_id) REFERENCES tenant_subscriptions (tenant_id, id)
);

ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON tenant_subscriptions FOR ALL
 USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
 WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON subscription_events FOR ALL
 USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
 WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- No runtime database grants are created here. Only a future trusted billing
-- worker may write subscriptions after server-side verified provider evidence.
COMMIT;
