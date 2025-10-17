#!/bin/bash
# Script kiểm tra trạng thái HTTPS
# Tạo bởi GitHub Copilot ngày 18/10/2025

# Màu sắc
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}===== Kiểm tra trạng thái HTTPS =====${NC}\n"

# Nhập domain
if [ -z "$1" ]; then
  echo -e "${YELLOW}Nhập tên miền (ví dụ: api.example.com):${NC}"
  read -p "Domain: " DOMAIN
else
  DOMAIN=$1
fi

if [ -z "$DOMAIN" ]; then
  echo -e "${RED}Tên miền không được để trống!${NC}"
  exit 1
fi

# 1. Kiểm tra DNS
echo -e "${CYAN}[1] Kiểm tra DNS...${NC}"
DOMAIN_IP=$(dig +short $DOMAIN | tail -n1)
if [ -z "$DOMAIN_IP" ]; then
  echo -e "${RED}✗ Domain không trỏ đến IP nào${NC}"
else
  echo -e "${GREEN}✓ Domain trỏ đến: $DOMAIN_IP${NC}"
fi

# 2. Kiểm tra HTTP (port 80)
echo -e "\n${CYAN}[2] Kiểm tra HTTP (port 80)...${NC}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://$DOMAIN/api/health --max-time 5)
if [ "$HTTP_STATUS" == "301" ] || [ "$HTTP_STATUS" == "302" ]; then
  echo -e "${GREEN}✓ HTTP redirect đến HTTPS (status: $HTTP_STATUS)${NC}"
elif [ "$HTTP_STATUS" == "200" ]; then
  echo -e "${YELLOW}⚠ HTTP đang hoạt động nhưng không redirect (status: $HTTP_STATUS)${NC}"
else
  echo -e "${RED}✗ HTTP không phản hồi (status: $HTTP_STATUS)${NC}"
fi

# 3. Kiểm tra HTTPS (port 443)
echo -e "\n${CYAN}[3] Kiểm tra HTTPS (port 443)...${NC}"
HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN/api/health --max-time 5)
if [ "$HTTPS_STATUS" == "200" ]; then
  echo -e "${GREEN}✓ HTTPS đang hoạt động (status: $HTTPS_STATUS)${NC}"
else
  echo -e "${RED}✗ HTTPS không phản hồi (status: $HTTPS_STATUS)${NC}"
fi

# 4. Kiểm tra SSL certificate
echo -e "\n${CYAN}[4] Kiểm tra SSL certificate...${NC}"
SSL_INFO=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -dates -issuer -subject 2>/dev/null)

if [ -z "$SSL_INFO" ]; then
  echo -e "${RED}✗ Không tìm thấy SSL certificate${NC}"
else
  echo -e "${GREEN}✓ SSL certificate tìm thấy${NC}"
  
  # Hiển thị thông tin certificate
  echo -e "\n${YELLOW}Thông tin certificate:${NC}"
  echo "$SSL_INFO" | while read line; do
    echo -e "  ${CYAN}$line${NC}"
  done
  
  # Kiểm tra ngày hết hạn
  EXPIRY_DATE=$(echo "$SSL_INFO" | grep "notAfter" | cut -d= -f2)
  EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$EXPIRY_DATE" +%s 2>/dev/null)
  NOW_EPOCH=$(date +%s)
  DAYS_LEFT=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))
  
  if [ $DAYS_LEFT -gt 30 ]; then
    echo -e "${GREEN}✓ Certificate còn $DAYS_LEFT ngày${NC}"
  elif [ $DAYS_LEFT -gt 0 ]; then
    echo -e "${YELLOW}⚠ Certificate còn $DAYS_LEFT ngày (sắp hết hạn!)${NC}"
  else
    echo -e "${RED}✗ Certificate đã hết hạn!${NC}"
  fi
fi

# 5. Kiểm tra TLS version
echo -e "\n${CYAN}[5] Kiểm tra TLS version...${NC}"
TLS_VERSION=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | grep "Protocol" | awk '{print $3}')
if [ -n "$TLS_VERSION" ]; then
  echo -e "${GREEN}✓ TLS Version: $TLS_VERSION${NC}"
else
  echo -e "${RED}✗ Không xác định được TLS version${NC}"
fi

# 6. Kiểm tra CORS headers
echo -e "\n${CYAN}[6] Kiểm tra CORS headers...${NC}"
CORS_ORIGIN=$(curl -s -I https://$DOMAIN/api/health | grep -i "access-control-allow-origin" | cut -d: -f2- | tr -d '\r')
if [ -n "$CORS_ORIGIN" ]; then
  echo -e "${GREEN}✓ CORS Origin:$CORS_ORIGIN${NC}"
else
  echo -e "${YELLOW}⚠ Không tìm thấy CORS headers${NC}"
fi

# 7. Kiểm tra Security headers
echo -e "\n${CYAN}[7] Kiểm tra Security headers...${NC}"
HEADERS=$(curl -s -I https://$DOMAIN/api/health)

check_header() {
  HEADER_NAME=$1
  if echo "$HEADERS" | grep -qi "$HEADER_NAME"; then
    echo -e "${GREEN}✓ $HEADER_NAME${NC}"
  else
    echo -e "${YELLOW}⚠ $HEADER_NAME không tìm thấy${NC}"
  fi
}

check_header "Strict-Transport-Security"
check_header "X-Frame-Options"
check_header "X-Content-Type-Options"
check_header "X-XSS-Protection"

# 8. Kiểm tra Mixed Content
echo -e "\n${CYAN}[8] Kiểm tra Mixed Content...${NC}"
if [ "$HTTPS_STATUS" == "200" ]; then
  RESPONSE=$(curl -s https://$DOMAIN/api/health)
  if echo "$RESPONSE" | grep -q "http://"; then
    echo -e "${YELLOW}⚠ Phát hiện HTTP links trong response (có thể gây Mixed Content)${NC}"
  else
    echo -e "${GREEN}✓ Không phát hiện Mixed Content${NC}"
  fi
fi

# Tổng kết
echo -e "\n${BLUE}===== Tổng kết =====${NC}"
if [ "$HTTPS_STATUS" == "200" ] && [ $DAYS_LEFT -gt 30 ]; then
  echo -e "${GREEN}✓ HTTPS đã được cấu hình đúng và hoạt động tốt!${NC}"
  echo -e "${GREEN}✓ Có thể sử dụng: https://$DOMAIN${NC}"
else
  echo -e "${YELLOW}⚠ Một số vấn đề cần xem xét:${NC}"
  
  if [ "$HTTPS_STATUS" != "200" ]; then
    echo -e "  ${RED}- HTTPS không hoạt động${NC}"
  fi
  
  if [ $DAYS_LEFT -lt 30 ] && [ $DAYS_LEFT -gt 0 ]; then
    echo -e "  ${YELLOW}- Certificate sắp hết hạn${NC}"
  fi
  
  if [ $DAYS_LEFT -le 0 ]; then
    echo -e "  ${RED}- Certificate đã hết hạn${NC}"
  fi
fi

# Gợi ý kiểm tra thêm
echo -e "\n${CYAN}Kiểm tra SSL rating tại:${NC}"
echo -e "https://www.ssllabs.com/ssltest/analyze.html?d=$DOMAIN"
