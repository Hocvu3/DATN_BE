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

## Tính năng chính

### Bảo mật
- Row Level Security (RLS) trong PostgreSQL
- Encryption cho dữ liệu nhạy cảm
- Audit logging toàn diện
- Access Control dựa trên role và department
- Digital Signature hỗ trợ

### Quản lý văn bản
- Upload và version control
- Approval workflow
- Full-text search với PostgreSQL
- OCR integration
- Watermarking và DLP
- Tagging system

### Quản lý người dùng
- Role-based access control
- Department management
- User activity tracking
- Real-time notifications

### Tìm kiếm và phân tích
- Full-text search với PostgreSQL
- Advanced filtering
- Audit trail
- Security analytics

## Công nghệ sử dụng

- Backend: NestJS + TypeScript
- Database: PostgreSQL với Prisma ORM
- Security: Row Level Security, Encryption, Audit
- DevSecOps: Github Action CI/CD, SAST, DAST
- Search: PostgreSQL Full-text Search
- Authentication: JWT + bcrypt

## Yêu cầu hệ thống

- Node.js 18+
- PostgreSQL 14+
- Docker (optional)

## Cài đặt và chạy

### Quick Start

```bash
# Clone repository
git clone <repository-url>
cd datn_be

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Update DATABASE_URL and other configs in .env

# Reset database and start application
npm run db:reset
npm run startup
```

Application will be available at http://localhost:3000

### API Documentation

Sau khi chạy ứng dụng, truy cập Swagger UI để xem đầy đủ API documentation:

http://localhost:3000/api

## Cấu trúc Database

### Core Tables
- users: Quản lý người dùng
- roles: Phân quyền
- departments: Phòng ban
- documents: Văn bản chính
- document_versions: Phiên bản văn bản
- attachments: File đính kèm

### Security Tables
- audit_logs: Nhật ký audit
- digital_signatures: Chữ ký số
- signature_requests: Yêu cầu ký

### Support Tables
- tags: Thẻ phân loại
- comments: Bình luận
- notifications: Thông báo

## Bảo mật PostgreSQL

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

## Default Credentials

Sau khi chạy seed, sử dụng các tài khoản mặc định:

- Admin: admin@company.com / admin123
- Manager: manager@company.com / user123
- Employee: employee@company.com / user123

## Available Scripts

```bash
# Database management
npm run db:reset       # Reset database (drop, create, migrate, seed, apply RLS)
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run migrations
npm run db:seed        # Seed data
npm run db:studio      # Open Prisma Studio

# Development
npm run startup        # Complete setup and start application
npm run start:dev      # Start with hot reload
npm run lint           # Run ESLint
npm run build          # Build for production
```

## DevSecOps Pipeline

### GitHub Actions Workflow

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
- SAST: SonarQube analysis
- DAST: OWASP ZAP testing
- Secret scanning: GitGuardian
- Dependency scanning: npm audit

## Tài liệu tham khảo

- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)
- [NestJS Documentation](https://docs.nestjs.com)
- [DevSecOps Best Practices](https://owasp.org/www-project-devsecops-guideline/)

## License

MIT License

## Production Deployment (EC2)

### Setup EC2 Instance

```bash
# SSH to EC2
ssh ubuntu@your-ec2-ip

# Run setup script
curl -sSL https://raw.githubusercontent.com/Hocvu3/DATN_BE/main/scripts/ec2/setup.sh | bash
```

### Configure Environment

```bash
cd /home/ubuntu/secure-document-management
nano .env.prod

# Update production values:
POSTGRES_PASSWORD=your_strong_password
APP_URL=https://yourdomain.com
JWT_SECRET=your-secure-jwt-secret
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
```

### Setup SSL (Optional)

```bash
./scripts/ec2/setup-ssl.sh yourdomain.com admin@yourdomain.com
```

### Deploy Application

```bash
./scripts/ec2/deploy.sh

# Or use systemd
sudo systemctl start secure-document-management
sudo systemctl status secure-document-management
```

### GitHub Actions Deployment

Add secrets in GitHub repository settings:

```
EC2_HOST=your-ec2-public-ip
EC2_SSH_PRIVATE_KEY=your-ec2-private-key-content
```

Push to main branch triggers automatic deployment.

### Monitoring Commands

```bash
# Application status
/home/ubuntu/monitor.sh

# View logs
docker logs secure_doc_app -f

# Manual backup
/home/ubuntu/backup.sh

# Restart services
docker-compose -f docker-compose.prod.yml --env-file .env.prod restart
```

### Architecture

```
Internet
  ↓
AWS ALB/CloudFlare (Optional)
  ↓
EC2 Instance - Nginx Reverse Proxy
  ↓
Docker Containers
  ├── App (NestJS Backend)
  ├── PostgreSQL Database
  └── Nginx (SSL Termination)
```

### Security Features

- SSL/TLS encryption with Let's Encrypt
- Firewall with UFW
- Fail2ban protection
- Docker security with non-root users
- Automated daily backups (2 AM)
- Log rotation and monitoring
- Health checks and auto-restart

### Useful Management Commands

```bash
# Application management
sudo systemctl start secure-document-management
sudo systemctl stop secure-document-management
sudo systemctl restart secure-document-management
sudo systemctl status secure-document-management

# Docker management
docker-compose -f docker-compose.prod.yml --env-file .env.prod ps
docker-compose -f docker-compose.prod.yml --env-file .env.prod logs app
docker-compose -f docker-compose.prod.yml --env-file .env.prod restart

# System monitoring
htop                    # System resources
docker stats           # Container resources
df -h                  # Disk usage
free -m                # Memory usage

# Backup and restore
/home/ubuntu/backup.sh                        # Manual backup
ls /home/ubuntu/backups/                      # List backups
docker exec -i secure_doc_postgres psql -U postgres -d secure_document_management < backup.sql
```

### Troubleshooting

Application not starting:

```bash
docker logs secure_doc_app
docker logs secure_doc_postgres
docker logs secure_doc_nginx
docker-compose -f docker-compose.prod.yml --env-file .env.prod restart
```

SSL issues:

```bash
ls -la nginx/ssl/
sudo certbot renew --dry-run
docker exec secure_doc_nginx nginx -t
```

Database issues:

```bash
docker exec secure_doc_postgres pg_isready -U postgres
docker exec -it secure_doc_postgres psql -U postgres -d secure_document_management
docker logs secure_doc_postgres
```

### Production Security Checklist

- Change all default passwords
- Configure SSL/TLS certificates
- Setup backup strategy and disaster recovery
- Configure monitoring and alerting (CloudWatch/Grafana)
- Regular security updates and patching
- Network security with VPC and Security Groups
- Database encryption at rest and in transit
