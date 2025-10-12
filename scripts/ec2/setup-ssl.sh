#!/bin/bash

# ===== SSL CERTIFICATE SETUP WITH LET'S ENCRYPT =====
# Run this script to set up real SSL certificates

set -e

# Configuration
DOMAIN=$1
EMAIL=$2

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "Usage: $0 <domain> <email>"
    echo "Example: $0 yourdomain.com admin@yourdomain.com"
    exit 1
fi

echo "🔐 Setting up SSL certificate for $DOMAIN..."

# Install certbot
echo "📦 Installing Certbot..."
sudo apt update
sudo apt install -y snapd
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot

# Stop nginx temporarily
echo "🛑 Stopping Nginx..."
sudo systemctl stop nginx

# Get certificate
echo "📜 Obtaining SSL certificate..."
sudo certbot certonly --standalone \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN

# Copy certificates to nginx directory
echo "📋 Copying certificates..."
sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /home/ubuntu/secure-document-management/nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem /home/ubuntu/secure-document-management/nginx/ssl/key.pem

# Set proper permissions
sudo chown ubuntu:ubuntu /home/ubuntu/secure-document-management/nginx/ssl/*.pem
sudo chmod 644 /home/ubuntu/secure-document-management/nginx/ssl/cert.pem
sudo chmod 600 /home/ubuntu/secure-document-management/nginx/ssl/key.pem

# Update nginx configuration with the correct domain
echo "🔧 Updating Nginx configuration..."
sudo sed -i "s/server_name _;/server_name $DOMAIN;/g" /home/ubuntu/secure-document-management/nginx/nginx.prod.conf

# Restart services
echo "🔄 Restarting services..."
cd /home/ubuntu/secure-document-management
docker-compose -f docker-compose.prod.yml --env-file .env.prod restart nginx

# Setup auto-renewal
echo "🔄 Setting up automatic renewal..."
sudo crontab -l > mycron 2>/dev/null || true
echo "0 12 * * * /usr/bin/certbot renew --quiet --post-hook 'cd /home/ubuntu/secure-document-management && docker-compose -f docker-compose.prod.yml --env-file .env.prod restart nginx'" >> mycron
sudo crontab mycron
rm mycron

echo ""
echo "✅ SSL certificate setup completed!"
echo "🌐 Your application is now available at: https://$DOMAIN"
echo "🔄 Automatic renewal is configured to run daily at 12:00 PM"