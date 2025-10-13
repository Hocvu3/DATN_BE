#!/bin/bash
# Script để kiểm tra truy cập API từ bên ngoài
# Tạo bởi GitHub Copilot ngày 13/10/2025

# Màu sắc để hiển thị đẹp hơn
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Lấy địa chỉ IP public của EC2 instance
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

echo -e "${BLUE}===== Kiểm tra truy cập API từ bên ngoài =====${NC}"
echo -e "Địa chỉ IP public: ${YELLOW}${PUBLIC_IP}${NC}"

# Kiểm tra endpoint sức khỏe API
echo -e "\n${BLUE}Kiểm tra endpoint /api/health...${NC}"
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://${PUBLIC_IP}/api/health)

if [ "$HEALTH_STATUS" = "200" ]; then
  echo -e "${GREEN}API health check: OK (HTTP 200)${NC}"
  echo -e "${GREEN}API có thể truy cập từ bên ngoài tại địa chỉ:${NC}"
  echo -e "${GREEN}http://${PUBLIC_IP}/api${NC}"
else
  echo -e "${RED}API health check thất bại với mã: ${HEALTH_STATUS}${NC}"
  echo -e "${RED}API không thể truy cập từ bên ngoài!${NC}"
  
  # Kiểm tra trực tiếp từ cổng 3000
  echo -e "\n${BLUE}Thử kiểm tra trực tiếp qua cổng 3000...${NC}"
  DIRECT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://${PUBLIC_IP}:3000/api/health)
  
  if [ "$DIRECT_STATUS" = "200" ]; then
    echo -e "${GREEN}Kết nối trực tiếp qua cổng 3000 thành công!${NC}"
    echo -e "${GREEN}API có thể truy cập tại:${NC}"
    echo -e "${GREEN}http://${PUBLIC_IP}:3000/api${NC}"
  else
    echo -e "${RED}Kết nối trực tiếp qua cổng 3000 thất bại với mã: ${DIRECT_STATUS}${NC}"
    
    # Kiểm tra các dịch vụ
    echo -e "\n${BLUE}Kiểm tra các dịch vụ đang chạy...${NC}"
    echo -e "${YELLOW}Docker containers:${NC}"
    docker ps
    
    echo -e "\n${YELLOW}Nginx status:${NC}"
    systemctl status nginx | grep Active || echo "Nginx service not found"
    
    echo -e "\n${YELLOW}Ports đang lắng nghe:${NC}"
    netstat -tulpn | grep '3000\|80'
    
    echo -e "\n${RED}Các bước xử lý vấn đề:${NC}"
    echo "1. Đảm bảo Docker container đang chạy: docker ps | grep secure_doc_app"
    echo "2. Kiểm tra logs: docker logs secure_doc_app"
    echo "3. Kiểm tra cấu hình Nginx: cat /etc/nginx/conf.d/secure-doc.conf"
    echo "4. Kiểm tra port binding trong docker-compose.prod.yml"
    echo "5. Kiểm tra security group AWS cho các cổng 80 và 3000"
  fi
fi