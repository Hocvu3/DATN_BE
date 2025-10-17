#!/bin/bash
# Script cleanup và chạy lại setup HTTPS
# Tạo bởi GitHub Copilot ngày 18/10/2025

echo "🧹 Dọn dẹp cấu hình HTTPS cũ..."

# Xóa cấu hình Nginx cũ
sudo rm -f /etc/nginx/sites-available/secure-doc
sudo rm -f /etc/nginx/sites-enabled/secure-doc
sudo rm -f /etc/nginx/conf.d/secure-doc.conf

# Xóa SSL certificates cũ (nếu bị lỗi)
# Cẩn thận: Chỉ xóa nếu muốn tạo lại từ đầu
# sudo rm -rf /etc/nginx/ssl/*

echo "✓ Đã dọn dẹp"

# Reload Nginx
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "📝 Bây giờ bạn có thể chạy lại:"
echo "sudo bash scripts/setup-https-self-signed.sh"
