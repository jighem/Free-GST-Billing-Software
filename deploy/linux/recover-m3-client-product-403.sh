#!/usr/bin/env bash
# Recover from the 403 Clients/Products candidate test failure.
# Prior containers on 14104/14105/14106 and live Plesk remain unchanged.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }
SRC=/opt/gst-saas-dev/source
ROOT=/var/www/vhosts/anytimegst.com/staging.anytimegst.com
RELEASE="$ROOT/portal-m3-session"
IMAGE=gst-saas-api:m3-session-uuidfix
NAME=gst-saas-anytimegst-session-uuidfix
PORT=14107
CONF=/var/www/vhosts/system/staging-api.anytimegst.com/conf/vhost_nginx.conf
test -r /root/gst-saas-secrets/db-roles.env
test -r /root/gst-saas-secrets/anytimegst-test-users/test-users.txt
test -f "$SRC/apps/api/tests/tenant-uuid-regression.test.mjs"
test -f "$CONF"
test -d "$ROOT/portal-public"
[ ! -e "$RELEASE" ] || { echo "Target frontend release exists, refusing overwrite"; exit 1; }
if docker container inspect "$NAME" >/dev/null 2>&1; then
  echo "Candidate container already exists; refusing replacement"; exit 1
fi
if ss -ltn | grep -Eq ":$PORT[[:space:]]"; then
  echo "Port $PORT already in use"; exit 1
fi

echo "=== VERIFY FIX IS PRESENT ==="
docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  -v "$SRC/apps/api:/workspace:ro" -w /workspace \
  node:22-bookworm-slim node --test tests/tenant-uuid-regression.test.mjs

echo "=== BUILD NEW API WITHOUT TOUCHING CURRENT CONTAINERS ==="
docker build -f /opt/gst-saas-dev/backend-kit/Dockerfile.api -t "$IMAGE" "$SRC"

echo "=== START PRIVATE CANDIDATE ==="
docker run -d --name "$NAME" --network gst-saas-dev \
  -p "127.0.0.1:$PORT:4100" \
  --env-file /root/gst-saas-secrets/db-roles.env \
  -e NODE_ENV=production -e API_PORT=4100 -e API_BIND_HOST=0.0.0.0 \
  -e ALLOW_CONTAINER_BIND=1 -e CORS_ORIGINS=https://staging.anytimegst.com \
  -e ENABLE_REGISTRATION=0 -e ENABLE_SWAGGER=0 \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 128 --memory 512m --cpus 1 "$IMAGE"

for i in 1 2 3 4 5 6 7 8; do
  if curl -fsS --max-time 4 "http://127.0.0.1:$PORT/api/v1/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/api/v1/health"; echo

echo "=== VERIFY A/B DASHBOARD, CUSTOMERS, PRODUCTS AND LOGOUT ==="
docker run --rm --network host --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  -v /root/gst-saas-secrets/anytimegst-test-users:/private:ro \
  -v "$SRC/deploy/linux/test-m3-tenant-dashboard.mjs:/test.mjs:ro" \
  -e M3_API_BASE="http://127.0.0.1:$PORT/api/v1" \
  node:22-bookworm-slim node /test.mjs

echo "=== BUILD FRONTEND RELEASE ==="
docker run --rm -v "$SRC:/workspace" -w /workspace/apps/portal \
  -e VITE_API_BASE_URL=https://staging-api.anytimegst.com/api/v1 \
  -e VITE_ENABLE_SIGNUP=false \
  node:22-bookworm-slim \
  sh -c 'npm install --no-audit --no-fund && npm run build && node --test tests/*.test.mjs'
test -f "$SRC/apps/portal/dist/index.html"
mkdir "$RELEASE"
cp -a "$SRC/apps/portal/dist/." "$RELEASE/"
chown -R --reference="$ROOT/portal-public" "$RELEASE"
find "$RELEASE" -type d -exec chmod 755 {} +
find "$RELEASE" -type f -exec chmod 644 {} +
if command -v restorecon >/dev/null 2>&1; then restorecon -RF "$RELEASE"; fi

echo "=== PREPARED, NO PUBLIC SWITCH ==="
echo "Candidate API 127.0.0.1:$PORT"
echo "Candidate frontend $RELEASE"
echo "Active nginx proxy remains:"
grep 'proxy_pass' "$CONF"
echo "After all checks pass, update the *existing* Plesk proxy to $PORT,"
echo "and set frontend docroot to staging.anytimegst.com/portal-m3-session."
echo "Keep previous API and portal-m2 as rollback."
