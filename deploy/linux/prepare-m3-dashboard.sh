#!/usr/bin/env bash
# Anytime GST M3 — prepare private API and versioned portal candidate.
# No Plesk configuration or existing container is changed automatically.
set -euo pipefail

SRC=/opt/gst-saas-dev/source
DB=gst-saas-dev-postgres
DBNAME=gst_saas_dev
APP_IMAGE=gst-saas-api:m3-dashboard
API_NAME=gst-saas-anytimegst-dashboard-test
API_PORT=14104
PUBLIC_ROOT=/var/www/vhosts/anytimegst.com/staging.anytimegst.com
RELEASE=$PUBLIC_ROOT/portal-m3
BACKUPS=/root/gst-saas-secrets/backups

[ "$(id -u)" -eq 0 ] || { echo 'Run as root via Linux SSH'; exit 1; }
[ -f "$SRC/db/migrations/0009_dashboard_read_permissions.sql" ] ||
  { echo 'M3 source not pulled from GitHub'; exit 1; }
[ -f "$SRC/apps/portal/src/BillingWorkspace.jsx" ] ||
  { echo 'M3 portal source missing'; exit 1; }
[ -f /root/gst-saas-secrets/db-roles.env ] ||
  { echo 'Missing existing private DB role environment file'; exit 1; }
[ -d "$PUBLIC_ROOT" ] || { echo 'Unexpected Plesk frontend webroot'; exit 1; }
[ ! -e "$RELEASE" ] || { echo 'portal-m3 already exists; do not overwrite'; exit 1; }
if docker container inspect "$API_NAME" >/dev/null 2>&1; then
  echo 'Candidate exists already; do not replace'; exit 1
fi
if ss -ltn | grep -Eq ":$API_PORT[[:space:]]"; then
  echo "Host port $API_PORT already occupied"; exit 1
fi
DB_CHECK="$(docker exec "$DB" psql -U postgres -d "$DBNAME" -Atc 'SELECT current_database()')"
[ "$DB_CHECK" = "$DBNAME" ] || { echo 'Database mismatch'; exit 1; }

umask 077
mkdir -p "$BACKUPS"
chmod 700 "$BACKUPS"
BACKUP="$BACKUPS/gst_saas_dev_before_m3_dashboard_$(date +%Y%m%d_%H%M%S).dump"
[ ! -e "$BACKUP" ] || { echo 'Backup collision'; exit 1; }
echo '=== BACK UP STAGING DATABASE ==='
docker exec "$DB" pg_dump -U postgres -d "$DBNAME" -Fc > "$BACKUP"
test -s "$BACKUP"

echo '=== APPLY LEAST-PRIVILEGE M3 MIGRATION ==='
docker exec -i "$DB" psql -U postgres -d "$DBNAME" -v ON_ERROR_STOP=1 \
  < "$SRC/db/migrations/0009_dashboard_read_permissions.sql"

echo '=== VERIFY DATABASE READ PERMISSIONS ==='
docker exec "$DB" psql -U postgres -d "$DBNAME" -v ON_ERROR_STOP=1 -Atc "
SELECT CASE WHEN
 has_column_privilege('gst_app','customers','company_id','SELECT')
 AND has_column_privilege('gst_app','invoices','status','SELECT')
 AND NOT has_table_privilege('gst_auth','invoices','SELECT')
 THEN 'DASHBOARD_ROLE_OK' ELSE 'DASHBOARD_ROLE_FAILED' END" | grep -qx DASHBOARD_ROLE_OK

echo '=== BUILD PRIVATE M3 API IMAGE ==='
docker build -f /opt/gst-saas-dev/backend-kit/Dockerfile.api \
  -t "$APP_IMAGE" "$SRC"

echo '=== START LOCALHOST-ONLY API CANDIDATE ==='
docker run -d --name "$API_NAME" --network gst-saas-dev \
  -p "127.0.0.1:$API_PORT:4100" \
  --env-file /root/gst-saas-secrets/db-roles.env \
  -e NODE_ENV=production -e API_PORT=4100 -e API_BIND_HOST=0.0.0.0 \
  -e ALLOW_CONTAINER_BIND=1 \
  -e CORS_ORIGINS=https://staging.anytimegst.com \
  -e ENABLE_REGISTRATION=0 -e ENABLE_SWAGGER=0 \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 128 --memory 512m --cpus 1 \
  "$APP_IMAGE"

echo '=== TEST PRIVATE API ==='
for attempt in 1 2 3 4 5; do
  if curl --silent --show-error --fail --max-time 5 \
    "http://127.0.0.1:$API_PORT/api/v1/health" >/dev/null; then break; fi
  sleep 1
done
curl --fail --silent --show-error "http://127.0.0.1:$API_PORT/api/v1/health"
echo
BAD_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' \
 "http://127.0.0.1:$API_PORT/api/v1/tenants/11111111-1111-4111-8111-111111111111/companies/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/dashboard")"
[ "$BAD_STATUS" = 401 ] || { echo "Unexpected unauthenticated dashboard HTTP $BAD_STATUS"; exit 1; }

echo '=== AUTHENTICATED TEST A/B ISOLATION ON LOCAL CANDIDATE ==='
PRIVATE=/root/gst-saas-secrets/anytimegst-test-users
[ -r "$PRIVATE/test-users.txt" ] || { echo 'Private test credentials missing'; exit 1; }
docker run --rm -i --network host --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -v "$PRIVATE:/private:ro" \
  node:22-bookworm-slim node --input-type=module - \
  < "$SRC/deploy/linux/test-m3-tenant-dashboard.mjs"

echo '=== BUILD VERSIONED REACT PORTAL ==='
docker run --rm -v "$SRC:/workspace" -w /workspace/apps/portal \
  -e VITE_API_BASE_URL=https://staging-api.anytimegst.com/api/v1 \
  -e VITE_ENABLE_SIGNUP=false \
  node:22-bookworm-slim \
  sh -c 'npm install --no-audit --no-fund && npm run build && node --test tests/*.test.mjs'

test -f "$SRC/apps/portal/dist/index.html"
grep -q 'Anytime GST' "$SRC/apps/portal/dist/index.html"
mkdir -p "$RELEASE"
cp -a "$SRC/apps/portal/dist/." "$RELEASE/"
chown -R --reference="$PUBLIC_ROOT" "$RELEASE"
find "$RELEASE" -type d -exec chmod 755 {} +
find "$RELEASE" -type f -exec chmod 644 {} +
if command -v restorecon >/dev/null 2>&1; then restorecon -RF "$RELEASE"; fi

echo
echo '=== READY TO REVIEW; NO PUBLIC SWITCH MADE ==='
echo "API candidate (localhost only): 127.0.0.1:$API_PORT"
echo "Frontend release: $RELEASE"
echo "DB backup: $BACKUP"
echo 'After verified authenticated A/B dashboard checks, update Plesk API proxy to 14104.'
echo 'Then point Plesk frontend document root to staging.anytimegst.com/portal-m3.'
echo 'Previous API port 14103 and frontend portal-m2 remain rollback choices.'
