#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

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

echo "==> Building apps"
pnpm turbo build --filter=@workspace/api --filter=web

echo "==> Restarting PM2 processes"
if pm2 describe profitability-api >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi

pm2 save
echo "==> Deploy complete"
