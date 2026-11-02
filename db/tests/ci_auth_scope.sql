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
