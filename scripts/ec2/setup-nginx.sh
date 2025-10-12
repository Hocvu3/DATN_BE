#!/bin/bash

# ===== SETUP SYSTEM NGINX AS REVERSE PROXY =====

echo "🔧 Setting up system nginx as reverse proxy..."

# Install nginx if not already installed
if ! command -v nginx &> /dev/null; then
    echo "📦 Installing nginx..."
    sudo apt update
    sudo apt install -y nginx
fi

# Stop nginx if running
sudo systemctl stop nginx

# Backup default config
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup 2>/dev/null || true

# Copy our config
echo "📋 Copying nginx configuration..."
sudo cp /home/ubuntu/secure-document-management/nginx/simple-nginx.conf /etc/nginx/sites-available/secure-doc

# Enable our site
sudo ln -sf /etc/nginx/sites-available/secure-doc /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx config
echo "🧪 Testing nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx configuration is valid!"
    
    # Start nginx
    sudo systemctl start nginx
    sudo systemctl enable nginx
    
    echo "✅ System nginx setup completed!"
    echo "🌐 Application will be accessible on port 80"
else
    echo "❌ Nginx configuration test failed!"
    exit 1
fi