#!/bin/sh
# Container entrypoint: applies idempotent DB migrations, then exec's the CMD.
# Runs as the non-root `wannabet` user defined in the Dockerfile.
set -e

cd /app

echo "[wannabet] Applying database migrations..."
node /app/dist/db/migrate.js

echo "[wannabet] Starting: $*"
exec "$@"
