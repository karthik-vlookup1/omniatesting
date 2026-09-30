#!/usr/bin/env bash
# Standard startup path for Omnia Recon (hx harness): install, baseline checks, then start.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "==> Working directory: $PWD"
echo "==> Syncing dependencies"
npm ci

echo "==> Running baseline verification (lint + typecheck)"
npm run lint
npm run typecheck

echo "==> Startup: docker compose up -d --wait db && npm run db:migrate && npm run dev:server"
if [ "${RUN_START_COMMAND:-0}" = "1" ]; then
  echo "==> Starting the app"
  docker compose up -d --wait db
  npm run db:migrate
  exec npm run dev:server
fi

echo "Set RUN_START_COMMAND=1 to start the database, apply migrations and launch the API."
