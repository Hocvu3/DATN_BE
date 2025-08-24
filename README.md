<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

# Secure Document Management System

Hệ thống quản lý văn bản an toàn cho doanh nghiệp với tích hợp DevSecOps và PostgreSQL security.

## 🚀 Tính năng chính

### 🔐 Bảo mật
- **Row Level Security (RLS)** trong PostgreSQL
- **Encryption** cho dữ liệu nhạy cảm
- **Audit logging** toàn diện
- **Access Control** dựa trên role và department
- **Digital Signature** hỗ trợ

### 📄 Quản lý văn bản
- Upload và version control
- Approval workflow
- Full-text search với PostgreSQL
- OCR integration
- Watermarking và DLP
- Tagging system

### 👥 Quản lý người dùng
- Role-based access control
- Department management
- User activity tracking
- Real-time notifications

### 🔍 Tìm kiếm và phân tích
- Full-text search với PostgreSQL
- Advanced filtering
- Audit trail
- Security analytics

## 🛠️ Công nghệ sử dụng

- **Backend**: NestJS + TypeScript
- **Database**: PostgreSQL với Prisma ORM
- **Security**: Row Level Security, Encryption, Audit
- **DevSecOps**: Github Action CI/CD, SAST, DAST
- **Search**: PostgreSQL Full-text Search
- **Authentication**: JWT + bcrypt

## 📋 Yêu cầu hệ thống

- Node.js 18+
- PostgreSQL 14+
- Docker (tùy chọn)

## 🚀 Cài đặt và chạy

### 1. Clone repository
```bash
git clone <repository-url>
cd datn_be
```

### 2. Cài đặt dependencies
```bash
npm install
```

### 3. Cấu hình database
Tạo file `.env` từ `config/database.env`:
```bash
cp config/database.env .env
```

Cập nhật thông tin kết nối PostgreSQL trong file `.env`:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/secure_document_management?schema=public"
```

### 4. Thiết lập database
```bash
# Tạo database và chạy migrations
npm run db:setup

# Hoặc từng bước:
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run migrations
npm run db:seed        # Seed sample data
```

### 5. Chạy ứng dụng
```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## 🗄️ Cấu trúc Database

### Core Tables
- `users` - Quản lý người dùng
- `roles` - Phân quyền
- `departments` - Phòng ban
- `documents` - Văn bản chính
- `document_versions` - Phiên bản văn bản
- `attachments` - File đính kèm

### Security Tables
- `audit_logs` - Nhật ký audit
- `digital_signatures` - Chữ ký số
- `signature_requests` - Yêu cầu ký

### Support Tables
- `tags` - Thẻ phân loại
- `comments` - Bình luận
- `notifications` - Thông báo

## 🔐 Bảo mật PostgreSQL

### Row Level Security (RLS)
- Mỗi bảng đều có RLS policies
- Access control dựa trên role và department
- Security level filtering

### Encryption
- PGP encryption cho dữ liệu nhạy cảm
- Encrypted file storage
- Secure key management

### Audit Logging
- Tự động log mọi thay đổi
- IP address và user agent tracking
- Immutable audit trail

## 📊 API Endpoints

### Authentication
- `POST /auth/login` - Đăng nhập
- `POST /auth/logout` - Đăng xuất
- `POST /auth/refresh` - Refresh token

### Documents
- `GET /documents` - Danh sách văn bản
- `POST /documents` - Tạo văn bản mới
- `GET /documents/:id` - Chi tiết văn bản
- `PUT /documents/:id` - Cập nhật văn bản
- `DELETE /documents/:id` - Xóa văn bản

### Users & Roles
- `GET /users` - Danh sách người dùng
- `POST /users` - Tạo người dùng mới
- `GET /roles` - Danh sách vai trò
- `GET /departments` - Danh sách phòng ban

### Audit & Security
- `GET /audit-logs` - Nhật ký audit
- `GET /security/analytics` - Phân tích bảo mật

## 🔍 Tìm kiếm Full-text

```sql
-- Tìm kiếm văn bản với PostgreSQL FTS
SELECT * FROM documents 
WHERE to_tsvector('simple', title || ' ' || description || ' ' || document_number) 
@@ plainto_tsquery('simple', 'search term');
```

## 🚀 DevSecOps Pipeline

### GitLab CI/CD
```yaml
stages:
  - install
  - test
  - sast
  - build
  - dast
  - deploy
```

### Security Scanning
- **SAST**: SonarQube analysis
- **DAST**: OWASP ZAP testing
- **Secret scanning**: GitGuardian
- **Dependency scanning**: npm audit

## 📝 Scripts hữu ích

```bash
# Database management
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run migrations
npm run db:seed        # Seed data
npm run db:studio      # Open Prisma Studio
npm run db:reset       # Reset database

# Development
npm run start:dev      # Start with hot reload
npm run lint           # Run ESLint
npm run test           # Run tests
```

## 🔐 Default Credentials

Sau khi chạy seed, sử dụng các tài khoản mặc định:

- **Admin**: `admin@company.com` / `admin123`
- **Manager**: `manager@company.com` / `user123`
- **Employee**: `employee@company.com` / `user123`

## 📚 Tài liệu tham khảo

- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)
- [NestJS Documentation](https://docs.nestjs.com)
- [DevSecOps Best Practices](https://owasp.org/www-project-devsecops-guideline/)

## 🤝 Đóng góp

1. Fork repository
2. Tạo feature branch
3. Commit changes
4. Push to branch
5. Tạo Pull Request

## 📄 License

MIT License - xem file [LICENSE](LICENSE) để biết thêm chi tiết.

---

**Lưu ý**: Đây là hệ thống demo cho mục đích học tập. Trong môi trường production, hãy đảm bảo:
- Thay đổi tất cả mật khẩu mặc định
- Cấu hình SSL/TLS
- Thiết lập backup strategy
- Monitoring và alerting
- Security hardening
