#!/usr/bin/env bash
# ─── NexaPay — Oracle Cloud Always Free Setup (Oracle Linux 9) ───
# Shape: Ampere A1.Flex — 4 OCPU, 24 GB RAM, ARM64
# OS:    Oracle Linux 9
#
# Usage:
#   1. SSH into the instance as 'opc':  ssh opc@<VM_PUBLIC_IP>
#   2. Copy this script and run:        bash setup-ol9.sh
#
# What this does:
#   - Updates system packages (dnf)
#   - Installs Docker + Docker Compose plugin
#   - Installs Caddy (automatic HTTPS reverse proxy)
#   - Configures firewalld
#   - Clones the NexaPay repo (or pulls if exists)
#   - Creates .env from template
#   - Builds and starts all services via Docker Compose
#   - Sets up Caddy to reverse proxy to Docker containers

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ─── Check we're on ARM64 ───
ARCH=$(uname -m)
if [[ "$ARCH" != "aarch64" ]]; then
    warn "Expected ARM64 (aarch64) but got $ARCH. Continuing anyway..."
fi

# ─── System Update ───
log "Updating system packages (dnf)..."
sudo dnf update -y

# ─── Install useful tools ───
log "Installing tools (git, curl, openssl)..."
sudo dnf install -y git curl openssl ca-certificates

# ─── Install Docker ───
if ! command -v docker &>/dev/null; then
    log "Installing Docker..."
    sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
    sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo systemctl enable --now docker
    sudo usermod -aG docker opc
    log "Docker installed: $(docker --version)"
else
    log "Docker already installed: $(docker --version)"
fi

# ─── Install Caddy (automatic HTTPS) ───
if ! command -v caddy &>/dev/null; then
    log "Installing Caddy..."
    sudo dnf install -y 'dnf-command(copr)'
    sudo dnf copr enable -y @caddy/caddy
    sudo dnf install -y caddy
    sudo systemctl enable --now caddy
    log "Caddy installed: $(caddy version)"
else
    log "Caddy already installed: $(caddy version)"
fi

# ─── Configure firewalld ───
log "Configuring firewall..."
sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
log "firewalld enabled (SSH, HTTP, HTTPS only)."

# ─── SELinux — allow Caddy to connect to Docker containers ───
if command -v setsebool &>/dev/null; then
    log "Configuring SELinux for Caddy reverse proxy..."
    sudo setsebool -P httpd_can_network_connect 1
fi

# ─── Clone / Update Repo ───
REPO_DIR="$HOME/NexaPay"
if [[ -d "$REPO_DIR" ]]; then
    log "NexaPay repo exists, pulling latest..."
    cd "$REPO_DIR"
    git pull origin master
else
    log "Cloning NexaPay repo..."
    cd "$HOME"
    git clone https://github.com/N3on404/NexaPay.git
    cd "$REPO_DIR"
fi

# ─── Create .env if missing ───
if [[ ! -f ".env" ]]; then
    log "Creating .env from production template..."
    cat > .env << 'ENVEOF'
# ─── NexaPay Production Environment ───
# FILL IN YOUR SECRETS before running: docker compose up -d --build

# PostgreSQL (Neon serverless)
NEXAPAY_DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require

# Session JWT — generate with: openssl rand -hex 32
NEXAPAY_JWT_SECRET=change_this_generate_with_openssl_rand_hex_32

# AES-256-GCM encryption key — generate with: openssl rand -hex 32
NEXAPAY_ENCRYPTION_KEY=change_this_generate_with_openssl_rand_hex_32

# Ed25519 system private key — generate with: openssl rand -hex 32
NEXAPAY_SYSTEM_PRIVATE_KEY=change_this_generate_with_openssl_rand_hex_32

# Admin seed key — used to create first admin account
NEXAPAY_ADMIN_SEED_KEY=change_this_to_a_strong_random_string

NEXAPAY_PORTAL_URL=https://nexapay.space
NEXAPAY_PAYMENT_SESSION_MINUTES=1440
APP_ENV=production
DEV_SHOW_OTP=false

# Validator config
NEXAPAY_VALIDATOR_COUNT=3
ENVEOF
    warn "EDIT .env WITH YOUR SECRETS before starting!"
else
    log ".env already exists — not overwriting."
fi

# ─── Generate production secrets if using defaults ───
if grep -q "change_this_generate_with_openssl" .env 2>/dev/null; then
    warn "--------------------------------------------------"
    warn " DEFAULT SECRETS DETECTED in .env!"
    warn " Generate real secrets with:"
    warn "   openssl rand -hex 32  # for JWT_SECRET"
    warn "   openssl rand -hex 32  # for ENCRYPTION_KEY"
    warn "   openssl rand -hex 32  # for SYSTEM_PRIVATE_KEY"
    warn "   (then edit .env and replace the placeholders)"
    warn "--------------------------------------------------"
fi

# ─── Configure Caddy ───
log "Configuring Caddy as reverse proxy..."
sudo tee /etc/caddy/Caddyfile > /dev/null << 'CADDYEOF'
# ─── NexaPay Caddyfile ───
# Caddy auto-obtains SSL certificates from Let's Encrypt

nexapay.space, sandbox.nexapay.space, auth.nexapay.space, backend.nexapay.space {
    reverse_proxy localhost:3001
}
CADDYEOF

# Reload Caddy
sudo systemctl reload caddy || sudo systemctl restart caddy
log "Caddy configured and reloaded."

# ─── Build & Start ───
log "Building Docker images (this takes 10-15 min on first run — Rust compilation)..."
docker compose build

log "Starting services..."
docker compose up -d

log "--------------------------------------------------"
log " NexaPay deployed!"
log ""
log " Check status:  docker compose ps"
log " View logs:     docker compose logs -f"
log " Validator-0:   docker compose logs -f validator-0"
log ""
log " Ports:"
log "   3001 — Next.js frontend (via Caddy → :443)"
log "   8088 — Validator LB (internal)"
log ""
log " Caddy handles SSL automatically."
log " Make sure DNS A records point to this VM's IP:"
log "   @, sandbox, auth, backend → <VM_PUBLIC_IP>"
log "--------------------------------------------------"
