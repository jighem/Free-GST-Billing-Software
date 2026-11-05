-- Disposable CI only. Apply after ci_seed and migration 0007.
\set ON_ERROR_STOP on
INSERT INTO users (id, email, password_hash) VALUES
 ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa','auth-a@example.invalid','synthetic'),
 ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb','auth-b@example.invalid','synthetic');
INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa','owner'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb','owner');

-- Validate restricted identity columns and absence of financial/registration privileges.
DO $$
BEGIN
 IF NOT has_column_privilege('gst_auth','users','email','SELECT')
   OR NOT has_column_privilege('gst_auth','users','password_hash','SELECT')
   OR NOT has_column_privilege('gst_auth','user_sessions','token_hash','SELECT')
   OR NOT has_column_privilege('gst_auth','user_sessions','token_hash','INSERT') THEN
   RAISE EXCEPTION 'Missing required authentication column privileges';
 END IF;
 IF has_table_privilege('gst_auth','companies','SELECT')
   OR has_table_privilege('gst_auth','registration_requests','SELECT') THEN
   RAISE EXCEPTION 'Auth role has forbidden business/registration privileges';
 END IF;
END $$;

SET ROLE gst_auth;
BEGIN;
SELECT set_config('app.auth_user_id','aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',true);
DO $$
DECLARE count_visible integer;
BEGIN
 SELECT count(*) INTO count_visible FROM tenant_memberships;
 IF count_visible <> 1 THEN RAISE EXCEPTION 'Auth A must see only A membership, got %', count_visible; END IF;
 SELECT count(*) INTO count_visible FROM tenants;
 IF count_visible <> 1 THEN RAISE EXCEPTION 'Auth A must see only A tenant, got %', count_visible; END IF;
END $$;
ROLLBACK;
RESET ROLE;

-- Pooled session must not retain user A after transaction ends.
SET ROLE gst_auth;
BEGIN;
DO $$
DECLARE count_visible integer;
BEGIN
 SELECT count(*) INTO count_visible FROM tenant_memberships;
 IF count_visible <> 0 THEN RAISE EXCEPTION 'Unscoped membership query leaked % rows', count_visible; END IF;
 SELECT count(*) INTO count_visible FROM tenants;
 IF count_visible <> 0 THEN RAISE EXCEPTION 'Unscoped tenant query leaked % rows', count_visible; END IF;
END $$;
ROLLBACK;
RESET ROLE;

SET ROLE gst_auth;
BEGIN;
SELECT set_config('app.auth_user_id','bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',true);
DO $$
DECLARE count_visible integer;
BEGIN
 SELECT count(*) INTO count_visible FROM tenant_memberships
  WHERE tenant_id='22222222-2222-4222-8222-222222222222';
 IF count_visible <> 1 THEN RAISE EXCEPTION 'Auth B cannot see own membership'; END IF;
 SELECT count(*) INTO count_visible FROM tenant_memberships
  WHERE tenant_id='11111111-1111-4111-8111-111111111111';
 IF count_visible <> 0 THEN RAISE EXCEPTION 'Auth B can see A membership'; END IF;
 SELECT count(*) INTO count_visible FROM tenants
  WHERE id='11111111-1111-4111-8111-111111111111';
 IF count_visible <> 0 THEN RAISE EXCEPTION 'Auth B can see A tenant'; END IF;
 SELECT count(*) INTO count_visible FROM tenants
  WHERE id='22222222-2222-4222-8222-222222222222';
 IF count_visible <> 1 THEN RAISE EXCEPTION 'Auth B cannot see own tenant'; END IF;
END $$;
ROLLBACK;
RESET ROLE;
