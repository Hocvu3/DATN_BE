#!/bin/bash

# Script để khắc phục vấn đề P3005 trên môi trường EC2
# Version: 1.0 - EC2 Emergency Reset

echo "🚨 EC2 EMERGENCY RESET - Khắc phục vấn đề P3005 trên EC2"
echo "⚠️ Script này sẽ xóa và khởi động lại hoàn toàn môi trường Docker trên EC2"

# Kiểm tra xem đang chạy trên EC2 hay không
if [ ! -f /sys/hypervisor/uuid ] || [ "$(head -c 3 /sys/hypervisor/uuid)" != "ec2" ]; then
  echo "⚠️ Script này được thiết kế để chạy trên EC2. Tiếp tục? (y/n)"
  read -r confirm
  if [ "$confirm" != "y" ]; then
    echo "❌ Hủy bỏ script."
    exit 1
  fi
fi

echo "🔍 Checking system environment..."
echo "📊 Docker version:"
docker --version || echo "❌ Docker not installed or not in PATH"

echo "📊 Docker Compose version:"
docker-compose --version || echo "❌ Docker Compose not installed or not in PATH"

# Kiểm tra và cài đặt các công cụ cần thiết
echo "🔧 Installing required tools..."
if ! command -v netcat &> /dev/null; then
  echo "📦 Installing netcat..."
  sudo apt-get update && sudo apt-get install -y netcat || echo "⚠️ Failed to install netcat"
fi

if ! command -v postgresql-client &> /dev/null; then
  echo "📦 Installing PostgreSQL client..."
  sudo apt-get update && sudo apt-get install -y postgresql-client || echo "⚠️ Failed to install PostgreSQL client"
fi

# Dừng tất cả dịch vụ Docker
echo "🛑 Stopping all Docker services..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod down -v

# Xóa tất cả volume Docker
echo "🗑️ Removing all Docker volumes..."
docker volume ls -q | grep -E 'secure-document-management|postgres' | xargs -r docker volume rm -f
docker volume prune -f

# Xóa tất cả image liên quan
echo "🗑️ Removing application images..."
docker images | grep -E 'secure-document-management|postgres:14' | awk '{print $3}' | xargs -r docker rmi -f
docker system prune -f

# Cleanup file system
echo "🧹 Cleaning up file system..."
find . -name ".env.*.local" -delete
find . -name "*.log" -delete

# Đảm bảo các thư mục uploads và temp tồn tại và có quyền truy cập đúng
echo "📁 Setting up directories..."
mkdir -p ./uploads ./temp ./logs
chmod -R 777 ./uploads ./temp ./logs

# Tạo lại tất cả và khởi động
echo "🚀 Rebuilding and starting services..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod build --no-cache
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

echo "⏳ Waiting for services to start..."
sleep 10

# Kiểm tra trạng thái container
echo "📊 Container status:"
docker ps -a

# Kiểm tra logs PostgreSQL
echo "📋 PostgreSQL container logs:"
POSTGRES_CONTAINER=$(docker ps -a | grep postgres | awk '{print $1}')
if [ -n "$POSTGRES_CONTAINER" ]; then
  docker logs $POSTGRES_CONTAINER | tail -n 20
  
  # Kiểm tra trạng thái PostgreSQL
  echo "🔍 Testing PostgreSQL connection from inside container..."
  docker exec $POSTGRES_CONTAINER pg_isready -h localhost -U postgres
  
  # Thực hiện các lệnh SQL trực tiếp trong container PostgreSQL
  echo "🔧 Performing database operations inside PostgreSQL container..."
  docker exec $POSTGRES_CONTAINER psql -U postgres -c "DROP DATABASE IF EXISTS secure_document_management WITH (FORCE);" || echo "⚠️ Failed to drop database"
  docker exec $POSTGRES_CONTAINER psql -U postgres -c "CREATE DATABASE secure_document_management;" || echo "⚠️ Failed to create database"
  
  echo "✅ Database reset complete"
else
  echo "❌ PostgreSQL container not found!"
fi

# Kiểm tra logs app
echo "📋 Application container logs:"
APP_CONTAINER=$(docker ps -a | grep app | awk '{print $1}')
if [ -n "$APP_CONTAINER" ]; then
  docker logs $APP_CONTAINER | tail -n 20
  
  # Chạy Prisma migrations trực tiếp trong container app
  echo "🔧 Running Prisma commands inside application container..."
  docker exec $APP_CONTAINER npx prisma generate
  docker exec $APP_CONTAINER npx prisma db push --accept-data-loss --force-reset || echo "⚠️ Failed to push schema"
  docker exec $APP_CONTAINER npx prisma db seed || echo "⚠️ Failed to seed database"
  
  echo "✅ Application setup complete"
else
  echo "❌ Application container not found!"
fi

echo "🚀 Emergency reset completed. Showing application logs..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod logs -f app