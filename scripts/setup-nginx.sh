#!/bin/bash
# Script thiết lập Nginx cho API trên EC2
# Tạo bởi GitHub Copilot ngày 13/10/2025

# Màu sắc để hiển thị đẹp hơn
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}===== Cài đặt và cấu hình Nginx =====${NC}"

# Kiểm tra quyền root
if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}Bạn cần chạy script này với quyền sudo${NC}"
  echo -e "Ví dụ: sudo $0"
  exit 1
fi

# Kiểm tra OS và cài đặt Nginx
echo -e "${YELLOW}Đang kiểm tra và cài đặt Nginx...${NC}"

# Kiểm tra loại OS (Amazon Linux, Ubuntu, etc.)
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$NAME
  VER=$VERSION_ID
else
  OS=$(uname -s)
  VER=$(uname -r)
fi

# Cài đặt Nginx theo loại OS
if [[ "$OS" == *"Ubuntu"* ]]; then
  echo -e "${YELLOW}Đang cài đặt Nginx trên Ubuntu...${NC}"
  apt update -y
  apt install -y nginx
elif [[ "$OS" == *"Amazon"* ]]; then
  echo -e "${YELLOW}Đang cài đặt Nginx trên Amazon Linux...${NC}"
  amazon-linux-extras install nginx1 -y
else
  echo -e "${YELLOW}Đang cài đặt Nginx (OS không xác định)...${NC}"
  yum install -y nginx
fi

# Kiểm tra Nginx đã cài đặt chưa
if ! command -v nginx &> /dev/null; then
  echo -e "${RED}Cài đặt Nginx thất bại!${NC}"
  exit 1
fi

# Đường dẫn cấu hình Nginx (thay đổi tùy theo OS)
if [[ "$OS" == *"Ubuntu"* ]]; then
  NGINX_CONF_PATH="/etc/nginx/sites-available/secure-doc.conf"
  NGINX_ENABLED_PATH="/etc/nginx/sites-enabled/secure-doc.conf"
else
  NGINX_CONF_PATH="/etc/nginx/conf.d/secure-doc.conf"
  NGINX_ENABLED_PATH=""
fi

# Tạo file cấu hình Nginx
echo -e "${YELLOW}Đang tạo cấu hình Nginx...${NC}"

cat > $NGINX_CONF_PATH << 'EOL'
server {
    listen 80;
    server_name _;

    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Request size limits
    client_max_body_size 10M;

    # Default proxy configuration
    location / {
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

    # Block common security threats
    location ~* /(wp-admin|wp-login|phpmyadmin) {
        return 404;
    }
}
EOL

# Kích hoạt cấu hình (chỉ cần cho Ubuntu)
if [[ "$OS" == *"Ubuntu"* ]] && [ -n "$NGINX_ENABLED_PATH" ]; then
  ln -sf "$NGINX_CONF_PATH" "$NGINX_ENABLED_PATH"
  # Xóa cấu hình mặc định nếu có
  if [ -f /etc/nginx/sites-enabled/default ]; then
    rm /etc/nginx/sites-enabled/default
  fi
fi

# Kiểm tra cấu hình
echo -e "${YELLOW}Kiểm tra cấu hình Nginx...${NC}"
nginx -t

# Nếu cấu hình OK thì khởi động lại Nginx
if [ $? -eq 0 ]; then
  echo -e "${YELLOW}Khởi động lại Nginx...${NC}"
  
  if systemctl is-active --quiet nginx; then
    systemctl restart nginx
  else
    systemctl start nginx
  fi
  
  # Bật auto-start khi reboot
  systemctl enable nginx
  
  echo -e "${GREEN}Nginx đã được cấu hình và khởi động thành công!${NC}"
else
  echo -e "${RED}Cấu hình Nginx không hợp lệ!${NC}"
  exit 1
fi

# Kiểm tra firewall và mở cổng 80 nếu cần
echo -e "${YELLOW}Kiểm tra và cấu hình firewall...${NC}"

# Kiểm tra firewalld
if command -v firewall-cmd &> /dev/null; then
  echo -e "${YELLOW}Đang cấu hình firewalld...${NC}"
  firewall-cmd --permanent --add-service=http
  firewall-cmd --reload
  echo -e "${GREEN}Đã mở cổng 80 trong firewalld${NC}"
# Kiểm tra ufw (Ubuntu)
elif command -v ufw &> /dev/null; then
  echo -e "${YELLOW}Đang cấu hình ufw...${NC}"
  ufw allow 'Nginx HTTP'
  echo -e "${GREEN}Đã mở cổng 80 trong ufw${NC}"
else
  echo -e "${YELLOW}Không tìm thấy firewall (firewalld/ufw)${NC}"
fi

# Thông báo hoàn tất
echo -e "\n${GREEN}===== Cài đặt Nginx hoàn tất! =====${NC}"
echo -e "API có thể truy cập tại: ${GREEN}http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)/api${NC}"
echo -e "Kiểm tra trạng thái: ${GREEN}http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)/api/health${NC}"