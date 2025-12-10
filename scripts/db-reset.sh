#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🗑️  Dropping and recreating database...${NC}"

# Get database connection details from .env
source .env 2>/dev/null || true

# Extract database name from DATABASE_ADMIN_URL
DB_NAME="secure_document_management"
DB_USER="postgres"
DB_PASSWORD="hocvu"
DB_HOST="localhost"
DB_PORT="5432"

# Set PGPASSWORD to avoid password prompt
export PGPASSWORD="$DB_PASSWORD"

echo -e "${YELLOW}📊 Database: $DB_NAME${NC}"
echo -e "${YELLOW}👤 User: $DB_USER${NC}"
echo -e "${YELLOW}🏠 Host: $DB_HOST:$DB_PORT${NC}"
echo ""

# Step 1: Terminate all connections to the database
echo -e "${YELLOW}🔌 Terminating existing connections...${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = '$DB_NAME' 
  AND pid <> pg_backend_pid();
" 2>/dev/null || echo -e "${YELLOW}No active connections to terminate${NC}"

# Step 2: Drop the database
echo -e "${YELLOW}🗑️  Dropping database...${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>&1 | grep -v "does not exist"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database dropped successfully${NC}"
else
    echo -e "${RED}❌ Failed to drop database${NC}"
    exit 1
fi

# Step 3: Recreate the database
echo -e "${YELLOW}🔨 Creating new database...${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database created successfully${NC}"
else
    echo -e "${RED}❌ Failed to create database${NC}"
    exit 1
fi

# Step 4: Grant schema permissions
echo -e "${YELLOW}🔐 Setting up permissions...${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
-- Grant usage on public schema to postgres (owner)
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- Grant all privileges on database
ALTER DATABASE $DB_NAME OWNER TO postgres;
"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Permissions configured${NC}"
else
    echo -e "${YELLOW}⚠️  Warning: Permission setup may have issues${NC}"
fi

# # Step 5: Create app_role user if it doesn't exist (optional)
# echo -e "${YELLOW}👤 Creating app_role user...${NC}"
# psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "
# DO \$\$
# BEGIN
#     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_role') THEN
#         CREATE ROLE app_role LOGIN PASSWORD '$DB_PASSWORD';
#     END IF;
# END
# \$\$;
# " 2>/dev/null

# Grant privileges to app_role on the new database
# psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
# GRANT CONNECT ON DATABASE $DB_NAME TO app_role;
# GRANT USAGE ON SCHEMA public TO app_role;
# GRANT CREATE ON SCHEMA public TO app_role;
# GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_role;
# GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_role;
# ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO app_role;
# ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO app_role;
# " 2>/dev/null

echo -e "${GREEN}✅ Database reset completed!${NC}"
echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "   1. Run: ${GREEN}npm run db:setup${NC}"
echo -e "   2. Or run manually:"
echo -e "      - ${GREEN}npm run db:generate${NC}"
echo -e "      - ${GREEN}npm run db:migrate${NC} or run migration SQL"
echo -e "      - ${GREEN}npm run db:seed${NC}"
echo ""

# Unset PGPASSWORD
unset PGPASSWORD
