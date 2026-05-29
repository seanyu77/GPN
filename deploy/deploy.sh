#!/usr/bin/env bash
#
# GP one-shot deploy — single VPS, all-in-one (Ubuntu 22.04/24.04).
#
# Run on the VPS, as root, from a clone of this repo:
#
#   git clone <repo> /opt/gp-src && cd /opt/gp-src
#   sudo PUBLIC_IP=203.0.113.10 DOMAIN=app.mydomain.com bash deploy/deploy.sh
#
# Re-runnable: rebuilds, re-renders config, and restarts the services.
set -euo pipefail

# ---------------------------------------------------------------------------
# Config — override on the command line (see usage above).
# ---------------------------------------------------------------------------
PUBLIC_IP="${PUBLIC_IP:-YOUR_PUBLIC_IP}"
DOMAIN="${DOMAIN:-app.example.com}"
APP_USER="gp"
APP_DIR="/opt/gp"
NODE_MAJOR=20

SIGNALING_URL="wss://${DOMAIN}/ws"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[[ "$EUID" -eq 0 ]] || fail "Run as root (use sudo)."
[[ "$PUBLIC_IP" != "YOUR_PUBLIC_IP" ]] || fail "Set PUBLIC_IP, e.g. sudo PUBLIC_IP=203.0.113.10 DOMAIN=app.mydomain.com bash deploy/deploy.sh"
[[ "$DOMAIN" != "app.example.com" ]]   || fail "Set DOMAIN, e.g. sudo PUBLIC_IP=203.0.113.10 DOMAIN=app.mydomain.com bash deploy/deploy.sh"

# ---------------------------------------------------------------------------
# 1. Prerequisites: Node.js + Caddy (installed only if missing).
# ---------------------------------------------------------------------------
if ! command -v node >/dev/null || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt "$NODE_MAJOR" ]]; then
  log "Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  log "Installing Caddy"
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

# ---------------------------------------------------------------------------
# 2. App user + sync source into APP_DIR.
# ---------------------------------------------------------------------------
id "$APP_USER" >/dev/null 2>&1 || { log "Creating user ${APP_USER}"; useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"; }

log "Syncing source to ${APP_DIR}"
mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude dist --exclude .git \
  "${REPO_ROOT}/server" "${REPO_ROOT}/web" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ---------------------------------------------------------------------------
# 3. Build server + web (as APP_USER).
# ---------------------------------------------------------------------------
log "Building server"
sudo -u "$APP_USER" bash -c "cd '${APP_DIR}/server' && npm ci && npm run build"

log "Building web (NEXT_PUBLIC_SIGNALING_URL=${SIGNALING_URL})"
sudo -u "$APP_USER" bash -c "cd '${APP_DIR}/web' && npm ci && NEXT_PUBLIC_SIGNALING_URL='${SIGNALING_URL}' npm run build"

# ---------------------------------------------------------------------------
# 4. systemd units (render placeholders) + Caddyfile.
# ---------------------------------------------------------------------------
log "Installing systemd units"
sed "s|YOUR_PUBLIC_IP|${PUBLIC_IP}|g" "${REPO_ROOT}/deploy/gp-server.service" \
  > /etc/systemd/system/gp-server.service
cp "${REPO_ROOT}/deploy/gp-web.service" /etc/systemd/system/gp-web.service

log "Installing Caddyfile"
sed "s|app.example.com|${DOMAIN}|g" "${REPO_ROOT}/deploy/Caddyfile" > /etc/caddy/Caddyfile

# ---------------------------------------------------------------------------
# 5. Firewall (UFW). Skipped if UFW is not installed.
# ---------------------------------------------------------------------------
if command -v ufw >/dev/null; then
  log "Configuring UFW firewall"
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 40000:49999/udp
  ufw allow 40000:49999/tcp
  ufw --force enable
else
  log "UFW not found — open these manually (incl. cloud security group): 22,80,443/tcp and 40000-49999 udp+tcp"
fi

# ---------------------------------------------------------------------------
# 6. Start everything.
# ---------------------------------------------------------------------------
log "Starting services"
systemctl daemon-reload
systemctl enable --now gp-server.service gp-web.service
systemctl reload caddy || systemctl restart caddy

log "Done. Verify:"
echo "  - systemctl status gp-server gp-web caddy"
echo "  - open https://${DOMAIN}  then a room at https://${DOMAIN}/rooms/test in two tabs"
echo "  - REMINDER: DNS A record for ${DOMAIN} must point to ${PUBLIC_IP}, and"
echo "    your cloud security group must allow 40000-49999 udp+tcp."
