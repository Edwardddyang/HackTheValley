#!/usr/bin/env bash
# One-time setup of a fresh Vultr Ubuntu 24.04 server for ReadReceipt. Run as root:
#   curl -fsSL https://raw.githubusercontent.com/Edwardddyang/HackTheValley/main/deploy/setup.sh -o setup.sh
#   less setup.sh   # read it first
#   bash setup.sh
# Safe to re-run.
set -euo pipefail

REPO=https://github.com/Edwardddyang/HackTheValley.git
BRANCH=${BRANCH:-main}
APP_DIR=/opt/readreceipt

echo "==> Swap (next build needs more than 1 GB of RAM)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Docker and git (from Ubuntu's own packages)"
apt-get update -y
apt-get install -y docker.io docker-compose-v2 git ufw
systemctl enable --now docker

echo "==> Firewall: SSH, HTTP, HTTPS only"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Code"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

if [ ! -f "$APP_DIR/deploy/.env" ]; then
  cp "$APP_DIR/deploy/.env.example" "$APP_DIR/deploy/.env"
  chmod 600 "$APP_DIR/deploy/.env"
  echo
  echo "Created $APP_DIR/deploy/.env. Fill in NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then run:"
  echo "  cd $APP_DIR/deploy && docker compose up -d --build"
  exit 0
fi

echo "==> Build and start"
cd "$APP_DIR/deploy"
docker compose up -d --build
docker compose ps
echo
echo "Done. Once DNS points here, open https://$(grep '^DOMAIN=' .env | cut -d= -f2)"
