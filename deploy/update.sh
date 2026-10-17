#!/usr/bin/env bash
# Redeploy the latest main (or BRANCH=...) on the server. Run as root from anywhere:
#   bash /opt/blockbrief/deploy/update.sh
set -euo pipefail
APP_DIR=/opt/blockbrief
BRANCH=${BRANCH:-main}

git -C "$APP_DIR" fetch origin "$BRANCH"
git -C "$APP_DIR" checkout "$BRANCH"
git -C "$APP_DIR" reset --hard "origin/$BRANCH"
cd "$APP_DIR/deploy"
docker compose up -d --build
docker image prune -f
docker compose ps
