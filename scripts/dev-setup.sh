#!/bin/bash
set -e

echo "🚀 Setting up ERP development environment..."

# Check prerequisites
command -v docker &>/dev/null || { echo "❌ Docker not installed"; exit 1; }
command -v pnpm &>/dev/null || { echo "❌ pnpm not installed. Run: npm install -g pnpm@9"; exit 1; }
command -v node &>/dev/null || { echo "❌ Node.js not installed"; exit 1; }

NODE_VERSION=$(node -v | cut -d. -f1 | tr -d 'v')
[ "$NODE_VERSION" -lt 20 ] && { echo "❌ Node.js 20+ required"; exit 1; }

# Copy env file
[ ! -f .env ] && cp .env.example .env && echo "✅ Created .env from .env.example"

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Start infrastructure
echo "🐳 Starting Docker services..."
docker compose up -d postgres redis

# Wait for postgres
echo "⏳ Waiting for PostgreSQL..."
until docker compose exec postgres pg_isready -U erp_user -d erp_db &>/dev/null; do
  sleep 1
done
echo "✅ PostgreSQL ready"

# Wait for redis
echo "⏳ Waiting for Redis..."
until docker compose exec redis redis-cli ping | grep -q PONG; do
  sleep 1
done
echo "✅ Redis ready"

# Generate Prisma client
echo "🔧 Generating Prisma client..."
pnpm --filter @erp/api db:generate

# Run migrations
echo "🔄 Running database migrations..."
pnpm db:migrate:dev

echo ""
echo "✅ Dev environment ready!"
echo "   API:     http://localhost:3000"
echo "   Web:     http://localhost:5173"
echo "   pgAdmin: http://localhost:5050 (run: docker compose --profile tools up -d)"
echo ""
echo "Start development: pnpm dev"
