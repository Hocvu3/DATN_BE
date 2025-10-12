#!/bin/bash

# ===== EC2 INITIAL SETUP SCRIPT =====
# Run this script on your EC2 instance to set up the environment
export DEBIAN_FRONTEND=noninteractive

set -e

echo "🚀 Setting up EC2 instance for Secure Document Management System..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
echo "📦 Installing required packages..."
sudo apt install -y \
    curl \
    wget \
    git \
    nginx \
    ufw \
    fail2ban \
    htop \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

# Install Docker
echo "🐳 Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker ubuntu
    sudo systemctl enable docker
    sudo systemctl start docker
fi

# Install Docker Compose (standalone)
echo "🐳 Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Configure firewall
echo "🔥 Configuring firewall..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

# Configure fail2ban
echo "🛡️ Configuring fail2ban..."
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Create application directory
echo "📁 Creating application directory..."
sudo mkdir -p /home/ubuntu/secure-document-management
sudo chown ubuntu:ubuntu /home/ubuntu/secure-document-management

# Clone repository
echo "📥 Cloning repository..."
cd /home/ubuntu
if [ ! -d "secure-document-management/.git" ]; then
    git clone https://github.com/Hocvu3/DATN_BE.git secure-document-management
else
    cd secure-document-management
    git pull origin main
fi

cd /home/ubuntu/secure-document-management

# Create SSL directory and generate self-signed certificates (for testing)
echo "🔐 Setting up SSL certificates..."
sudo mkdir -p nginx/ssl
if [ ! -f "nginx/ssl/cert.pem" ]; then
    sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/key.pem \
        -out nginx/ssl/cert.pem \
        -subj "/C=VN/ST=HCM/L=HCM/O=SecureDoc/CN=localhost"
fi

# Set proper permissions
sudo chown -R ubuntu:ubuntu /home/ubuntu/secure-document-management
sudo chmod 600 nginx/ssl/key.pem
sudo chmod 644 nginx/ssl/cert.pem

# Create environment file template
echo "📄 Creating environment file..."
if [ ! -f ".env.prod" ]; then
    cp .env.prod.example .env.prod
    echo "⚠️  Please edit .env.prod with your production values!"
fi

# Create systemd service for auto-start
echo "🔧 Creating systemd service..."
sudo tee /etc/systemd/system/secure-document-management.service > /dev/null <<EOF
[Unit]
Description=Secure Document Management System
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ubuntu/secure-document-management
ExecStart=/usr/local/bin/docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.prod.yml --env-file .env.prod down
TimeoutStartSec=300
User=ubuntu
Group=docker

[Install]
WantedBy=multi-user.target
EOF

# Enable the service
sudo systemctl daemon-reload
sudo systemctl enable secure-document-management.service

# Create log rotation
echo "📋 Setting up log rotation..."
sudo tee /etc/logrotate.d/secure-document-management > /dev/null <<EOF
/home/ubuntu/secure-document-management/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF

# Install monitoring tools
echo "📊 Installing monitoring tools..."
if ! command -v htop &> /dev/null; then
    sudo apt install -y htop iotop netstat-nat
fi

# Setup automatic security updates
echo "🔄 Setting up automatic security updates..."
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Create backup script
echo "💾 Creating backup script..."
sudo tee /home/ubuntu/backup.sh > /dev/null <<'EOF'
#!/bin/bash
BACKUP_DIR="/home/ubuntu/backups"
DATE=$(date +%Y%m%d_%H%M%S)
PROJECT_DIR="/home/ubuntu/secure-document-management"

mkdir -p $BACKUP_DIR

# Backup database
docker exec secure_doc_postgres pg_dump -U postgres secure_document_management > $BACKUP_DIR/db_backup_$DATE.sql

# Backup uploaded files
tar -czf $BACKUP_DIR/uploads_backup_$DATE.tar.gz -C $PROJECT_DIR uploads/

# Backup environment files
cp $PROJECT_DIR/.env.prod $BACKUP_DIR/env_backup_$DATE

# Clean old backups (keep last 7 days)
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

sudo chmod +x /home/ubuntu/backup.sh

# Setup backup cron job
echo "⏰ Setting up backup cron job..."
(crontab -l 2>/dev/null; echo "0 2 * * * /home/ubuntu/backup.sh >> /var/log/backup.log 2>&1") | crontab -

# Create monitoring script
echo "📊 Creating monitoring script..."
sudo tee /home/ubuntu/monitor.sh > /dev/null <<'EOF'
#!/bin/bash

echo "=== System Status ==="
echo "Date: $(date)"
echo "Uptime: $(uptime)"
echo "Disk Usage: $(df -h / | tail -1 | awk '{print $5}')"
echo "Memory Usage: $(free -m | grep Mem | awk '{printf "%.2f%%\n", $3/$2 * 100.0}')"
echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)"

echo ""
echo "=== Docker Status ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=== Application Health ==="
curl -s http://localhost/api/health || echo "Health check failed"

echo ""
echo "=== Recent Logs ==="
docker logs secure_doc_app --tail 10 2>/dev/null || echo "No app logs available"
EOF

sudo chmod +x /home/ubuntu/monitor.sh

echo ""
echo "✅ EC2 setup completed successfully!"
echo ""
echo "🔧 Next steps:"
echo "1. Edit /home/ubuntu/secure-document-management/.env.prod with your production values"
echo "2. Replace the self-signed SSL certificates with real ones from Let's Encrypt"
echo "3. Start the application: sudo systemctl start secure-document-management"
echo "4. Check status: sudo systemctl status secure-document-management"
echo "5. Monitor: /home/ubuntu/monitor.sh"
echo ""
echo "📚 Useful commands:"
echo "  - Check logs: docker logs secure_doc_app"
echo "  - Restart services: sudo systemctl restart secure-document-management"
echo "  - Update app: cd /home/ubuntu/secure-document-management && git pull && docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d --build"
echo ""
echo "🌐 Your application will be available at:"
echo "  - HTTP: http://$(curl -s ifconfig.me)"
echo "  - HTTPS: https://$(curl -s ifconfig.me)"