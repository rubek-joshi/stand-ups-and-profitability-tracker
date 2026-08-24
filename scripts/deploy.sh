#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEB_ROOT="${WEB_ROOT:-/var/www/tracker}"

if [[ ! -f .env ]]; then
  echo "Missing root .env. Copy .env.example to .env and fill in values."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit or stash changes before deploying."
  exit 1
fi

echo "==> Pulling latest changes"
git pull --ff-only

echo "==> Starting Postgres and Redis"
docker compose up -d

echo "==> Waiting for Postgres"
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-postgres}" >/dev/null 2>&1; do
  sleep 2
done

echo "==> Waiting for Redis"
until docker compose exec -T redis redis-cli ping | grep -q PONG; do
  sleep 2
done

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Generating Prisma client"
pnpm db:generate

echo "==> Applying migrations"
pnpm db:deploy

echo "==> Seeding database"
pnpm db:seed

# Vite inlines VITE_* at build time from the root .env (see apps/web vite envDir).
set -a
# shellcheck source=/dev/null
source "$ROOT_DIR/.env"
set +a

echo "==> Building API"
rm -rf apps/api/dist
pnpm turbo build --filter=@workspace/api --force
if [[ ! -f apps/api/dist/main.js ]]; then
  echo "ERROR: API build did not emit dist/main.js."
  exit 1
fi

echo "==> Building web (forced; browser calls same-origin /api, Vite/Nginx strip the prefix)"
rm -rf apps/web/dist apps/web/.output
pnpm turbo build --filter=web --force

if [[ -d apps/web/dist/client ]]; then
  WEB_DIST="apps/web/dist/client"
elif [[ -d apps/web/dist ]]; then
  WEB_DIST="apps/web/dist"
else
  echo "Web build output not found (apps/web/dist)."
  exit 1
fi

echo "==> Publishing frontend to $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
if command -v rsync >/dev/null 2>&1; then
  sudo rsync -a --delete "$WEB_DIST/" "$WEB_ROOT/"
else
  sudo find "$WEB_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  sudo cp -a "$WEB_DIST"/. "$WEB_ROOT/"
fi
if [[ -f "$WEB_ROOT/_shell.html" && ! -f "$WEB_ROOT/index.html" ]]; then
  sudo cp "$WEB_ROOT/_shell.html" "$WEB_ROOT/index.html"
fi
sudo chown -R www-data:www-data "$WEB_ROOT"

if [[ "${VITE_API_URL:-}" != *localhost:4101* ]] && grep -Rqs "localhost:4101" "$WEB_ROOT"; then
  echo "ERROR: published frontend still references http://localhost:4101. Check VITE_API_URL and rebuild."
  exit 1
fi

echo "==> Restarting PM2 processes"
if pm2 describe profitability-api >/dev/null 2>&1; then
  pm2 restart ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
sleep 2
LOGIN_PROBE="$(curl -sS -X POST http://127.0.0.1:4101/auth/login -H 'Content-Type: application/json' -d '{}' || true)"
if echo "$LOGIN_PROBE" | grep -q 'Cannot POST /auth/login'; then
  echo "ERROR: PM2 is not serving POST /auth/login. Check git pull, dist/, and pm2 logs."
  echo "$LOGIN_PROBE"
  exit 1
fi

pm2 save

# The SPA and the API share a hostname. Nginx must proxy /api/ to Nest and
# strip the prefix (proxy_pass ...4101/;). If it falls through to index.html,
# the frontend parses HTML as JSON (marginPct undefined, .map is not a function).
if command -v curl >/dev/null 2>&1 && [[ -n "${CORS_ORIGIN:-}" ]]; then
  sleep 3
  PROBE_URL="${CORS_ORIGIN%/}/api/clients"
  PROBE_BODY="$(curl -sS "$PROBE_URL" || true)"
  PROBE_CT="$(curl -sS -o /dev/null -w '%{content_type}' "$PROBE_URL" || true)"
  if echo "$PROBE_BODY" | grep -q 'Cannot GET /api/clients'; then
    echo "WARNING: $PROBE_URL reached Nest without stripping /api."
    echo "         Use: location /api/ { proxy_pass http://127.0.0.1:4101/; }"
  elif echo "$PROBE_CT" | grep -qv json; then
    echo "WARNING: $PROBE_URL returned '${PROBE_CT:-no content-type}' instead of JSON."
    echo "         Nginx is likely serving the SPA for /api/. See docs/ubuntu-nginx-deploy.md."
  fi
fi

echo "==> Deploy complete"
