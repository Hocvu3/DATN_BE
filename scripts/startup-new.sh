#!/bin/bash

# Script để khởi động ứng dụng với reset database hoàn toàn
# Version: 3.0 - EXTREME RESET MODE

echo "🚀 Starting Secure Document Management System..."
echo "⚠️ EXTREME RESET MODE: Database sẽ được xóa và tạo lại hoàn toàn!"

# Thiết lập các biến môi trường
if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "postgres:"; then
    echo "🐳 Running in Docker environment"
    
    # Parse DATABASE_URL để lấy thông tin kết nối
    DB_USER=$(echo $DATABASE_URL | sed -n 's/.*postgres:\/\/\([^:]*\):.*/\1/p')
    DB_PASSWORD=$(echo $DATABASE_URL | sed -n 's/.*postgres:\/\/[^:]*:\([^@]*\).*/\1/p')
    DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*postgres:\/\/[^:]*:[^@]*@\([^:]*\).*/\1/p')
    DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*postgres:\/\/[^:]*:[^@]*@[^:]*:\([^\/]*\).*/\1/p')
    DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*postgres:\/\/[^:]*:[^@]*@[^:]*:[^\/]*\/\([^?]*\).*/\1/p')
    
    # Thiết lập lệnh chờ và kết nối
    WAIT_CMD="pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER"
    PSQL_CONNECT="psql postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/postgres"
else
    echo "💻 Running in local environment"
    DB_HOST="localhost"
    DB_PORT="5432"
    DB_USER="postgres"
    DB_PASSWORD="postgres"
    DB_NAME="datn"
    
    WAIT_CMD="pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER"
    PSQL_CONNECT="psql -h $DB_HOST -p $DB_PORT -U $DB_USER"
fi

echo "⏳ Waiting for PostgreSQL to be ready..."
# Tăng số lần thử và thời gian chờ
MAX_ATTEMPTS=120
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT+1))
    
    if $WAIT_CMD; then
        echo "✅ PostgreSQL is ready!"
        break
    else
        echo "PostgreSQL not ready yet (attempt $ATTEMPT/$MAX_ATTEMPTS). Waiting..."
        sleep 5
    fi
    
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo "⚠️ PostgreSQL connection timeout - will try to continue anyway"
        # Thêm thông tin chẩn đoán
        echo "📊 Connection info: Host=$DB_HOST, Port=$DB_PORT, User=$DB_USER, DB=$DB_NAME"
        echo "📊 Checking PostgreSQL container status..."
        docker ps | grep postgres || echo "No PostgreSQL container found running!"
        echo "📊 Checking PostgreSQL container logs..."
        docker logs $(docker ps | grep postgres | awk '{print $1}') 2>/dev/null || echo "Could not get logs"
    fi
done

# ===== SUPER HARD RESET DATABASE =====
echo "🔄 EXTREME RESET: Xóa hoàn toàn và tạo lại database từ đầu..."

# 1. Ngắt kết nối hiện có
echo "🔌 Closing all existing connections to $DB_NAME..."
$PSQL_CONNECT -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME';" || echo "⚠️ Failed to terminate connections (non-critical)"

# 2. Drop database với FORCE (PostgreSQL 13+)
echo "🗑️ Dropping database $DB_NAME..."
$PSQL_CONNECT -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);" 2>/dev/null || \
$PSQL_CONNECT -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" 2>/dev/null || \
echo "⚠️ Failed to drop database (will continue)"

# 3. Tạm dừng để đảm bảo kết nối đã đóng
sleep 5

# 4. Kiểm tra xem database đã bị xóa thật chưa
echo "🔍 Verifying database was dropped..."
DB_EXISTS=$($PSQL_CONNECT -t -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';" 2>/dev/null)
if [ -n "$DB_EXISTS" ]; then
    echo "⚠️ Warning: Database still exists despite drop attempt. Trying harder..."
    $PSQL_CONNECT -c "UPDATE pg_database SET datallowconn = false WHERE datname = '$DB_NAME';"
    sleep 2
    $PSQL_CONNECT -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME';"
    sleep 2
    $PSQL_CONNECT -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
fi

# 5. Tạo lại database
echo "🆕 Creating database $DB_NAME..."
$PSQL_CONNECT -c "CREATE DATABASE \"$DB_NAME\";" || echo "⚠️ Failed to create database (will continue)"

# ===== SETUP DATABASE =====
echo "🗄️ Setting up database..."

# Sinh Prisma client và đẩy schema trực tiếp
echo "📋 Generating Prisma client..."
npx prisma generate || echo "⚠️ Failed to generate Prisma client (will continue)"

# Đẩy schema trực tiếp thay vì migration
echo "📊 Pushing schema với db push..."
npx prisma db push --accept-data-loss --force-reset || (
    echo "⚠️ Failed to push schema with --force-reset, trying with just --accept-data-loss..."
    npx prisma db push --accept-data-loss || echo "⚠️ All db push attempts failed!"
)

# Thêm dữ liệu seed
echo "🌱 Seeding database..."
npx prisma db seed || echo "⚠️ Failed to seed database (will continue)"

# ===== START APPLICATION =====
echo "🚀 Starting application..."
if [ "$NODE_ENV" = "production" ]; then
    npm run start:prod
else
    npm run start:dev
fi