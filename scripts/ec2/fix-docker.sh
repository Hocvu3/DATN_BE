#!/bin/bash

# ===== FIX DOCKER PERMISSIONS =====

echo "🔧 Fixing Docker permissions..."

# Add user to docker group
sudo usermod -aG docker ubuntu

# Start docker service
sudo systemctl enable docker
sudo systemctl start docker

# Fix docker socket permissions
sudo chmod 666 /var/run/docker.sock

echo "✅ Docker permissions fixed!"
echo "💡 You may need to logout and login again for group changes to take effect"
echo ""
echo "To test: docker ps"