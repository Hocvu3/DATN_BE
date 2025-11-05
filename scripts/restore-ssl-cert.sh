#!/bin/bash

# ===== RESTORE EXISTING SSL CERTIFICATE =====
# Script này restore certificate Let's Encrypt đã tồn tại
# và cấu hình Nginx với CORS mới

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

DOMAIN="api.docuflow.id.vn"

echo -e "${BLUE}===== RESTORE SSL CERTIFICATE FOR $DOMAIN =====${NC}"

if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root (use sudo)${NC}"
  exit 1
fi

OS=$(cat /etc/os-release | grep "^ID=" | cut -d'=' -f2 | tr -d '"')
echo -e "${CYAN}Hệ điều hành: $OS${NC}"

# Check if archive exists
if [ ! -d "/etc/letsencrypt/archive/$DOMAIN" ]; then
  echo -e "${RED}✗ Không tìm thấy certificate archive cho $DOMAIN${NC}"
  echo -e "${YELLOW}Certificate đã bị xóa hoàn toàn. Phải đợi đến 2025-11-06${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Tìm thấy certificate archive${NC}"

# Restore symlinks in /etc/letsencrypt/live/
echo -e "\n${BLUE}[1/2] Restore certificate symlinks...${NC}"

mkdir -p /etc/letsencrypt/live/$DOMAIN

# Find latest certificate files
LATEST_CERT=$(ls -t /etc/letsencrypt/archive/$DOMAIN/cert*.pem | head -1)
LATEST_CHAIN=$(ls -t /etc/letsencrypt/archive/$DOMAIN/chain*.pem | head -1)
LATEST_FULLCHAIN=$(ls -t /etc/letsencrypt/archive/$DOMAIN/fullchain*.pem | head -1)
LATEST_PRIVKEY=$(ls -t /etc/letsencrypt/archive/$DOMAIN/privkey*.pem | head -1)

echo -e "${CYAN}Latest cert: $LATEST_CERT${NC}"
echo -e "${CYAN}Latest chain: $LATEST_CHAIN${NC}"
echo -e "${CYAN}Latest fullchain: $LATEST_FULLCHAIN${NC}"
echo -e "${CYAN}Latest privkey: $LATEST_PRIVKEY${NC}"

# Create symlinks
ln -sf "$LATEST_CERT" /etc/letsencrypt/live/$DOMAIN/cert.pem
ln -sf "$LATEST_CHAIN" /etc/letsencrypt/live/$DOMAIN/chain.pem
ln -sf "$LATEST_FULLCHAIN" /etc/letsencrypt/live/$DOMAIN/fullchain.pem
ln -sf "$LATEST_PRIVKEY" /etc/letsencrypt/live/$DOMAIN/privkey.pem

# Restore renewal config if missing
if [ ! -f "/etc/letsencrypt/renewal/$DOMAIN.conf" ]; then
  echo -e "${YELLOW}Restore renewal config...${NC}"
  
  cat > /etc/letsencrypt/renewal/$DOMAIN.conf << EOF
# renew_before_expiry = 30 days
version = 2.11.0
archive_dir = /etc/letsencrypt/archive/$DOMAIN
cert = /etc/letsencrypt/live/$DOMAIN/cert.pem
privkey = /etc/letsencrypt/live/$DOMAIN/privkey.pem
chain = /etc/letsencrypt/live/$DOMAIN/chain.pem
fullchain = /etc/letsencrypt/live/$DOMAIN/fullchain.pem

[renewalparams]
account = $(ls /etc/letsencrypt/accounts/acme-v02.api.letsencrypt.org/directory/ | head -1)
authenticator = nginx
installer = nginx
server = https://acme-v02.api.letsencrypt.org/directory
key_type = ecdsa
EOF
fi

echo -e "${GREEN}✓ Certificate đã được restore${NC}"

# Show certificate info
echo -e "\n${CYAN}Thông tin certificate:${NC}"
openssl x509 -in /etc/letsencrypt/live/$DOMAIN/cert.pem -text -noout | grep -E "(Subject:|Issuer:|Not Before|Not After)"

# ===== CONFIGURE NGINX =====
echo -e "\n${BLUE}[2/2] Cấu hình Nginx với HTTPS...${NC}"

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

# Create Nginx config
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

# Enable config
if [[ "$OS" == *"ubuntu"* ]] || [[ "$OS" == *"debian"* ]]; then
  ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
  rm -f /etc/nginx/sites-enabled/default
fi

# Test and start Nginx
nginx -t

if [ $? -eq 0 ]; then
  systemctl start nginx
  systemctl enable nginx
  echo -e "${GREEN}✓ Nginx đã được cấu hình và khởi động${NC}"
else
  echo -e "${RED}✗ Cấu hình Nginx không hợp lệ!${NC}"
  exit 1
fi

# Hoàn tất
echo -e "\n${GREEN}===== HOÀN TẤT! =====${NC}"
echo -e "${GREEN}✓ Certificate đã được restore${NC}"
echo -e "${GREEN}✓ Nginx đã được cấu hình với CORS cho 2 origins${NC}"
echo -e "${GREEN}✓ Domain: https://$DOMAIN${NC}"

echo -e "\n${CYAN}Kiểm tra certificate:${NC}"
echo -e "${CYAN}curl -I https://$DOMAIN/api/health${NC}"

echo -e "\n${YELLOW}Lưu ý:${NC}"
echo -e "${CYAN}Certificate sẽ tự động renew mỗi 60 ngày${NC}"
echo -e "${CYAN}Kiểm tra renewal: sudo certbot renew --dry-run${NC}"
