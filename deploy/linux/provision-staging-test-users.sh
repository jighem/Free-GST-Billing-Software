#!/usr/bin/env bash
# Only run on the isolated AnytimeGST development server, as root.
set -euo pipefail
DB_CONTAINER=gst-saas-dev-postgres
DB_NAME=gst_saas_dev
SOURCE=/opt/gst-saas-dev/source/deploy/linux/generate-staging-test-users.mjs
PRIVATE=/root/gst-saas-secrets/anytimegst-test-users
BACKUP_DIR=/root/gst-saas-secrets/backups

[ "$(id -u)" = 0 ] || { echo "Run as root on staging only"; exit 1; }
[ -f "$SOURCE" ] || { echo "Source script missing: $SOURCE"; exit 1; }
docker inspect "$DB_CONTAINER" --format '{{.State.Running}}' | grep -qx true
[ -d /root/gst-saas-secrets ] || { echo "Root-only staging secrets directory not found"; exit 1; }

echo "=== VERIFY EXACT STAGING DATABASE ==="
actual="$(docker exec "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -Atc 'SELECT current_database()')"
[ "$actual" = "$DB_NAME" ] || { echo "Unexpected database, aborting"; exit 1; }
existing="$(docker exec "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -Atc "SELECT (SELECT count(*) FROM tenants WHERE slug IN ('gst-test-a','gst-test-b')) + (SELECT count(*) FROM users WHERE email IN ('gst-test-a@example.invalid','gst-test-b@example.invalid'))")"
[ "$existing" = 0 ] || { echo "Test fixtures already exist. Refusing to overwrite."; exit 1; }

umask 077
mkdir -p "$PRIVATE" "$BACKUP_DIR"
chmod 700 "$PRIVATE" "$BACKUP_DIR"
[ ! -e "$PRIVATE/test-users.txt" ] || { echo "Credential file already exists. Refusing to change passwords."; exit 1; }

BACKUP="$BACKUP_DIR/gst_saas_dev_before_test_accounts_$(date +%Y%m%d_%H%M%S).dump"
[ ! -e "$BACKUP" ] || { echo "Backup collision"; exit 1; }
echo "=== BACK UP DEVELOPMENT DATABASE ==="
docker exec "$DB_CONTAINER" pg_dump -U postgres -d "$DB_NAME" -Fc > "$BACKUP"
test -s "$BACKUP"

echo "=== GENERATE AND INSERT SYNTHETIC TEST ACCOUNTS ==="
# The node process writes the passwords directly to a protected folder.
# Only SQL with scrypt password hashes is piped to PostgreSQL; never print passwords.
docker run --rm -i --network none --read-only --cap-drop ALL \
  -v "$PRIVATE:/private:Z" node:22-bookworm-slim node - < "$SOURCE" \
  | docker exec -i "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1

echo "=== VERIFY TEST COMPANY COUNTS ==="
docker exec "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -c "
SELECT t.slug, t.display_name, count(DISTINCT m.user_id) AS owners,
       count(DISTINCT c.id) AS companies
FROM tenants t
JOIN tenant_memberships m ON m.tenant_id=t.id AND m.role='owner'
JOIN companies c ON c.tenant_id=t.id
WHERE t.slug IN ('gst-test-a','gst-test-b')
GROUP BY t.slug,t.display_name
ORDER BY t.slug;"

echo "=== PROVISIONING COMPLETE ==="
echo "Credentials are on the server in $PRIVATE/test-users.txt (mode 600)."
echo "Database backup is $BACKUP."
echo "Do not paste passwords or the credential file into chat or GitHub."
