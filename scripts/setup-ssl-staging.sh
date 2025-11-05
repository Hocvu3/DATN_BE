#!/bin/bash

# ===== SETUP SSL STAGING (For Testing) =====
# Dùng Let's Encrypt STAGING để test (không bị rate limit)
# Certificate sẽ có browser warning nhưng CORS vẫn hoạt động

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

DOMAIN="api.docuflow.id.vn"
EMAIL="hocvu2003@gmail.com"

echo -e "${BLUE}===== SETUP SSL STAGING FOR $DOMAIN =====${NC}"
echo -e "${YELLOW}⚠ Dùng staging certificate (browser warning)${NC}"
echo -e "${CYAN}Chạy script chính sau 2025-11-06 để có production cert${NC}"

if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root (use sudo)${NC}"
  exit 1
fi

OS=$(cat /etc/os-release | grep "^ID=" | cut -d'=' -f2 | tr -d '"')

if [[ "$OS" == *"ubuntu"* ]] || [[ "$OS" == *"debian"* ]]; then
  NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
  NGINX_ENABLED="/etc/nginx/sites-enabled/$DOMAIN"
else
  NGINX_CONF="/etc/nginx/conf.d/$DOMAIN.conf"
fi

# Stop nginx
systemctl stop nginx || true

# Remove old configs
rm -f /etc/nginx/sites-available/secure-doc
rm -f /etc/nginx/sites-enabled/secure-doc
rm -f /etc/nginx/conf.d/secure-doc.conf

# Create temp config
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
  rm -f /etc/nginx/sites-enabled/default
fi

nginx -t
systemctl start nginx

# Get STAGING certificate (không bị rate limit)
echo -e "\n${BLUE}Tạo STAGING certificate...${NC}"
certbot certonly --nginx \
  --staging \
  --non-interactive \
  --agree-tos \
  --email $EMAIL \
  --domains $DOMAIN \
  --force-renewal

if [ $? -ne 0 ]; then
  echo -e "${RED}✗ Staging certificate failed!${NC}"
  exit 1
fi

# Create final Nginx config with SSL
cat > $NGINX_CONF << 'EOL'
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name DOMAIN_PLACEHOLDER;

    ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/chain.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size 50M;

    location / {
        set $cors '';
        if ($http_origin ~* ^https://(datn-fe-d\.vercel\.app|docuflow\.id\.vn)$) {
            set $cors "$http_origin";
        }

        add_header 'Access-Control-Allow-Origin' "$cors" always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS, PATCH' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, Accept, X-Requested-With' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;

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
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

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
echo -e "${GREEN}✓ Staging certificate đã được tạo${NC}"
echo -e "${GREEN}✓ CORS đã được cấu hình cho 2 origins${NC}"
echo -e "${YELLOW}⚠ Browser sẽ cảnh báo về certificate (bình thường)${NC}"
echo -e "${CYAN}Sau 2025-11-06, chạy: sudo bash scripts/setup-ssl-nginx.sh${NC}"
