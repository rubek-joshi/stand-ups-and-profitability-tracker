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

### Single domain (path-based)

Example site at `/etc/nginx/sites-available/profitability-tracker`:

```nginx
server {
    listen 80;
    server_name tracker.example.com;

    root /var/www/tracker;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4101/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health and auth are not under /api/* by default
    location ~ ^/(auth|health|api) {
        proxy_pass http://127.0.0.1:4101;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
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

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/profitability-tracker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Subdomains (optional)

- `app.example.com` → `/var/www/tracker`
- `api.example.com` → `127.0.0.1:4101`

Set `CORS_ORIGIN` to the web origin (e.g. `https://app.example.com`).

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
6. Build API + web
7. Publish the web build to `/var/www/tracker`
8. Reload/start PM2 via `ecosystem.config.cjs`

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
- API health: `https://tracker.example.com/health`
- Swagger: `https://tracker.example.com/api/docs` (or `http://127.0.0.1:4101/api/docs` on the host)
