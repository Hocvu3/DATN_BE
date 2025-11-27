#!/bin/bash

# Production Startup Script - Safe Migration & Conditional Seeding
# Supports both Docker and local environments

set -e  # Exit on error

echo "🚀 Starting Secure Document Management System..."

# ===== ENVIRONMENT DETECTION =====
if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "postgres"; then
    echo "🐳 Docker environment detected"
    
    # Parse DATABASE_URL - simplified regex
    DB_USER=$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')
    DB_PASSWORD=$(echo "$DATABASE_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
    DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:]+):.*|\1|')
    DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
    DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+)(\?.*)?$|\1|')
    
    # Debug: show parsed values
    echo "Parsed: User=$DB_USER, Host=$DB_HOST, Port=$DB_PORT, DB=$DB_NAME"
    
    WAIT_CMD="pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER"
    # Export password as environment variable
    export PGPASSWORD="$DB_PASSWORD"
else
    echo "💻 Local environment detected"
    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-5432}"
    DB_USER="${DB_USER:-postgres}"
    DB_PASSWORD="${DB_PASSWORD:-postgres}"
    DB_NAME="${DB_NAME:-datn}"
    
    WAIT_CMD="pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER"
    # Export password as environment variable
    export PGPASSWORD="$DB_PASSWORD"
fi

echo "📊 Database: $DB_NAME @ $DB_HOST:$DB_PORT"

# ===== WAIT FOR DATABASE =====
echo "⏳ Waiting for PostgreSQL..."
MAX_ATTEMPTS=60
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT+1))
    
    if $WAIT_CMD 2>/dev/null; then
        echo "✅ PostgreSQL ready!"
        break
    fi
    
    [ $ATTEMPT -eq 1 ] && echo "Connecting to database..."
    sleep 2
    
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo "❌ Could not connect to PostgreSQL"
        echo "Connection: $DB_HOST:$DB_PORT/$DB_NAME (user: $DB_USER)"
        exit 1
    fi
done

# ===== CHECK DATABASE =====
echo "🔍 Checking database..."
DB_EXISTS=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -t -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';" 2>/dev/null | xargs || echo "")

if [ "$DB_EXISTS" != "1" ]; then
    echo "🆕 Creating database..."
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE \"$DB_NAME\";" || exit 1
    echo "✅ Database created"
    DB_IS_NEW=true
else
    echo "✅ Database exists"
    DB_IS_NEW=false
fi

# ===== PRISMA SETUP =====
echo "📋 Generating Prisma client..."
npx prisma generate || exit 1

# ===== CHECK TABLES =====
echo "🔍 Checking database state..."
TABLE_COUNT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" 2>/dev/null | xargs || echo "0")

echo "📊 Found $TABLE_COUNT tables"

if [ "$TABLE_COUNT" -eq "0" ]; then
    echo "🆕 Empty database - initializing..."
    
    # Push schema (creates tables based on Prisma schema)
    echo "📊 Pushing schema..."
    npx prisma db push --accept-data-loss || exit 1
    
    # Apply RLS policies from init.sql AFTER tables are created
    echo "🔒 Applying RLS policies..."
    if [ -f "./database/init.sql" ]; then
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f ./database/init.sql || {
            echo "⚠️ RLS setup failed, continuing..."
        }
    else
        echo "⚠️ init.sql not found, skipping RLS setup"
    fi
    
    # Seed data
    echo "🌱 Seeding data..."
    npm run db:seed || echo "⚠️ Seed failed (continuing)"
    
    echo "✅ Database initialized"
else
    echo "📊 Database has data - migrating..."
    
    # Deploy migrations
    echo "🔄 Deploying migrations..."
    npx prisma migrate deploy || {
        echo "⚠️ Migration issues, resolving..."
        npx prisma migrate resolve --applied 2>/dev/null || true
        npx prisma migrate deploy || echo "⚠️ Some migrations failed"
    }
    
    # Check if needs seeding
    echo "🔍 Checking seed data..."
    USER_COUNT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM \"User\" WHERE email='admin@docuflow.com';" 2>/dev/null | xargs || echo "0")
    USER_COUNT=${USER_COUNT:-0}
    
    if [ "$USER_COUNT" -eq "0" ]; then
        echo "🌱 Seeding data..."
        npm run db:seed || echo "⚠️ Seed failed"
    else
        echo "✅ Already seeded"
    fi
    
    echo "✅ Migration complete"
fi

# ===== START APP =====
echo ""
echo "🚀 Starting application..."
echo "Environment: ${NODE_ENV:-development}"
echo "======================================"

if [ "$NODE_ENV" = "production" ]; then
    exec node dist/main
else
    exec npm run start:dev
fi
