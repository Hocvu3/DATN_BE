#!/bin/bash

# Script to check PostgreSQL database status and diagnose issues
# Version: 1.0

echo "🔍 Checking PostgreSQL database status..."

# Determine if we're in Docker environment
if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "postgres:"; then
    echo "🐳 Running in Docker environment"
    
    # Parse DATABASE_URL to get connection info
    DB_USER=$(echo $DATABASE_URL | sed -n 's/.*postgres:\/\/\([^:]*\):.*/\1/p')
    DB_PASSWORD=$(echo $DATABASE_URL | sed -n 's/.*postgres:\/\/[^:]*:\([^@]*\).*/\1/p')
    DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*postgres:\/\/[^:]*:[^@]*@\([^:]*\).*/\1/p')
    DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*postgres:\/\/[^:]*:[^@]*@[^:]*:\([^\/]*\).*/\1/p')
    DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*postgres:\/\/[^:]*:[^@]*@[^:]*:[^\/]*\/\([^?]*\).*/\1/p')
    
    # Set up connection commands
    WAIT_CMD="pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER"
    PSQL_CONNECT="psql postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/postgres"
else
    echo "💻 Running in local environment"
    DB_HOST="localhost"
    DB_PORT="5432"
    DB_USER="postgres"
    DB_PASSWORD="postgres"
    DB_NAME="secure_document_management"
    
    WAIT_CMD="pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER"
    PSQL_CONNECT="psql -h $DB_HOST -p $DB_PORT -U $DB_USER"
fi

echo "📊 Connection info: Host=$DB_HOST, Port=$DB_PORT, User=$DB_USER, DB=$DB_NAME"

# Check if PostgreSQL is running
echo "🔄 Checking if PostgreSQL is running..."
if $WAIT_CMD; then
    echo "✅ PostgreSQL is running!"
else
    echo "❌ PostgreSQL is NOT running or not reachable!"
    
    # Check container status if in Docker environment
    if command -v docker &> /dev/null; then
        echo "🐳 Checking Docker container status..."
        docker ps -a | grep postgres
        
        echo "🐳 Checking PostgreSQL container logs..."
        POSTGRES_CONTAINER=$(docker ps -a | grep postgres | awk '{print $1}')
        if [ -n "$POSTGRES_CONTAINER" ]; then
            docker logs $POSTGRES_CONTAINER | tail -n 50
        else
            echo "❌ No PostgreSQL container found!"
        fi
    else
        echo "⚠️ Docker not available, skipping container checks"
    fi
fi

# Try to connect to the database
echo "🔌 Attempting to connect to PostgreSQL..."
if $PSQL_CONNECT -c "SELECT 1;" >/dev/null 2>&1; then
    echo "✅ Connection to PostgreSQL successful!"
    
    # Check if our database exists
    echo "🔍 Checking if database '$DB_NAME' exists..."
    DB_EXISTS=$($PSQL_CONNECT -t -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';")
    if [ -n "$DB_EXISTS" ]; then
        echo "✅ Database '$DB_NAME' exists!"
        
        # Check if there are active connections to our database
        echo "🔍 Checking active connections to '$DB_NAME'..."
        CONNECTIONS=$($PSQL_CONNECT -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname='$DB_NAME';")
        echo "ℹ️ Active connections: $CONNECTIONS"
        
        # List all schemas in our database
        echo "🔍 Checking schemas in '$DB_NAME'..."
        $PSQL_CONNECT -c "\c $DB_NAME" -c "\dn"
        
        # Check if our tables exist
        echo "🔍 Checking for Prisma migrations table..."
        $PSQL_CONNECT -c "\c $DB_NAME" -c "\dt _prisma_migrations"
        
    else
        echo "❌ Database '$DB_NAME' does NOT exist!"
    fi
    
    # List all databases
    echo "📋 Listing all databases:"
    $PSQL_CONNECT -c "\l"
    
else
    echo "❌ Connection to PostgreSQL failed!"
fi

echo "✅ Database check completed!"