#!/bin/bash

# ===== SETUP SSL + NGINX FOR api.docuflow.id.vn =====
# Script này sẽ:
# 1. Kiểm tra và giữ SSL certificate nếu đã có
# 2. Cài đặt Certbot (Let's Encrypt) nếu chưa có
# 3. Tạo SSL certificate nếu chưa có (skip nếu đã có)
# 4. Cập nhật Nginx config với HTTPS

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
EMAIL="hocvu2003@gmail.com"  # Email cho Let's Encrypt notifications

echo -e "${BLUE}===== SETUP SSL + NGINX FOR $DOMAIN =====${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root (use sudo)${NC}"
  exit 1
fi

# Get OS type
OS=$(cat /etc/os-release | grep "^ID=" | cut -d'=' -f2 | tr -d '"')
echo -e "${CYAN}Hệ điều hành: $OS${NC}"

# Check if certificate already exists
CERT_EXISTS=false
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  CERT_EXISTS=true
  echo -e "${GREEN}✓ Certificate đã tồn tại cho $DOMAIN${NC}"
  echo -e "${CYAN}Sẽ skip bước tạo certificate và chỉ cập nhật Nginx config${NC}"
fi

# ===== STEP 1: CLEANUP OLD NGINX CONFIG ONLY =====
echo -e "\n${BLUE}[1/6] Xóa Nginx config cũ (giữ nguyên SSL certificate)...${NC}"

# Stop Nginx
systemctl stop nginx || true

# Remove old Nginx configs ONLY (KHÔNG xóa certificate)
echo -e "${YELLOW}Xóa Nginx configs cũ...${NC}"
rm -f /etc/nginx/sites-available/secure-doc
rm -f /etc/nginx/sites-enabled/secure-doc
rm -f /etc/nginx/conf.d/secure-doc.conf

# Only remove old self-signed certs, keep Let's Encrypt
if [ -d "/etc/nginx/ssl" ]; then
  echo -e "${YELLOW}Xóa self-signed certificates cũ...${NC}"
  rm -rf /etc/nginx/ssl
fi

echo -e "${GREEN}✓ Đã xóa SSL và Nginx config cũ${NC}"

# ===== STEP 2: INSTALL NGINX =====
echo -e "\n${BLUE}[2/6] Kiểm tra và cài đặt Nginx...${NC}"

if ! command -v nginx &> /dev/null; then
  if [[ "$OS" == *"ubuntu"* ]] || [[ "$OS" == *"debian"* ]]; then
    apt update
    apt install -y nginx
  else
    yum install -y nginx
  fi
  echo -e "${GREEN}✓ Nginx đã được cài đặt${NC}"
else
  echo -e "${GREEN}✓ Nginx đã được cài đặt sẵn${NC}"
fi

# ===== STEP 3: INSTALL CERTBOT =====
echo -e "\n${BLUE}[3/6] Cài đặt Certbot (Let's Encrypt)...${NC}"

if ! command -v certbot &> /dev/null; then
  if [[ "$OS" == *"ubuntu"* ]] || [[ "$OS" == *"debian"* ]]; then
    apt install -y certbot python3-certbot-nginx
  else
    yum install -y certbot python3-certbot-nginx
  fi
  echo -e "${GREEN}✓ Certbot đã được cài đặt${NC}"
else
  echo -e "${GREEN}✓ Certbot đã được cài đặt sẵn${NC}"
fi

# ===== STEP 4: TEMPORARY NGINX CONFIG FOR CERTBOT =====
echo -e "\n${BLUE}[4/6] Tạo Nginx config tạm để xác thực domain...${NC}"

if [[ "$OS" == *"ubuntu"* ]] || [[ "$OS" == *"debian"* ]]; then
  NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
  NGINX_ENABLED="/etc/nginx/sites-enabled/$DOMAIN"
else
  NGINX_CONF="/etc/nginx/conf.d/$DOMAIN.conf"
  NGINX_ENABLED=""
fi

# Create temporary config for Let's Encrypt validation
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

# Replace domain placeholder
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" $NGINX_CONF

# Enable config (Ubuntu/Debian)
if [[ "$OS" == *"ubuntu"* ]] || [[ "$OS" == *"debian"* ]]; then
  ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
  rm -f /etc/nginx/sites-enabled/default
fi

# Test and start Nginx
nginx -t
systemctl start nginx
systemctl enable nginx

echo -e "${GREEN}✓ Nginx config tạm đã được tạo${NC}"

# ===== STEP 5: OBTAIN SSL CERTIFICATE (Skip nếu đã có) =====
if [ "$CERT_EXISTS" = true ]; then
  echo -e "\n${BLUE}[5/6] SSL certificate đã tồn tại - Skip bước này${NC}"
  echo -e "${GREEN}✓ Sử dụng certificate hiện có${NC}"
  certbot certificates
else
  echo -e "\n${BLUE}[5/6] Tạo SSL certificate từ Let's Encrypt...${NC}"
  echo -e "${YELLOW}Đang xác thực domain và tạo certificate...${NC}"
  echo -e "${CYAN}(Domain $DOMAIN phải trỏ đến IP này)${NC}"

  # Get SSL certificate
  certbot certonly --nginx \
    --non-interactive \
    --agree-tos \
    --email $EMAIL \
    --domains $DOMAIN

  if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Không thể tạo SSL certificate!${NC}"
    echo -e "${YELLOW}Kiểm tra:${NC}"
    echo -e "${CYAN}1. Domain $DOMAIN đã trỏ đúng IP chưa?${NC}"
    echo -e "${CYAN}2. Port 80 đã mở chưa?${NC}"
    echo -e "${CYAN}3. Nginx đang chạy chưa?${NC}"
    exit 1
  fi

  echo -e "${GREEN}✓ SSL certificate đã được tạo thành công${NC}"
fi

# ===== STEP 6: CONFIGURE NGINX WITH SSL =====
echo -e "\n${BLUE}[6/6] Cấu hình Nginx với HTTPS...${NC}"

# Create final Nginx config with SSL
cat > $NGINX_CONF << EOL
# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    # SSL certificate from Let's Encrypt
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/$DOMAIN/chain.pem;

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
        set \$cors '';
        if (\$http_origin ~* ^https://(datn-fe-d\\.vercel\\.app|docuflow\\.id\\.vn)\$) {
            set \$cors "\$http_origin";
        }

        add_header 'Access-Control-Allow-Origin' "\$cors" always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS, PATCH' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, Accept, X-Requested-With' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;

        # Handle OPTIONS preflight
        if (\$request_method = OPTIONS) {
            return 204;
        }

        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
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

# Test and reload Nginx
nginx -t

if [ $? -eq 0 ]; then
  systemctl reload nginx
  echo -e "${GREEN}✓ Nginx đã được cấu hình với HTTPS${NC}"
else
  echo -e "${RED}✗ Cấu hình Nginx không hợp lệ!${NC}"
  exit 1
fi

# ===== STEP 7: SETUP AUTO-RENEWAL =====
echo -e "\n${BLUE}[7/7] Thiết lập auto-renewal cho SSL certificate...${NC}"

# Test renewal
certbot renew --dry-run

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Auto-renewal đã được thiết lập${NC}"
  echo -e "${CYAN}Certificate sẽ tự động renew trước khi hết hạn${NC}"
else
  echo -e "${YELLOW}⚠ Auto-renewal test failed, nhưng certificate vẫn hoạt động${NC}"
fi

# Display certificate info
echo -e "\n${CYAN}===== Thông tin Certificate =====${NC}"
certbot certificates

# Hoàn tất
echo -e "\n${GREEN}===== Cấu hình SSL + Nginx hoàn tất! =====${NC}"
echo -e "${GREEN}✓ Domain: https://$DOMAIN${NC}"
echo -e "${GREEN}✓ Health check: https://$DOMAIN/api/health${NC}"
echo -e "${GREEN}✓ API Docs: https://$DOMAIN/api${NC}"

echo -e "\n${YELLOW}===== Lưu ý =====${NC}"
echo -e "${CYAN}1. Certificate sẽ tự động renew mỗi 60 ngày${NC}"
echo -e "${CYAN}2. Kiểm tra logs: sudo journalctl -u certbot.timer${NC}"
echo -e "${CYAN}3. Renew thủ công: sudo certbot renew${NC}"
echo -e "${CYAN}4. Đừng quên cập nhật frontend URL: https://$DOMAIN${NC}"

echo -e "\n${GREEN}Kiểm tra certificate:${NC}"
echo -e "${CYAN}curl -I https://$DOMAIN/api/health${NC}"
