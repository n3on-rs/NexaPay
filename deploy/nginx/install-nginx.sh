#!/usr/bin/env bash
# Run on the NexaPay host (as a user with sudo). Installs site + Let's Encrypt.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_SRC="${SCRIPT_DIR}/nexapay.conf"
CONF_DST="/etc/nginx/sites-available/nexapay"

if [[ ! -f "$CONF_SRC" ]]; then
  echo "Missing $CONF_SRC" >&2
  exit 1
fi

echo "==> Installing nginx vhost to $CONF_DST"
sudo cp "$CONF_SRC" "$CONF_DST"
sudo ln -sf "$CONF_DST" /etc/nginx/sites-enabled/nexapay

echo "==> Testing nginx config"
sudo nginx -t

echo "==> Reloading nginx (HTTP only until certbot runs)"
sudo systemctl reload nginx

if ! command -v certbot >/dev/null 2>&1; then
  echo "==> Installing certbot python3-certbot-nginx (Ubuntu/Debian)"
  sudo apt-get update -qq
  sudo apt-get install -y certbot python3-certbot-nginx
fi

# Let's Encrypt must reach this host on :80 from the public internet (HTTP-01).
if sudo ufw status 2>/dev/null | grep -q "Status: active"; then
  echo "==> UFW is active; allowing HTTP/HTTPS for nginx"
  sudo ufw allow "Nginx Full" comment 'nexapay certbot' || true
fi

echo ""
echo "==> BEFORE CERTBOT: inbound TCP 80 must reach THIS machine on the LAN IP the router uses."
echo "    On the router (e.g. 192.168.0.1): port forward 80 (and 443) to this PC’s IPv4 (e.g. 192.168.0.193)."
echo "    Test from another network (phone 4G):  curl -sI --max-time 5 http://196.177.10.71/ | head -3"
echo ""

echo "==> Obtaining certificates and enabling HTTPS (interactive email / ToS if first time)"
if ! sudo certbot --nginx \
  -d nexapay.space \
  -d www.nexapay.space \
  -d backend.nexapay.space; then
  echo "" >&2
  echo "Certbot failed. Most common: timeout = router not forwarding WAN:80 -> this host, or ISP blocks inbound 80." >&2
  echo "Fix port forwarding, then:  sudo certbot --nginx -d nexapay.space -d www.nexapay.space -d backend.nexapay.space" >&2
  echo "Alternative: use DNS-01 (no open 80) with a provider plugin or acme.sh + Hostinger API." >&2
  exit 1
fi

echo "==> Done. Test: curl -sI https://nexapay.space/ | head -5"
