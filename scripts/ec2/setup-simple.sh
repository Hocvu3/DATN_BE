#!/bin/bash

# ===== SIMPLE EC2 SETUP SCRIPT =====
# Non-interactive setup for EC2 instance

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

set -e

echo "🚀 Setting up EC2 instance for Secure Document Management System..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install essential packages
echo "📦 Installing essential packages..."
sudo apt install -y curl wget git ufw htop unzip

# Install Docker
echo "🐳 Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker ubuntu
    sudo systemctl enable docker
    sudo systemctl start docker
    rm get-docker.sh
fi

# Install Docker Compose
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

# Create application directory
echo "📁 Creating application directory..."
mkdir -p /home/ubuntu/secure-document-management
cd /home/ubuntu/secure-document-management

# Clone repository
echo "📥 Cloning repository..."
if [ ! -d ".git" ]; then
    git clone https://github.com/Hocvu3/DATN_BE.git .
else
    git pull origin main
fi

# Create SSL directory with self-signed certificates
echo "🔐 Setting up SSL certificates..."
mkdir -p nginx/ssl
if [ ! -f "nginx/ssl/cert.pem" ]; then
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/key.pem \
        -out nginx/ssl/cert.pem \
        -subj "/C=VN/ST=HCM/L=HCM/O=SecureDoc/CN=localhost" \
        2>/dev/null || true
fi

# Set permissions
chmod 600 nginx/ssl/key.pem 2>/dev/null || true
chmod 644 nginx/ssl/cert.pem 2>/dev/null || true

# Create environment file
echo "📄 Creating environment file..."
if [ ! -f ".env.prod" ]; then
    cp .env.prod.example .env.prod
    echo "⚠️  Please edit .env.prod with your production values!"
fi

# Create simple monitoring script
echo "📊 Creating monitoring script..."
cat > /home/ubuntu/monitor.sh << 'EOF'
#!/bin/bash
echo "=== System Status ==="
echo "Date: $(date)"
echo "Uptime: $(uptime)"
echo "Disk Usage: $(df -h / | tail -1 | awk '{print $5}')"
echo ""
echo "=== Docker Status ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "Docker not running"
echo ""
echo "=== Application Health ==="
curl -s http://localhost/api/health || echo "Application not responding"
EOF

chmod +x /home/ubuntu/monitor.sh

echo ""
echo "✅ Basic EC2 setup completed!"
echo ""
echo "🔧 Next steps:"
echo "1. Edit /home/ubuntu/secure-document-management/.env.prod"
echo "2. Start application:"
echo "   cd /home/ubuntu/secure-document-management"
echo "   docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d"
echo ""
echo "📊 Monitor: /home/ubuntu/monitor.sh"
echo "🌐 Access: http://$(curl -s ifconfig.me 2>/dev/null || echo 'your-ec2-ip')"