#!/bin/bash

# Script để xóa và khởi động lại hoàn toàn môi trường Docker
# Version: 1.0

echo "🧹 Cleaning up Docker environment..."

# Dừng và xóa tất cả container
echo "🛑 Stopping and removing all containers..."
sudo docker-compose -f docker-compose.prod.yml --env-file .env.prod down -v

# Xóa tất cả volume để đảm bảo PostgreSQL database được xóa sạch
echo "🗑️ Removing all volumes..."
sudo docker volume rm $(sudo docker volume ls -q | grep secure-document-management) || echo "No volumes to remove"

# Xóa tất cả image để buộc rebuild từ đầu
echo "🗑️ Removing application images..."
sudo docker rmi $(sudo docker images | grep secure-document-management | awk '{print $3}') || echo "No images to remove"

# Khởi động lại với file mới
echo "🚀 Starting everything from scratch..."
sudo docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Hiển thị logs
echo "📋 Showing logs..."
sudo docker-compose -f docker-compose.prod.yml --env-file .env.prod logs -f app