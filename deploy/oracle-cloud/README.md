# NexaPay on Oracle Cloud Always Free

**Cost: $0/month forever** — 4 ARM cores, 24 GB RAM, 200 GB disk.

## What You Need

- **Credit/debit card** — Oracle verifies identity with a $1 hold (released immediately). You will **never** be charged if you stay within Always Free limits.
- **Domain** — nexapay.space (you already have this)
- **~45 minutes** for initial setup

## Architecture

```
Internet
  │
  ▼
Caddy (:443, auto-SSL via Let's Encrypt)
  │
  ▼
Next.js Frontend (Docker :3001)
  │ /api/* rewrites
  ▼
Nginx Validator LB (Docker :8088)
  ├── Validator-0 (:8080)
  ├── Validator-1 (:8080)
  └── Validator-2 (:8080)
  │
  ▼
Neon PostgreSQL (serverless, us-east-1)
```

## Step-by-Step

### 1. Create Oracle Cloud Account

1. Go to https://cloud.oracle.com/free
2. Click "Start for free"
3. Fill in your details, verify email, add your card
4. After verification, you'll land on the OCI console

### 2. Launch the Free VM

1. In OCI Console, go to **Compute → Instances**
2. Click **Create Instance**
3. Configure:
   - **Name:** `nexapay`
   - **Image:** Ubuntu 24.04 (aarch64)
   - **Shape:** Ampere A1 — 4 OCPU, 24 GB RAM
   - **Boot volume:** 200 GB (max free)
   - **SSH:** Upload your public key (or generate one)
4. Click **Create**
5. Note the **Public IP address**

### 3. Point DNS to Oracle VM

Update your DNS records for nexapay.space:
```
@         A  →  <VM_PUBLIC_IP>
sandbox   A  →  <VM_PUBLIC_IP>
auth      A  →  <VM_PUBLIC_IP>
backend   A  →  <VM_PUBLIC_IP>
```

### 4. SSH In & Run Setup

```bash
ssh ubuntu@<VM_PUBLIC_IP>

# Copy the setup script or clone the repo first:
git clone https://github.com/N3on404/NexaPay.git
cd NexaPay

# Run the setup
bash deploy/oracle-cloud/setup.sh
```

### 5. Generate Production Secrets

The setup script warns you about default secrets. Generate real ones:

```bash
cd ~/NexaPay

# Generate secure random keys
echo "NEXAPAY_JWT_SECRET=$(openssl rand -hex 32)"
echo "NEXAPAY_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "NEXAPAY_SYSTEM_PRIVATE_KEY=$(openssl rand -hex 32)"
echo "NEXAPAY_ADMIN_SEED_KEY=$(openssl rand -hex 16)"

# Edit .env with the generated values
nano .env
```

### 6. Start the Stack

```bash
cd ~/NexaPay
docker compose up -d --build
```

First build takes ~10-15 minutes (Rust compilation). Subsequent builds are faster (Docker layer caching).

### 7. Verify Everything

```bash
# Check all containers are running
docker compose ps

# Check logs
docker compose logs -f validator-0

# Test the API
curl https://backend.nexapay.space/health

# Visit the site
curl https://nexapay.space
```

## Daily Operations

```bash
# View logs
docker compose logs -f validator-0

# Restart a single validator
docker compose restart validator-0

# Restart everything
docker compose restart

# Update to latest code
git pull origin master
docker compose up -d --build

# Check disk usage
df -h
docker system df

# View Caddy logs (SSL, requests)
sudo journalctl -u caddy -f
```

## Free Tier Limits (don't exceed these)

| Resource | Free Limit | NexaPay Usage |
|----------|-----------|---------------|
| ARM cores | 4 OCPU | ~1-2 at idle, 3-4 under load |
| RAM | 24 GB | ~6-8 GB (3 validators + frontend) |
| Disk | 200 GB | ~10-20 GB (Docker images + chain data) |
| Outbound bandwidth | 10 TB/month | Minimal for a payment API |
| Neon DB storage | 0.5 GB | Upgrade if needed (~$5/month for 10GB) |

## Security

- **UFW** only allows SSH (22), HTTP (80), HTTPS (443)
- **Caddy** auto-handles SSL certificates (Let's Encrypt)
- **Neon** requires SSL (`?sslmode=require`)
- Docker containers communicate on internal network, not exposed to internet
- Validator ports (8090-8092) are NOT exposed externally

## Troubleshooting

### Neon connection fails
```bash
# Test from the VM
docker compose exec validator-0 sh -c "apt-get update && apt-get install -y postgresql-client && psql 'postgresql://neondb_owner:...' -c 'SELECT 1'"
```

### Container won't start
```bash
docker compose logs validator-0 --tail=100
```

### Caddy SSL fails
- Make sure DNS A records are pointing to the VM IP
- Wait 5 minutes for DNS propagation
- Check: `sudo journalctl -u caddy --since "5 min ago"`

### Reset everything
```bash
docker compose down -v
docker compose up -d --build
```
