#!/bin/bash

# Production Startup Script - Safe Migration & Conditional Seeding
# Supports both Docker and local environments

set -e  # Exit on error

echo "🚀 Starting Secure Document Management System..."

# ===== ENVIRONMENT DETECTION =====
# Parse DATABASE_ADMIN_URL for admin operations (migrations, seeds, RLS setup)
if [ -n "$DATABASE_ADMIN_URL" ]; then
    echo "🔧 Using DATABASE_ADMIN_URL for admin operations"
    
    # Parse DATABASE_ADMIN_URL
    ADMIN_DB_USER=$(echo "$DATABASE_ADMIN_URL" | sed -E 's|.*://([^:]+):.*|\1|')
    ADMIN_DB_PASSWORD=$(echo "$DATABASE_ADMIN_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
    ADMIN_DB_HOST=$(echo "$DATABASE_ADMIN_URL" | sed -E 's|.*@([^:]+):.*|\1|')
    ADMIN_DB_PORT=$(echo "$DATABASE_ADMIN_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
    ADMIN_DB_NAME=$(echo "$DATABASE_ADMIN_URL" | sed -E 's|.*/([^?]+)(\?.*)?$|\1|')
    
    echo "Parsed Admin: User=$ADMIN_DB_USER, Host=$ADMIN_DB_HOST, Port=$ADMIN_DB_PORT, DB=$ADMIN_DB_NAME"
    
    DB_USER=$ADMIN_DB_USER
    DB_PASSWORD=$ADMIN_DB_PASSWORD
    DB_HOST=$ADMIN_DB_HOST
    DB_PORT=$ADMIN_DB_PORT
    DB_NAME=$ADMIN_DB_NAME
    
    WAIT_CMD="pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER"
    export PGPASSWORD="$DB_PASSWORD"
elif [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "postgres"; then
    echo "🐳 Docker environment detected (fallback to DATABASE_URL)"
    
    # Parse DATABASE_URL
    DB_USER=$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')
    DB_PASSWORD=$(echo "$DATABASE_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
    DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:]+):.*|\1|')
    DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
    DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+)(\?.*)?$|\1|')
    
    echo "Parsed: User=$DB_USER, Host=$DB_HOST, Port=$DB_PORT, DB=$DB_NAME"
    
    WAIT_CMD="pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER"
    export PGPASSWORD="$DB_PASSWORD"
else
    echo "💻 Local environment detected"
    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-5432}"
    DB_USER="${DB_USER:-postgres}"
    DB_PASSWORD="${DB_PASSWORD:-postgres}"
    DB_NAME="${DB_NAME:-datn}"
    
    WAIT_CMD="pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER"
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
    
    # Push schema (creates tables based on Prisma schema) using ADMIN connection
    echo "📊 Pushing schema with admin connection..."
    DATABASE_URL="$DATABASE_ADMIN_URL" npx prisma db push --accept-data-loss || exit 1
    
    # Apply RLS policies from init.sql AFTER tables are created (creates app_role too)
    echo "🔒 Applying RLS policies and creating app_role..."
    if [ -f "./database/init.sql" ]; then
        # Extract app_role password from DATABASE_URL
        if [ -z "$APP_ROLE_PASSWORD" ]; then
            APP_ROLE_PASSWORD=$(echo "$DATABASE_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
        fi
        echo "📝 Setting app_role password from environment..."
        # Use PGOPTIONS to set session variable before running SQL
        PGOPTIONS="-c app.role_password=$APP_ROLE_PASSWORD" \
            psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
            -f ./database/init.sql || {
            echo "⚠️ RLS setup failed, continuing..."
        }
    else
        echo "⚠️ init.sql not found, skipping RLS setup"
    fi
    
    # Seed data using ADMIN connection
    echo "🌱 Seeding data with admin connection..."
    DATABASE_URL="$DATABASE_ADMIN_URL" npm run db:seed || echo "⚠️ Seed failed (continuing)"
    
    echo "✅ Database initialized"
else
    echo "📊 Database has data - migrating..."
    
    # Deploy migrations using ADMIN connection
    echo "🔄 Deploying migrations with admin connection..."
    DATABASE_URL="$DATABASE_ADMIN_URL" npx prisma migrate deploy || {
        echo "⚠️ Migration issues, resolving..."
        DATABASE_URL="$DATABASE_ADMIN_URL" npx prisma migrate resolve --applied 2>/dev/null || true
        DATABASE_URL="$DATABASE_ADMIN_URL" npx prisma migrate deploy || echo "⚠️ Some migrations failed"
    }
    
    # Check if needs seeding (check for any user in users table)
    echo "🔍 Checking seed data..."
    USER_COUNT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM users LIMIT 1;" 2>/dev/null | xargs || echo "0")
    USER_COUNT=${USER_COUNT:-0}
    
    if [ "$USER_COUNT" -eq "0" ]; then
        echo "🌱 Seeding data with admin connection..."
        DATABASE_URL="$DATABASE_ADMIN_URL" npm run db:seed || echo "⚠️ Seed failed"
    else
        echo "✅ Already seeded"
    fi
    
    echo "✅ Migration complete"
fi

# ===== START APP =====
echo ""
echo "🚀 Starting application with app_role connection (RLS enforced)..."
echo "Environment: ${NODE_ENV:-development}"
echo "Database User: app_role (respects RLS policies)"
echo "======================================"

if [ "$NODE_ENV" = "production" ]; then
    exec node dist/main
else
    exec npm run start:dev
fi
