#!/bin/bash

# ===== MANUAL DEPLOYMENT SCRIPT =====
# Run this script to manually deploy the application

set -e

PROJECT_DIR="/home/ubuntu/secure-document-management"
BACKUP_DIR="/home/ubuntu/backups/manual_$(date +%Y%m%d_%H%M%S)"

echo "🚀 Starting manual deployment..."

# Create backup
echo "💾 Creating backup..."
mkdir -p $BACKUP_DIR

# Backup current state
if [ -d "$PROJECT_DIR" ]; then
    echo "📦 Backing up current deployment..."
    cp -r $PROJECT_DIR $BACKUP_DIR/
    
    # Backup database
    if docker ps | grep -q secure_doc_postgres; then
        echo "🗄️ Backing up database..."
        docker exec secure_doc_postgres pg_dump -U postgres secure_document_management > $BACKUP_DIR/database_backup.sql
    fi
fi

# Navigate to project directory
cd $PROJECT_DIR

# Pull latest code
echo "📥 Pulling latest code from main branch..."
git fetch origin
git reset --hard origin/main

# Show what changed
echo "📋 Changes in this deployment:"
git log --oneline -10

# Stop current services
echo "🛑 Stopping current services..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod down

# Clean up old images and containers
echo "🧹 Cleaning up old images..."
docker system prune -f

# Build and start services
echo "🏗️ Building and starting new services..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod build --no-cache
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Check service health
echo "🏥 Checking service health..."
max_attempts=30
attempt=1

while [ $attempt -le $max_attempts ]; do
    if curl -f http://localhost/api/health > /dev/null 2>&1; then
        echo "✅ Application is healthy!"
        break
    fi
    
    echo "Attempt $attempt/$max_attempts: Waiting for application to be ready..."
    sleep 10
    attempt=$((attempt + 1))
done

if [ $attempt -gt $max_attempts ]; then
    echo "❌ Health check failed! Rolling back..."
    
    # Rollback
    echo "🔄 Rolling back to previous version..."
    docker-compose -f docker-compose.prod.yml --env-file .env.prod down
    
    if [ -f "$BACKUP_DIR/database_backup.sql" ]; then
        echo "🗄️ Restoring database..."
        docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d postgres
        sleep 10
        docker exec -i secure_doc_postgres psql -U postgres -d secure_document_management < $BACKUP_DIR/database_backup.sql
    fi
    
    exit 1
fi

# Show final status
echo ""
echo "📊 Deployment Status:"
docker-compose -f docker-compose.prod.yml --env-file .env.prod ps

echo ""
echo "📋 Container Logs (last 10 lines):"
echo "--- Application Logs ---"
docker logs secure_doc_app --tail 10

echo ""
echo "--- Nginx Logs ---"
docker logs secure_doc_nginx --tail 5

echo ""
echo "✅ Manual deployment completed successfully!"
echo "🌐 Application URL: https://$(curl -s ifconfig.me)"
echo "💾 Backup location: $BACKUP_DIR"
echo ""
echo "🔧 Useful commands:"
echo "  - Check logs: docker logs secure_doc_app -f"
echo "  - Monitor: /home/ubuntu/monitor.sh"
echo "  - Rollback: cp -r $BACKUP_DIR/secure-document-management/* $PROJECT_DIR/"