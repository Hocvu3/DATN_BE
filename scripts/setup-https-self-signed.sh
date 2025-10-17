#!/bin/bash
# Script cấu hình HTTPS với Self-Signed Certificate (không cần domain)
# Tạo bởi GitHub Copilot ngày 18/10/2025

# Màu sắc
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}===== Cấu hình HTTPS với Self-Signed Certificate =====${NC}"
echo -e "${YELLOW}Lưu ý: Self-signed certificate sẽ hiện cảnh báo trên trình duyệt${NC}"
echo -e "${YELLOW}Nhưng vẫn mã hóa được traffic và tránh lỗi Mixed Content${NC}\n"

# Kiểm tra quyền root
if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}Bạn cần chạy script này với quyền sudo${NC}"
  echo -e "Ví dụ: sudo bash scripts/setup-https-self-signed.sh"
  exit 1
fi

# Lấy Public IP của EC2
echo -e "${CYAN}Đang lấy Public IP của EC2...${NC}"
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

if [ -z "$PUBLIC_IP" ]; then
  echo -e "${YELLOW}Không lấy được IP từ metadata, vui lòng nhập IP public:${NC}"
  read -p "Public IP: " PUBLIC_IP
fi

echo -e "${GREEN}✓ Public IP: $PUBLIC_IP${NC}\n"

# Kiểm tra OS
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$NAME
else
  OS=$(uname -s)
fi

echo -e "${CYAN}Hệ điều hành: $OS${NC}"

# 1. Cài đặt Nginx (nếu chưa có)
echo -e "\n${BLUE}[1/5] Kiểm tra và cài đặt Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
  if [[ "$OS" == *"Ubuntu"* ]]; then
    apt update -y
    apt install -y nginx
  elif [[ "$OS" == *"Amazon"* ]]; then
    amazon-linux-extras install nginx1 -y
  else
    yum install -y nginx
  fi
  
  systemctl start nginx
  systemctl enable nginx
  echo -e "${GREEN}✓ Nginx đã được cài đặt${NC}"
else
  echo -e "${GREEN}✓ Nginx đã được cài đặt sẵn${NC}"
fi

# 2. Cài đặt OpenSSL (thường có sẵn)
echo -e "\n${BLUE}[2/5] Kiểm tra OpenSSL...${NC}"
if ! command -v openssl &> /dev/null; then
  if [[ "$OS" == *"Ubuntu"* ]]; then
    apt install -y openssl
  else
    yum install -y openssl
  fi
fi
echo -e "${GREEN}✓ OpenSSL đã sẵn sàng${NC}"

# 3. Tạo Self-Signed Certificate
echo -e "\n${BLUE}[3/5] Tạo Self-Signed SSL Certificate...${NC}"

# Tạo thư mục chứa certificate
SSL_DIR="/etc/nginx/ssl"
mkdir -p $SSL_DIR

# Tạo private key và certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout $SSL_DIR/nginx-selfsigned.key \
  -out $SSL_DIR/nginx-selfsigned.crt \
  -subj "/C=VN/ST=HCM/L=HCM/O=Development/CN=$PUBLIC_IP" \
  -addext "subjectAltName=IP:$PUBLIC_IP"

# Tạo Diffie-Hellman group
echo -e "${YELLOW}Đang tạo Diffie-Hellman parameters (có thể mất vài phút)...${NC}"
openssl dhparam -out $SSL_DIR/dhparam.pem 2048

# Set permissions
chmod 600 $SSL_DIR/nginx-selfsigned.key
chmod 644 $SSL_DIR/nginx-selfsigned.crt
chmod 644 $SSL_DIR/dhparam.pem

echo -e "${GREEN}✓ Self-Signed Certificate đã được tạo${NC}"
echo -e "${CYAN}  - Certificate: $SSL_DIR/nginx-selfsigned.crt${NC}"
echo -e "${CYAN}  - Private Key: $SSL_DIR/nginx-selfsigned.key${NC}"
echo -e "${CYAN}  - DH Params: $SSL_DIR/dhparam.pem${NC}"

# 4. Cấu hình Nginx
echo -e "\n${BLUE}[4/5] Cấu hình Nginx...${NC}"

if [[ "$OS" == *"Ubuntu"* ]]; then
  NGINX_CONF="/etc/nginx/sites-available/secure-doc"
  NGINX_ENABLED="/etc/nginx/sites-enabled/secure-doc"
else
  NGINX_CONF="/etc/nginx/conf.d/secure-doc.conf"
  NGINX_ENABLED=""
fi

# Tạo cấu hình Nginx với HTTPS
cat > $NGINX_CONF << EOL
# HTTP server - redirect to HTTPS
server {
    listen 80;
    server_name $PUBLIC_IP;
    return 301 https://\$server_name\$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name $PUBLIC_IP;

    # SSL certificate
    ssl_certificate $SSL_DIR/nginx-selfsigned.crt;
    ssl_certificate_key $SSL_DIR/nginx-selfsigned.key;
    ssl_dhparam $SSL_DIR/dhparam.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # CORS headers (cho phép Vercel frontend truy cập)
    # Thay đổi origin theo domain Vercel của bạn
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS, PATCH" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type, X-Requested-With" always;
    add_header Access-Control-Allow-Credentials "true" always;

    # Handle preflight requests
    if (\$request_method = OPTIONS) {
        return 204;
    }

    # Request size limits
    client_max_body_size 50M;

    # Proxy to Node.js app
    location / {
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

# Kích hoạt cấu hình (Ubuntu)
if [[ "$OS" == *"Ubuntu"* ]] && [ -n "$NGINX_ENABLED" ]; then
  ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
  rm -f /etc/nginx/sites-enabled/default
fi

echo -e "${GREEN}✓ Cấu hình Nginx đã được tạo${NC}"

# 5. Test và reload Nginx
echo -e "\n${BLUE}[5/5] Kiểm tra và khởi động lại Nginx...${NC}"

nginx -t

if [ $? -eq 0 ]; then
  systemctl reload nginx
  echo -e "${GREEN}✓ Nginx đã được reload thành công${NC}"
else
  echo -e "${RED}✗ Cấu hình Nginx không hợp lệ!${NC}"
  exit 1
fi

# Hiển thị thông tin certificate
echo -e "\n${CYAN}===== Thông tin Certificate =====${NC}"
openssl x509 -in $SSL_DIR/nginx-selfsigned.crt -noout -subject -dates

# Hoàn tất
echo -e "\n${GREEN}===== Cấu hình HTTPS hoàn tất! =====${NC}"
echo -e "${GREEN}✓ API có thể truy cập tại: https://$PUBLIC_IP${NC}"
echo -e "${GREEN}✓ Health check: https://$PUBLIC_IP/api/health${NC}"

echo -e "\n${YELLOW}===== Lưu ý quan trọng =====${NC}"
echo -e "${YELLOW}1. Self-signed certificate sẽ hiện cảnh báo 'Not Secure' trên trình duyệt${NC}"
echo -e "${YELLOW}2. Người dùng cần click 'Advanced' > 'Proceed to ...' để tiếp tục${NC}"
echo -e "${YELLOW}3. Đối với Vercel frontend:${NC}"
echo -e "   - Bạn cần chấp nhận certificate trong trình duyệt trước${NC}"
echo -e "   - Hoặc cấu hình CORS để cho phép tất cả origins (*)${NC}"
echo -e "${YELLOW}4. Certificate có hiệu lực 365 ngày${NC}"
echo -e "${YELLOW}5. Kiểm tra Security Group AWS đã mở port 443${NC}"

echo -e "\n${CYAN}===== Cập nhật cấu hình =====${NC}"
echo -e "1. Cập nhật .env.prod trên EC2:"
echo -e "   ${CYAN}nano .env.prod${NC}"
echo -e "   ${CYAN}APP_URL=https://$PUBLIC_IP${NC}"
echo -e ""
echo -e "2. Restart container:"
echo -e "   ${CYAN}docker-compose -f docker-compose.prod.yml --env-file .env.prod restart app${NC}"
echo -e ""
echo -e "3. Cập nhật biến môi trường trên Vercel:"
echo -e "   ${CYAN}NEXT_PUBLIC_API_URL=https://$PUBLIC_IP${NC}"
echo -e ""
echo -e "4. Nếu muốn cấu hình CORS cho domain Vercel cụ thể:"
echo -e "   ${CYAN}sudo nano $NGINX_CONF${NC}"
echo -e "   Thay 'Access-Control-Allow-Origin \"*\"' bằng domain Vercel của bạn"
echo -e "   ${CYAN}sudo nginx -t && sudo systemctl reload nginx${NC}"

echo -e "\n${CYAN}===== Kiểm tra =====${NC}"
echo -e "curl -k -I https://$PUBLIC_IP/api/health"
echo -e "(Option -k bỏ qua kiểm tra certificate)"
