#!/bin/bash
# Script deploy nhanh - chỉ build và restart app, không động đến postgres
# Tạo bởi GitHub Copilot ngày 18/10/2025

# Màu sắc
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}===== Deploy App Nhanh (Không động đến Postgres) =====${NC}\n"

# Kiểm tra có thay đổi code không
if [ -d .git ]; then
  echo -e "${CYAN}Kiểm tra git status...${NC}"
  git fetch
  
  LOCAL=$(git rev-parse @)
  REMOTE=$(git rev-parse @{u})
  
  if [ $LOCAL != $REMOTE ]; then
    echo -e "${YELLOW}Có code mới trên remote, đang pull...${NC}"
    git pull origin main
    
    if [ $? -eq 0 ]; then
      echo -e "${GREEN}✓ Pull code thành công${NC}\n"
    else
      echo -e "${RED}✗ Pull code thất bại!${NC}"
      exit 1
    fi
  else
    echo -e "${GREEN}✓ Code đã là mới nhất${NC}\n"
  fi
fi

# Build lại image của app
echo -e "${CYAN}[1/3] Build lại image app...${NC}"
docker-compose -f docker-compose.prod.yml --env-file .env.prod build app

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Build thành công${NC}\n"
else
  echo -e "${RED}✗ Build thất bại!${NC}"
  exit 1
fi

# Dừng và khởi động lại container app
echo -e "${CYAN}[2/3] Restart container app...${NC}"
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d app

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Container đã được khởi động${NC}\n"
else
  echo -e "${RED}✗ Khởi động container thất bại!${NC}"
  exit 1
fi

# Chờ container khởi động
echo -e "${CYAN}[3/3] Chờ app khởi động...${NC}"
sleep 5

# Kiểm tra trạng thái
echo -e "\n${CYAN}Trạng thái containers:${NC}"
docker-compose -f docker-compose.prod.yml ps

# Hiển thị logs
echo -e "\n${YELLOW}Hiển thị logs (Ctrl+C để thoát):${NC}"
docker-compose -f docker-compose.prod.yml logs -f --tail=50 app
