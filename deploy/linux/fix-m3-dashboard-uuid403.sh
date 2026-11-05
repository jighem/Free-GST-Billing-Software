#!/usr/bin/env bash
# Fix the M3 dashboard 403 caused by malformed company UUID regex.
# Deploy a new backend candidate; preserve 14104 for rollback.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }
SRC=/opt/gst-saas-dev/source
CONF=/var/www/vhosts/system/staging-api.anytimegst.com/conf/vhost_nginx.conf
NAME=gst-saas-anytimegst-dashboard-uuidfix
IMAGE=gst-saas-api:m3-dashboard-uuidfix
PORT=14105
BACKUP=/root/staging-api-nginx-before-uuidfix-$(date +%Y%m%d-%H%M%S).conf
test -f "$SRC/apps/api/src/modules/tenancy/billing-dashboard.controller.ts"
test -f /root/gst-saas-secrets/db-roles.env
test -r /root/gst-saas-secrets/anytimegst-test-users/test-users.txt
test -f "$CONF"
grep -Fq 'const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;' "$SRC/apps/api/src/modules/tenancy/billing-dashboard.controller.ts" || { echo "Missing reviewed UUID fix"; exit 1; }
grep -Fq 'proxy_pass http://127.0.0.1:14104;' "$CONF" || { echo "Unexpected staging proxy; refusing to change"; exit 1; }
if docker container inspect "$NAME" >/dev/null 2>&1; then echo "Candidate container already exists"; exit 1; fi
if ss -ltn | grep -Eq ":$PORT[[:space:]]"; then echo "Port $PORT already occupied"; exit 1; fi
echo "=== BUILD NEW BACKEND CANDIDATE ==="
docker build -f /opt/gst-saas-dev/backend-kit/Dockerfile.api -t "$IMAGE" "$SRC"
echo "=== START ISOLATED LOCALHOST BACKEND ==="
docker run -d --name "$NAME" --network gst-saas-dev -p "127.0.0.1:$PORT:4100" \
  --env-file /root/gst-saas-secrets/db-roles.env \
  -e NODE_ENV=production -e API_PORT=4100 -e API_BIND_HOST=0.0.0.0 \
  -e ALLOW_CONTAINER_BIND=1 -e CORS_ORIGINS=https://staging.anytimegst.com \
  -e ENABLE_REGISTRATION=0 -e ENABLE_SWAGGER=0 \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 128 --memory 512m --cpus 1 "$IMAGE"
echo "=== HEALTH AND ACCESS CONTROL ==="
for i in 1 2 3 4 5 6 7 8; do
  if curl -fsS --max-time 4 "http://127.0.0.1:$PORT/api/v1/health" >/dev/null; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/api/v1/health"
echo
STATUS=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/v1/tenants/11111111-1111-4111-8111-111111111111/companies/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/dashboard")
[ "$STATUS" = 401 ] || { echo "Unexpected unauthenticated dashboard HTTP $STATUS"; exit 1; }
echo "=== LIVE AUTHENTICATED TENANT A/B DASHBOARD TEST ==="
docker run --rm --network host --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  -v /root/gst-saas-secrets/anytimegst-test-users:/private:ro \
  -v "$SRC/deploy/linux/test-m3-tenant-dashboard.mjs:/test.mjs:ro" \
  -e M3_DASHBOARD_ONLY=1 \
  -e M3_API_BASE="http://127.0.0.1:$PORT/api/v1" \
  node:22-bookworm-slim node /test.mjs
echo "=== SWITCH PUBLIC STAGING API AFTER TEST PASSES ==="
cp -a "$CONF" "$BACKUP"
sed -i "s|127\\.0\\.0\\.1:14104|127.0.0.1:$PORT|g" "$CONF"
if ! nginx -t; then
  cp -a "$BACKUP" "$CONF"; nginx -t; echo "Nginx validation failed, original restored"; exit 1
fi
if ! systemctl reload nginx; then
  cp -a "$BACKUP" "$CONF"; nginx -t; systemctl reload nginx || true
  echo "Reload failed, previous proxy restored"; exit 1
fi
PUBLIC=$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' https://staging-api.anytimegst.com/api/v1/tenants/11111111-1111-4111-8111-111111111111/companies/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/dashboard)
if [ "$PUBLIC" != 401 ]; then
  cp -a "$BACKUP" "$CONF"; nginx -t; systemctl reload nginx
  echo "Public auth test failed HTTP $PUBLIC; proxy rolled back"; exit 1
fi
echo "=== DASHBOARD UUID FIX ACTIVE ON STAGING ==="
grep -n 'proxy_pass' "$CONF"
echo "Previous 14104 container preserved. Proxy rollback file: $BACKUP"
