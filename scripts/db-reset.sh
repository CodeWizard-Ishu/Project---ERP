#!/bin/bash
set -e

echo "🗑️  Resetting ERP database..."

# Drop and recreate databases
docker compose exec postgres psql -U erp_user -d postgres -c "DROP DATABASE IF EXISTS erp_db;"
docker compose exec postgres psql -U erp_user -d postgres -c "DROP DATABASE IF EXISTS erp_test;"
docker compose exec postgres psql -U erp_user -d postgres -c "CREATE DATABASE erp_db;"
docker compose exec postgres psql -U erp_user -d postgres -c "CREATE DATABASE erp_test;"

# Re-run init.sql extensions
docker compose exec postgres psql -U erp_user -d erp_db -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; CREATE EXTENSION IF NOT EXISTS \"pgcrypto\"; CREATE EXTENSION IF NOT EXISTS \"pg_trgm\";"
docker compose exec postgres psql -U erp_user -d erp_test -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; CREATE EXTENSION IF NOT EXISTS \"pgcrypto\"; CREATE EXTENSION IF NOT EXISTS \"pg_trgm\";"

echo "✅ Databases recreated"

# Run migrations
echo "🔄 Running migrations..."
pnpm db:migrate:dev

# Run seed
echo "🌱 Running seed..."
pnpm db:seed

echo "✅ Database reset complete!"
