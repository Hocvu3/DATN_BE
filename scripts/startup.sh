#!/bin/sh

echo "🚀 Starting Secure Document Management System..."

# Check if running in Docker or local
if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "postgres:"; then
    echo "🐳 Running in Docker environment"
    DB_HOST="postgres"
    WAIT_CMD="pg_isready -h postgres -U postgres"
else
    echo "💻 Running in local environment"
    DB_HOST="localhost"
    WAIT_CMD="pg_isready -h localhost -U postgres"
fi

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL..."
until $WAIT_CMD; do
    echo "PostgreSQL is unavailable - sleeping"
    sleep 2
done
echo "✅ PostgreSQL is ready!"

# Run database setup (migrations + seed)
echo "🗄️ Setting up database..."
npm run db:setup

# Apply security policies
echo "🔒 Applying security policies..."
if [ "$DB_HOST" = "postgres" ]; then
    # Docker environment
    psql -U postgres -h postgres -d secure_document_management -f database/init.sql
else
    # Local environment
    psql -U postgres -d secure_document_management -f database/init.sql
fi

# Start application
echo "🚀 Starting application..."
if [ "$NODE_ENV" = "production" ]; then
    npm run start:prod
else
    npm run start:dev
fi