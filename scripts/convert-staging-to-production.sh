#!/bin/bash

# ===== CONVERT STAGING TO PRODUCTION CERTIFICATE =====
# Chạy script này sau 2025-11-06 00:57:44 UTC
# để chuyển từ staging sang production certificate

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

DOMAIN="api.docuflow.id.vn"
EMAIL="hocvu2003@gmail.com"

echo -e "${BLUE}===== CONVERT STAGING TO PRODUCTION CERTIFICATE =====${NC}"

if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root (use sudo)${NC}"
  exit 1
fi

# Check if certificate is staging
if [ -f "/etc/letsencrypt/live/$DOMAIN/cert.pem" ]; then
  ISSUER=$(openssl x509 -in /etc/letsencrypt/live/$DOMAIN/cert.pem -text -noout | grep "Issuer:")
  
  if [[ $ISSUER == *"STAGING"* ]]; then
    echo -e "${YELLOW}⚠ Hiện tại đang dùng STAGING certificate${NC}"
    echo -e "${CYAN}Sẽ xóa và tạo PRODUCTION certificate${NC}"
    
    # Delete staging certificate
    echo -e "\n${BLUE}[1/3] Xóa staging certificate...${NC}"
    certbot delete --cert-name $DOMAIN --non-interactive
    echo -e "${GREEN}✓ Đã xóa staging certificate${NC}"
  else
    echo -e "${GREEN}✓ Đã là production certificate, không cần chuyển đổi${NC}"
    exit 0
  fi
else
  echo -e "${YELLOW}⚠ Không tìm thấy certificate${NC}"
fi

# Get OS type
OS=$(cat /etc/os-release | grep "^ID=" | cut -d'=' -f2 | tr -d '"')

if [[ "$OS" == *"ubuntu"* ]] || [[ "$OS" == *"debian"* ]]; then
  NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
  NGINX_ENABLED="/etc/nginx/sites-enabled/$DOMAIN"
else
  NGINX_CONF="/etc/nginx/conf.d/$DOMAIN.conf"
fi

# Create temporary Nginx config for validation
echo -e "\n${BLUE}[2/3] Tạo Nginx config tạm...${NC}"

systemctl stop nginx || true

cat > $NGINX_CONF << 'EOL'
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOL

sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" $NGINX_CONF

if [[ "$OS" == *"ubuntu"* ]] || [[ "$OS" == *"debian"* ]]; then
  ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
fi

nginx -t
systemctl start nginx

# Get production certificate
echo -e "\n${BLUE}[3/3] Tạo PRODUCTION certificate...${NC}"
echo -e "${YELLOW}Đang xác thực domain...${NC}"

certbot certonly --nginx \
  --non-interactive \
  --agree-tos \
  --email $EMAIL \
  --domains $DOMAIN

if [ $? -ne 0 ]; then
  echo -e "${RED}✗ Không thể tạo production certificate!${NC}"
  echo -e "${YELLOW}Có thể vẫn bị rate limit. Retry after: 2025-11-06 00:57:44 UTC${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Production certificate đã được tạo${NC}"

# Update Nginx with SSL config
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

sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" $NGINX_CONF

nginx -t
systemctl reload nginx

echo -e "\n${GREEN}===== HOÀN TẤT! =====${NC}"
echo -e "${GREEN}✓ Đã chuyển sang PRODUCTION certificate${NC}"
echo -e "${GREEN}✓ Browser sẽ không còn warning${NC}"
echo -e "${GREEN}✓ CORS đã được cấu hình cho 2 origins${NC}"

echo -e "\n${CYAN}Thông tin certificate:${NC}"
certbot certificates

echo -e "\n${CYAN}Kiểm tra:${NC}"
echo -e "${CYAN}curl -I https://$DOMAIN/api/health${NC}"
