#!/bin/bash

# ===== UPDATE NGINX CONFIG ONLY (Không tạo SSL cert mới) =====
# Script này chỉ cập nhật Nginx config với CORS mới
# Dùng certificate Let's Encrypt đã có sẵn

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Domain configuration
DOMAIN="api.docuflow.id.vn"

echo -e "${BLUE}===== UPDATE NGINX CONFIG FOR $DOMAIN =====${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root (use sudo)${NC}"
  exit 1
fi

# Check if certificate exists
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo -e "${RED}✗ Certificate không tồn tại cho domain $DOMAIN${NC}"
  echo -e "${YELLOW}Chạy setup-ssl-nginx.sh trước hoặc đợi đến 2025-11-06${NC}"
  exit 1
fi

# Get OS type
OS=$(cat /etc/os-release | grep "^ID=" | cut -d'=' -f2 | tr -d '"')
echo -e "${CYAN}Hệ điều hành: $OS${NC}"

echo -e "\n${BLUE}[1/2] Cập nhật Nginx configuration...${NC}"

if [[ "$OS" == *"ubuntu"* ]] || [[ "$OS" == *"debian"* ]]; then
  NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
  NGINX_ENABLED="/etc/nginx/sites-enabled/$DOMAIN"
else
  NGINX_CONF="/etc/nginx/conf.d/$DOMAIN.conf"
  NGINX_ENABLED=""
fi

# Create Nginx config with updated CORS
cat > $NGINX_CONF << 'EOL'
# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;
    return 301 https://$host$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name DOMAIN_PLACEHOLDER;

    # SSL certificate from Let's Encrypt
    ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/chain.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Request size limits
    client_max_body_size 50M;

    location / {
        # CORS headers - Cho phép nhiều frontend origins
        set $cors '';
        if ($http_origin ~* ^https://(datn-fe-d\.vercel\.app|docuflow\.id\.vn)$) {
            set $cors "$http_origin";
        }

        add_header 'Access-Control-Allow-Origin' "$cors" always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS, PATCH' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, Accept, X-Requested-With' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;

        # Handle OPTIONS preflight
        if ($request_method = OPTIONS) {
            return 204;
        }

        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location /api/health {
        proxy_pass http://localhost:3000;
        access_log off;
    }
}
EOL

# Replace domain placeholder
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" $NGINX_CONF

echo -e "${GREEN}✓ Nginx config đã được cập nhật${NC}"

# Enable config (Ubuntu/Debian)
if [[ "$OS" == *"ubuntu"* ]] || [[ "$OS" == *"debian"* ]]; then
  ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
  rm -f /etc/nginx/sites-enabled/default
fi

echo -e "\n${BLUE}[2/2] Test và reload Nginx...${NC}"

# Test Nginx config
nginx -t

if [ $? -eq 0 ]; then
  systemctl reload nginx
  echo -e "${GREEN}✓ Nginx đã được reload thành công${NC}"
else
  echo -e "${RED}✗ Cấu hình Nginx không hợp lệ!${NC}"
  exit 1
fi

# Display certificate info
echo -e "\n${CYAN}===== Thông tin Certificate hiện tại =====${NC}"
certbot certificates

# Hoàn tất
echo -e "\n${GREEN}===== Cập nhật Nginx hoàn tất! =====${NC}"
echo -e "${GREEN}✓ Domain: https://$DOMAIN${NC}"
echo -e "${GREEN}✓ CORS origins: https://datn-fe-d.vercel.app + https://docuflow.id.vn${NC}"

echo -e "\n${CYAN}Kiểm tra:${NC}"
echo -e "${CYAN}curl -I https://$DOMAIN/api/health${NC}"
