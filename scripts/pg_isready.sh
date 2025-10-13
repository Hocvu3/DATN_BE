
echo "🔧 Đang khắc phục lỗi pg_isready và bcrypt..."

# 1. Kiểm tra và sửa lỗi pg_isready trong startup-new.sh
APP_CONTAINER=$(docker ps -a | grep app | awk '{print $1}')
if [ -n "$APP_CONTAINER" ]; then
  echo "📝 Đang kiểm tra file startup-new.sh..."
  # Sửa lỗi pg_isready bằng cách chỉ định đúng tham số
  docker exec $APP_CONTAINER sh -c "sed -i 's/pg_isready -U/pg_isready -h postgres -U postgres/g' scripts/startup-new.sh"
  echo "✅ Đã cập nhật lệnh pg_isready trong startup-new.sh"
  
  # 2. Cài đặt @types/bcrypt để khắc phục lỗi TypeScript
  echo "📦 Đang cài đặt @types/bcrypt..."
  docker exec $APP_CONTAINER npm install --save-dev @types/bcrypt
  echo "✅ Đã cài đặt @types/bcrypt"
  
  # 3. Khởi động lại container
  echo "🔄 Đang khởi động lại container..."
  docker restart $APP_CONTAINER
  echo "✅ Đã khởi động lại container"
else
  echo "❌ Không tìm thấy container app!"
fi

echo "🎉 Hoàn tất khắc phục lỗi!"