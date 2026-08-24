# Ubuntu + Nginx deployment

Deploy the Profitability Tracker monorepo on an Ubuntu 22.04/24.04 instance with Docker (Postgres/Redis), PM2 (API), and Nginx serving the frontend from `/var/www/tracker`.

## Ports

| Service | Host port |
| --- | --- |
| Web (Nginx, `/var/www/tracker`) | `80` / `443` |
| API (`apps/api`) | `4101` |
| Postgres (Docker) | `6432` → container `5432` |
| Redis (Docker) | `6679` → container `6379` |

Vite still uses `4100` for local `pnpm dev:web`.

## Prerequisites

Install on the server:

- Node.js 20+
- [pnpm](https://pnpm.io/installation) (repo uses `pnpm@10.33.4`)
- Docker Engine + Docker Compose plugin
- PM2 (`npm i -g pm2`)
- Nginx
- Certbot (`python3-certbot-nginx`) for TLS

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
# Install Node 20+, pnpm, Docker, and PM2 per their official docs
```

## First-time setup

1. Clone the repository and enter it:

```bash
git clone <your-repo-url> profitability-tracker
cd profitability-tracker
```

2. Create the **root-only** env file (no app-local `.env` files):

```bash
cp .env.example .env
nano .env
```

Set at least `DATABASE_URL`, `JWT_SECRET`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `CORS_ORIGIN`, and SMTP values if you send mail.

3. Start infrastructure:

```bash
pnpm docker:up
# or: docker compose up -d
```

4. Install, migrate, seed, and build:

```bash
pnpm install
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm turbo build --filter=@workspace/api --filter=web
```

5. Start the API with PM2:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

API listens on **4101**. Nginx serves the built web app from **`/var/www/tracker`**.

## Nginx

The browser always calls **same-origin** `/api/...` (and `/socket.io` for collab). Nest itself has **no** `/api` prefix — Vite (dev) and Nginx (prod) strip it, same as ATS:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:4101/;   # trailing slash strips /api
}
```

So `POST /api/auth/login` becomes `POST /auth/login` on port 4101. If Nginx forwards `/api` *without* stripping, Nest returns `Cannot POST /api/auth/login`. If `/api/` is not proxied at all, the SPA `try_files` returns HTML (dashboard `marginPct` crash, `.map is not a function`) or **405** on POST.

`VITE_API_URL` is not required in production. The built client uses relative `/api`.

### Single domain (path-based)

Example site at `/etc/nginx/sites-available/profitability-tracker`:

```nginx
server {
    listen 80;
    server_name tracker.example.com;

    root /var/www/tracker;
    index index.html;

    client_max_body_size 25M;

    # Nest API — the app calls /api/*; strip the /api prefix
    location /api/ {
        proxy_pass http://127.0.0.1:4101/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4101/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Optional: keep `location = /health` proxying to `http://127.0.0.1:4101/health` if you want a root health URL. `/api/health` already maps to Nest `/health` via the strip.

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/profitability-tracker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Subdomains (optional)

- `app.example.com` → `/var/www/tracker` (same `/api/` strip proxy to 4101)
- `api.example.com` → `127.0.0.1:4101` (no strip; Nest routes are unprefixed)

Set `CORS_ORIGIN` to the web origin when the API is on a different host.

## TLS (Let’s Encrypt)

```bash
sudo certbot --nginx -d tracker.example.com
```

Certbot will adjust the Nginx server block for HTTPS.

## Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Do **not** expose Postgres `6432` or Redis `6679` publicly in production; keep them bound to localhost or a private network.

## Subsequent updates

From the repo root on the server:

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

`scripts/deploy.sh` will:

1. Fail if the git working tree is dirty
2. `git pull --ff-only`
3. `docker compose up -d` and wait for healthy Postgres/Redis
4. `pnpm install --frozen-lockfile`
5. Prisma generate, migrate deploy, and seed
6. Build API + web (web is always rebuilt so a stale `VITE_API_URL` cannot bake `localhost:4101` into the bundle)
7. Publish the web build to `/var/www/tracker`
8. Restart PM2 via `ecosystem.config.cjs`

## Logs and rollback

- API logs: `pm2 logs`
- Nginx: `/var/log/nginx/access.log`, `/var/log/nginx/error.log`
- Docker: `docker compose logs -f postgres redis`

Rollback:

```bash
git log --oneline -n 5
git checkout <previous-commit>
./scripts/deploy.sh
# or: pm2 reload ecosystem.config.cjs
```

## Smoke checks

- Web: `https://tracker.example.com/`
- API health via strip: `curl -s https://tracker.example.com/api/health` → `{"data":{"status":"ok"}}`
- Direct Nest: `curl -s http://127.0.0.1:4101/health`
- Swagger: `https://tracker.example.com/api/docs` (Nest serves `/docs`; Nginx strips `/api`)
- Confirm GET (not `curl -sI` / HEAD):

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://tracker.example.com/api/clients
# expect: 401 application/problem+json

curl -s -X POST http://127.0.0.1:4101/auth/login -H 'Content-Type: application/json' -d '{}'
# expect: 400 validation, not 404
```

If public `/api/auth/login` returns `Cannot POST /api/auth/login`, Nginx is **not** stripping the prefix — `proxy_pass` must end with `http://127.0.0.1:4101/;` (trailing slash). If login returns **405** from Nginx, POST is hitting `location /` instead of `location /api/`.
