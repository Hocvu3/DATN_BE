#!/bin/bash

# ===== CLEAN RESTART SCRIPT =====
# This script completely cleans and restarts the application

set -e

echo "🧹 Starting complete cleanup and restart..."

# Stop all containers
echo "🛑 Stopping all containers..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod down

# Remove all volumes and data
echo "🗑️ Removing all volumes and data..."
docker volume rm secure-document-management_postgres_data 2>/dev/null || true
docker volume rm secure-document-management_app_uploads 2>/dev/null || true
docker volume rm secure-document-management_app_temp 2>/dev/null || true
docker volume rm secure-document-management_app_logs 2>/dev/null || true

# Remove orphaned containers
echo "🧹 Cleaning up orphaned containers..."
docker container prune -f

# Remove unused images
echo "🧹 Cleaning up unused images..."
docker image prune -f

# Pull latest code
echo "📥 Pulling latest code..."
git fetch origin
git reset --hard origin/main

# Show recent changes
echo "📋 Recent changes:"
git log --oneline -5

# Start fresh
echo "🚀 Starting fresh containers..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Wait for startup
echo "⏳ Waiting for application to start..."
sleep 30

# Check status
echo "📊 Container status:"
docker-compose -f docker-compose.prod.yml --env-file .env.prod ps

echo ""
echo "📋 Application logs:"
docker-compose -f docker-compose.prod.yml --env-file .env.prod logs --tail 20 app

echo ""
echo "✅ Clean restart completed!"
echo "🌐 Check your application at: http://$(curl -s ifconfig.me 2>/dev/null || echo 'your-server-ip')"