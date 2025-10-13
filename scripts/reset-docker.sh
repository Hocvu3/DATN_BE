#!/bin/bash

# Script để xóa và khởi động lại hoàn toàn môi trường Docker
# Version: 1.1 - Better compatibility with different environments

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

# Dừng và xóa tất cả container
echo "🛑 Stopping and removing all containers..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml --env-file .env.prod down -v

# Xóa tất cả volume để đảm bảo PostgreSQL database được xóa sạch
echo "🗑️ Removing all volumes..."
VOLUMES=$($DOCKER_CMD volume ls -q | grep secure-document-management || echo "")
if [ -n "$VOLUMES" ]; then
  $DOCKER_CMD volume rm $VOLUMES
else
  echo "No volumes to remove"
fi

# Xóa tất cả image để buộc rebuild từ đầu
echo "🗑️ Removing application images..."
IMAGES=$($DOCKER_CMD images | grep secure-document-management | awk '{print $3}' || echo "")
if [ -n "$IMAGES" ]; then
  $DOCKER_CMD rmi $IMAGES
else
  echo "No images to remove"
fi

# Lực xóa bỏ các volume còn lại liên quan đến postgres
echo "🗑️ Force cleaning PostgreSQL volumes..."
POSTGRES_VOLUMES=$($DOCKER_CMD volume ls -q | grep postgres || echo "")
if [ -n "$POSTGRES_VOLUMES" ]; then
  $DOCKER_CMD volume rm $POSTGRES_VOLUMES
else
  echo "No PostgreSQL volumes to remove"
fi

# Đợi 5 giây để đảm bảo mọi resource được giải phóng
echo "⏳ Waiting for resources to be released..."
sleep 5

# Khởi động lại với file mới
echo "🚀 Starting everything from scratch..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml --env-file .env.prod up -d

# Hiển thị logs
echo "📋 Showing logs..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml --env-file .env.prod logs -f app