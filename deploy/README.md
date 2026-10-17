# Deploying to Vultr at readreceipt.work

One Ubuntu server runs two containers: the Next.js app, and Caddy in front of it. Caddy
serves the domain and gets HTTPS certificates by itself. The database stays on Supabase.

## 1. Create the server (Vultr dashboard)

- **Deploy New Server → Cloud Compute (Shared CPU)**, any Toronto/Chicago/New York location.
- **Image:** Ubuntu 24.04 LTS x64.
- **Plan:** the 1 GB plan works (setup adds 2 GB of swap for the build); 2 GB builds faster.
- Add your **SSH key** if you have one (otherwise use the root password Vultr shows).
- After it boots, copy its **IPv4 address**.

## 2. Point the domain at it (GoDaddy → My Products → readreceipt.work → DNS)

| Type | Name | Value |
|---|---|---|
| A | `@` | the server's IPv4 address |
| CNAME | `www` | `readreceipt.work` |

Delete any existing "Parked" A record for `@` first. Check with `nslookup readreceipt.work`;
it usually updates within minutes (can take a few hours).

## 3. Set up the server

```sh
ssh root@<server-ip>
curl -fsSL https://raw.githubusercontent.com/Edwardddyang/HackTheValley/main/deploy/setup.sh -o setup.sh
less setup.sh          # read what it does
bash setup.sh          # first run creates /opt/rentreceipts/deploy/.env and stops
nano /opt/rentreceipts/deploy/.env   # paste NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
cd /opt/rentreceipts/deploy && docker compose up -d --build
```

The first build takes a few minutes. Then open https://readreceipt.work. If DNS wasn't
pointing at the server yet when Caddy started, it retries the certificate on its own.

## Updating

After pushing to `main`: `ssh root@<server-ip> bash /opt/rentreceipts/deploy/update.sh`

## Checking on it

```sh
cd /opt/rentreceipts/deploy
docker compose ps            # both containers "running"
docker compose logs -f web   # app logs
docker compose logs -f caddy # certificate / proxy logs
```

## What's where

| File | Purpose |
|---|---|
| `web/Dockerfile` | Builds the app; `NEXT_PUBLIC_*` values are passed in at build time |
| `deploy/docker-compose.yml` | App + Caddy; only Caddy's ports 80/443 are public |
| `deploy/Caddyfile` | Domain, HTTPS, `www` → apex redirect, streaming pass-through |
| `deploy/setup.sh` | One-time server setup: swap, Docker, firewall, clone |
| `deploy/update.sh` | Pull the latest code and rebuild |
| `deploy/.env` | On the server only (gitignored): domain and Supabase publishable key |
