#!/bin/bash

# Script to check PostgreSQL database status and diagnose issues
# Version: 1.1 - EC2 Compatible

echo "🔍 Checking PostgreSQL database status..."

# Check if we're running in Docker container or host
IS_CONTAINER=0
if [ -f "/.dockerenv" ]; then
    IS_CONTAINER=1
    echo "🐳 Running inside a Docker container"
else
    echo "💻 Running on host machine"
fi

# Determine if we're in Docker environment
if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "postgres:"; then
    echo "🐳 Using Docker environment variables"
    
    # Parse DATABASE_URL to get connection info
    DB_USER=$(echo $DATABASE_URL | sed -n 's/.*postgres:\/\/\([^:]*\):.*/\1/p')
    DB_PASSWORD=$(echo $DATABASE_URL | sed -n 's/.*postgres:\/\/[^:]*:\([^@]*\).*/\1/p')
    DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*postgres:\/\/[^:]*:[^@]*@\([^:]*\).*/\1/p')
    DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*postgres:\/\/[^:]*:[^@]*@[^:]*:\([^\/]*\).*/\1/p')
    DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*postgres:\/\/[^:]*:[^@]*@[^:]*:[^\/]*\/\([^?]*\).*/\1/p')
else
    echo "💻 Using default connection parameters"
    DB_HOST="postgres"  # Use 'postgres' as the hostname in Docker network
    DB_PORT="5432"
    DB_USER="postgres"
    DB_PASSWORD="password"
    DB_NAME="secure_document_management"
fi

# Use docker exec instead of direct psql for more reliable checks from host
if command -v docker &> /dev/null && [ $IS_CONTAINER -eq 0 ]; then
    echo "🐳 Using Docker to check database"
    POSTGRES_CONTAINER=$(docker ps | grep postgres | awk '{print $1}')
    if [ -n "$POSTGRES_CONTAINER" ]; then
        WAIT_CMD="docker exec $POSTGRES_CONTAINER pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER"
        PSQL_CMD="docker exec $POSTGRES_CONTAINER psql -U $DB_USER"
        PSQL_CONNECT="docker exec $POSTGRES_CONTAINER psql -U $DB_USER -d postgres"
    else
        echo "⚠️ No PostgreSQL container found, using direct connection"
        WAIT_CMD="nc -z $DB_HOST $DB_PORT" # Use netcat as fallback
        PSQL_CONNECT="psql -h $DB_HOST -p $DB_PORT -U $DB_USER"
    fi
else
    # Check if pg_isready is available
    if command -v pg_isready &> /dev/null; then
        WAIT_CMD="pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER"
    else
        echo "⚠️ pg_isready not found, using netcat as fallback"
        WAIT_CMD="nc -z $DB_HOST $DB_PORT" # Use netcat as fallback
    fi
    
    # Check if psql is available
    if command -v psql &> /dev/null; then
        PSQL_CONNECT="psql -h $DB_HOST -p $DB_PORT -U $DB_USER"
    else
        echo "⚠️ psql not found, will rely on Docker checks only"
        PSQL_CONNECT="echo 'psql not available'"
    fi
fi

echo "📊 Connection info: Host=$DB_HOST, Port=$DB_PORT, User=$DB_USER, DB=$DB_NAME"

# Check Docker container status first
if command -v docker &> /dev/null; then
    echo "� Checking Docker container status..."
    docker ps -a | grep postgres
    
    POSTGRES_CONTAINER=$(docker ps -a | grep postgres | head -n1 | awk '{print $1}')
    if [ -n "$POSTGRES_CONTAINER" ]; then
        CONTAINER_STATUS=$(docker inspect -f '{{.State.Status}}' $POSTGRES_CONTAINER)
        CONTAINER_HEALTH=$(docker inspect -f '{{.State.Health.Status}}' $POSTGRES_CONTAINER 2>/dev/null || echo "N/A")
        echo "🐳 PostgreSQL container status: $CONTAINER_STATUS (Health: $CONTAINER_HEALTH)"
        
        # Check if container is running
        if [ "$CONTAINER_STATUS" = "running" ]; then
            echo "✅ PostgreSQL container is running!"
            
            # Try to ping PostgreSQL inside container
            echo "🔄 Checking PostgreSQL connection inside container..."
            if docker exec $POSTGRES_CONTAINER pg_isready -h localhost -U postgres; then
                echo "✅ PostgreSQL server is responding inside container!"
            else
                echo "❌ PostgreSQL server is NOT responding inside container!"
            fi
        else
            echo "❌ PostgreSQL container is NOT running!"
        fi
    else
        echo "❌ No PostgreSQL container found!"
    fi
fi

# Check if PostgreSQL is running
echo "🔄 Checking if PostgreSQL is running..."
if $WAIT_CMD; then
    echo "✅ PostgreSQL is running!"
else
    echo "❌ PostgreSQL is NOT running or not reachable from this location!"
    
    # Show container logs if Docker is available
    if command -v docker &> /dev/null && [ -n "$POSTGRES_CONTAINER" ]; then
        echo "🐳 Checking PostgreSQL container logs..."
        docker logs $POSTGRES_CONTAINER | tail -n 50
        
        # Check container network
        echo "🔌 Checking container network..."
        docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $POSTGRES_CONTAINER
        
        # Show container environment variables
        echo "🌍 Checking container environment..."
        docker exec $POSTGRES_CONTAINER env | grep -i postgres
    fi
fi

# Try to connect to the database directly or through container
echo "🔌 Attempting to connect to PostgreSQL..."

# Define a function to execute SQL safely
execute_sql() {
    local command=$1
    local sql=$2
    local db=$3
    
    if [ -z "$db" ]; then
        db="postgres"
    fi
    
    if command -v docker &> /dev/null && [ -n "$POSTGRES_CONTAINER" ]; then
        docker exec $POSTGRES_CONTAINER psql -U postgres -d $db -c "$sql" 2>/dev/null
        return $?
    else
        $command -c "$sql" 2>/dev/null
        return $?
    fi
}

# Try to connect and run a test query
if execute_sql "$PSQL_CONNECT" "SELECT 1;" > /dev/null; then
    echo "✅ Connection to PostgreSQL successful!"
    
    # Check if our database exists
    echo "🔍 Checking if database '$DB_NAME' exists..."
    DB_EXISTS=$(execute_sql "$PSQL_CONNECT" "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';" | grep -v row)
    
    if [ -n "$DB_EXISTS" ] || execute_sql "$PSQL_CONNECT" "\l" | grep -q "$DB_NAME"; then
        echo "✅ Database '$DB_NAME' exists!"
        
        # Check if there are active connections to our database
        echo "🔍 Checking active connections to '$DB_NAME'..."
        CONNECTIONS=$(execute_sql "$PSQL_CONNECT" "SELECT count(*) FROM pg_stat_activity WHERE datname='$DB_NAME';")
        echo "ℹ️ Active connections: $CONNECTIONS"
        
        # Check for Prisma migrations table
        echo "🔍 Checking for Prisma migrations table..."
        MIGRATIONS=$(execute_sql "$PSQL_CONNECT" "\c $DB_NAME; \dt _prisma_migrations" "$DB_NAME")
        
        if echo "$MIGRATIONS" | grep -q "_prisma_migrations"; then
            echo "✅ Prisma migrations table exists!"
        else
            echo "❌ Prisma migrations table does NOT exist! This may indicate schema issues."
        fi
        
    else
        echo "❌ Database '$DB_NAME' does NOT exist!"
    fi
    
    # List all databases
    echo "📋 Listing all databases:"
    execute_sql "$PSQL_CONNECT" "\l"
    
else
    echo "❌ Connection to PostgreSQL failed!"
    
    # If Docker is available, try connecting from inside the container
    if command -v docker &> /dev/null && [ -n "$POSTGRES_CONTAINER" ]; then
        echo "🔄 Trying to connect from inside the container..."
        if docker exec $POSTGRES_CONTAINER psql -U postgres -c "SELECT 1;" > /dev/null 2>&1; then
            echo "✅ PostgreSQL works inside the container but not from outside!"
            echo "👉 This indicates a network or Docker configuration issue."
            
            # Try more commands inside container
            echo "📋 Listing databases from inside container:"
            docker exec $POSTGRES_CONTAINER psql -U postgres -c "\l"
        else
            echo "❌ PostgreSQL is not working even inside the container!"
            echo "👉 This indicates a serious PostgreSQL configuration problem."
        fi
    fi
fi

echo "✅ Database check completed!"