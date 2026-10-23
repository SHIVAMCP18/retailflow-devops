#!/bin/bash
# Runs as root on the VM's first boot (and every reboot; each step is safe to repeat).
set -e

# 1. Docker + Docker Compose
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

# 2. 1 GB swap file as a safety net (the e2-micro has 1 GB of RAM)
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon -a || true

# 3. App folder with a .env holding a random database password (created once, never in Git)
mkdir -p /opt/retailflow
if [ ! -f /opt/retailflow/.env ]; then
  ip=$(curl -s -H "Metadata-Flavor: Google" \
    http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)
  cat > /opt/retailflow/.env <<ENV
SITE_ADDRESS=retailflow.${ip}.sslip.io
HTTP_PORT=80
HTTPS_PORT=443
POSTGRES_PASSWORD=$(openssl rand -hex 24)
IMAGE=ghcr.io/shivamcp18/retailflow
TAG=latest
ENV
  chmod 600 /opt/retailflow/.env
fi
echo "retailflow server ready"
