#!/usr/bin/env bash
# Prepare the Anytime GST refresh-safe session release without modifying public Plesk.
# Expects existing Linux Docker staging setup and root-only test account fixture.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run as root on Plesk server"; exit 1; }

SRC=/opt/gst-saas-dev/source
CONF=/var/www/vhosts/system/staging-api.anytimegst.com/conf/vhost_nginx.conf
PUBLIC_ROOT=/var/www/vhosts/anytimegst.com/staging.anytimegst.com
RELEASE="$PUBLIC_ROOT/portal-m3-session"
BACKUPS=/root/gst-saas-secrets/backups
NAME=gst-saas-anytimegst-session-test
IMAGE=gst-saas-api:m3-session
PORT=14106

test -f "$SRC/apps/portal/src/session.js" || { echo "Pull latest branch before running"; exit 1; }
test -f "$SRC/db/migrations/0012_logout_session_revoke.sql"
test -f /root/gst-saas-secrets/db-roles.env
test -r /root/gst-saas-secrets/anytimegst-test-users/test-users.txt
test -f "$CONF"
test -d "$PUBLIC_ROOT"
test -f /opt/gst-saas-dev/backend-kit/Dockerfile.api
[ ! -e "$RELEASE" ] || { echo "Release already exists; refusing overwrite"; exit 1; }
if docker container inspect "$NAME" >/dev/null 2>&1; then echo "Candidate already exists"; exit 1; fi
if ss -ltn | grep -Eq ":$PORT[[:space:]]"; then echo "Candidate port occupied"; exit 1; fi

umask 077
mkdir -p "$BACKUPS"
chmod 700 "$BACKUPS"
BACKUP="$BACKUPS/gst_saas_dev_before_session_refresh_$(date +%Y%m%d_%H%M%S).dump"
echo "=== BACKUP DEDICATED STAGING DB ==="
docker exec gst-saas-dev-postgres pg_dump -U postgres -d gst_saas_dev -Fc > "$BACKUP"
test -s "$BACKUP"

echo "=== APPLY SAFE IDEMPOTENT STAGING MIGRATIONS ==="
for migration in \
  0009_dashboard_read_permissions.sql \
  0010_customer_legacy_contract.sql \
  0011_product_catalog.sql \
  0012_logout_session_revoke.sql; do
  docker exec -i gst-saas-dev-postgres psql -U postgres -d gst_saas_dev -v ON_ERROR_STOP=1 \
    < "$SRC/db/migrations/$migration"
done

echo "=== BUILD AND START PRIVATE API CANDIDATE ==="
docker build -f /opt/gst-saas-dev/backend-kit/Dockerfile.api \
  -t "$IMAGE" "$SRC"
docker run -d --name "$NAME" --network gst-saas-dev \
  -p "127.0.0.1:$PORT:4100" \
  --env-file /root/gst-saas-secrets/db-roles.env \
  -e NODE_ENV=production -e API_PORT=4100 -e API_BIND_HOST=0.0.0.0 \
  -e ALLOW_CONTAINER_BIND=1 -e CORS_ORIGINS=https://staging.anytimegst.com \
  -e ENABLE_REGISTRATION=0 -e ENABLE_SWAGGER=0 \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 128 --memory 512m --cpus 1 "$IMAGE"

for attempt in 1 2 3 4 5 6 7 8; do
  if curl -fsS --max-time 4 "http://127.0.0.1:$PORT/api/v1/health" >/dev/null; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/api/v1/health"
echo

echo "=== TEST BOTH ACCOUNTS, ISOLATION AND SERVER LOGOUT ==="
docker run --rm --network host --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -v /root/gst-saas-secrets/anytimegst-test-users:/private:ro \
  -v "$SRC/deploy/linux/test-m3-tenant-dashboard.mjs:/test.mjs:ro" \
  -e M3_API_BASE="http://127.0.0.1:$PORT/api/v1" \
  node:22-bookworm-slim node /test.mjs

echo "=== BUILD AND TEST REFRESH-SAFE PORTAL ==="
docker run --rm -v "$SRC:/workspace" -w /workspace/apps/portal \
  -e VITE_API_BASE_URL=https://staging-api.anytimegst.com/api/v1 \
  -e VITE_ENABLE_SIGNUP=false \
  node:22-bookworm-slim \
  sh -c 'npm install --no-audit --no-fund && npm run build && node --test tests/*.test.mjs'

test -f "$SRC/apps/portal/dist/index.html"
mkdir "$RELEASE"
cp -a "$SRC/apps/portal/dist/." "$RELEASE/"
chown -R --reference="$PUBLIC_ROOT/portal-public" "$RELEASE"
find "$RELEASE" -type d -exec chmod 755 {} +
find "$RELEASE" -type f -exec chmod 644 {} +
if command -v restorecon >/dev/null 2>&1; then restorecon -RF "$RELEASE"; fi

echo
echo "=== CANDIDATES PREPARED; NO PUBLIC CUTOVER ==="
echo "API candidate: http://127.0.0.1:$PORT/api/v1/health"
echo "Frontend release: $RELEASE"
echo "Backup: $BACKUP"
echo "Active proxy remains:"
grep -n 'proxy_pass' "$CONF"
echo "After a successful candidate test and GitHub CI, change the existing Plesk proxy to port $PORT."
echo "Change frontend document root to staging.anytimegst.com/portal-m3-session."
echo "Keep the prior API port and portal-m2 for immediate rollback."
