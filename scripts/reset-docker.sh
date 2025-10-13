#!/bin/bash

# Script để xóa và khởi động lại hoàn toàn môi trường Docker
# Version: 1.2 - Extreme Reset Mode

echo "🧹 Cleaning up Docker environment..."

# Detect if sudo is needed
DOCKER_CMD="docker"
DOCKER_COMPOSE_CMD="docker-compose"

# Check if we're on Linux/Mac and if we need sudo
if [[ "$OSTYPE" == "linux-gnu"* || "$OSTYPE" == "darwin"* ]]; then
  if ! docker ps > /dev/null 2>&1; then
    DOCKER_CMD="sudo docker"
    DOCKER_COMPOSE_CMD="sudo docker-compose"
    echo "Using sudo for Docker commands"
  fi
fi

# Define function to get container ID
get_container_id() {
  local container_name=$1
  local container_id=$($DOCKER_CMD ps -a | grep $container_name | awk '{print $1}')
  echo $container_id
}

# Define function to clean database
clean_postgres_db() {
  local container_id=$(get_container_id "secure_doc_postgres")
  
  if [ -n "$container_id" ]; then
    echo "📢 Found PostgreSQL container: $container_id"
    echo "🧹 Cleaning database directly inside container..."
    
    # Try to drop and recreate the database directly in the container
    $DOCKER_CMD exec $container_id psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='secure_document_management';" || echo "⚠️ Failed to terminate connections (non-critical)"
    $DOCKER_CMD exec $container_id psql -U postgres -c "DROP DATABASE IF EXISTS secure_document_management WITH (FORCE);" || echo "⚠️ Failed to drop database with FORCE"
    $DOCKER_CMD exec $container_id psql -U postgres -c "DROP DATABASE IF EXISTS secure_document_management;" || echo "⚠️ Failed to drop database"
    $DOCKER_CMD exec $container_id psql -U postgres -c "CREATE DATABASE secure_document_management;" || echo "⚠️ Failed to create database"
    
    echo "✅ Database cleaned inside container"
  else
    echo "❌ PostgreSQL container not found, skipping direct database cleanup"
  fi
}

# Dừng container nhưng giữ lại volume để có thể clean database
echo "🛑 Stopping all containers first..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml --env-file .env.prod stop

# Try to clean database if PostgreSQL container exists
clean_postgres_db

# Dừng và xóa tất cả container với volume
echo "🛑 Stopping and removing all containers with volumes..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml --env-file .env.prod down -v

# Xóa tất cả volume để đảm bảo PostgreSQL database được xóa sạch
echo "🗑️ Removing all volumes..."
VOLUMES=$($DOCKER_CMD volume ls -q | grep -E 'secure-document-management|postgres_data' || echo "")
if [ -n "$VOLUMES" ]; then
  $DOCKER_CMD volume rm -f $VOLUMES || echo "⚠️ Some volumes could not be removed"
else
  echo "No volumes to remove"
fi

# Lực xóa bỏ tất cả các volume
echo "🗑️ Force pruning ALL unused volumes..."
$DOCKER_CMD volume prune -f

# Xóa tất cả image để buộc rebuild từ đầu
echo "🗑️ Removing application images..."
IMAGES=$($DOCKER_CMD images | grep -E 'secure-document-management|postgres:14' | awk '{print $3}' || echo "")
if [ -n "$IMAGES" ]; then
  $DOCKER_CMD rmi -f $IMAGES || echo "⚠️ Some images could not be removed"
else
  echo "No images to remove"
fi

# Đợi 5 giây để đảm bảo mọi resource được giải phóng
echo "⏳ Waiting for resources to be released..."
sleep 5

# Run a system prune to clean everything
echo "🧹 Running system prune to clean everything..."
$DOCKER_CMD system prune -f

# Make sure environment file exists
if [ ! -f ".env.prod" ]; then
  echo "⚠️ .env.prod file not found! Creating a minimal one..."
  echo "POSTGRES_PASSWORD=password" > .env.prod
  echo "⚠️ Please update .env.prod with proper values after this script completes"
fi

# Rebuild without cache
echo "🏗️ Building images from scratch (no cache)..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml --env-file .env.prod build --no-cache

# Khởi động lại với file mới
echo "🚀 Starting everything from scratch..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml --env-file .env.prod up -d

# Hiển thị logs với thời gian chờ ngắn
echo "⏳ Waiting 10 seconds for containers to initialize..."
sleep 10

# Check container status
echo "📊 Checking container status..."
$DOCKER_CMD ps -a

# Hiển thị logs
echo "📋 Showing logs..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml --env-file .env.prod logs -f app