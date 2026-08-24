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
pnpm turbo build --filter=@workspace/api

echo "==> Building web (forced; VITE_API_URL=${VITE_API_URL:-unset})"
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
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi

pm2 save

# The SPA and the API share hostnames, so /api/ must reach Nest. If Nginx falls
# through to index.html, the frontend parses HTML as JSON and pages break with
# errors like "marginPct is undefined" or "map is not a function".
# An unauthenticated GET must answer with a JSON problem document, not the SPA shell.
if command -v curl >/dev/null 2>&1 && [[ -n "${CORS_ORIGIN:-}" ]]; then
  sleep 3
  PROBE_URL="${CORS_ORIGIN%/}/api/clients"
  PROBE_CT="$(curl -sS -o /dev/null -w '%{content_type}' "$PROBE_URL" || true)"
  case "$PROBE_CT" in
    *json*) ;;
    *)
      echo "WARNING: $PROBE_URL returned '${PROBE_CT:-no content-type}' instead of JSON."
      echo "         Nginx is likely serving the SPA for /api/ instead of proxying to 127.0.0.1:4101."
      echo "         See docs/ubuntu-nginx-deploy.md."
      ;;
  esac
fi

echo "==> Deploy complete"
