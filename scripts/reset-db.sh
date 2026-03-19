#!/usr/bin/env bash
# Reset the dungeon database: drop schemas, clear migration history, and restart server.
# Usage: ./scripts/reset-db.sh

set -euo pipefail

DB_URL="${DATABASE_URL:-postgres://dungeon:dungeon@localhost:5432/dungeon}"

echo "⚠️  This will DROP all data in the dungeon database."
read -rp "Continue? [y/N] " confirm
if [[ "$confirm" != [yY] ]]; then
  echo "Aborted."
  exit 0
fi

echo "Dropping schemas..."
psql "$DB_URL" <<SQL
DROP SCHEMA IF EXISTS "characters" CASCADE;
DROP SCHEMA IF EXISTS "world" CASCADE;
DROP TABLE IF EXISTS "drizzle"."__drizzle_migrations" CASCADE;
DROP SCHEMA IF EXISTS "drizzle" CASCADE;
SQL

echo "✅ Database reset. Start the server to re-run migrations."
