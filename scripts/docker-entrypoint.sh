#!/bin/sh
# Apply Prisma migrations to /app/.cache/usage.db, then start the server.
set -e
mkdir -p /app/.cache/models
npx prisma migrate deploy
exec "$@"
