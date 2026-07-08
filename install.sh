#!/bin/bash
# ponytail: simplified VPS auto-installer script
set -euo pipefail

# Check root
if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run as root (using sudo)."
  exit 1
fi

INSTALL_DIR="/opt/tunecamp"
DOMAIN=""
EMAIL=""
ADMIN_USER="admin"
ADMIN_PASS=""
MUSIC_DIR="/opt/tunecamp/music"
INTERACTIVE=true

# Parse flags
while [[ $# -gt 0 ]]; do
  case $1 in
    -y|--non-interactive)
      INTERACTIVE=false
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Interactive Prompts
if [ "$INTERACTIVE" = true ] && [ -t 0 ]; then
  echo "========================================="
  echo "       TuneCamp VPS Auto-Installer       "
  echo "========================================="
  echo ""
  
  read -rp "Installation path [$INSTALL_DIR]: " input_dir
  [ -n "$input_dir" ] && INSTALL_DIR="$input_dir"

  read -rp "Domain name (e.g., tunecamp.example.com) [blank for IP]: " input_domain
  [ -n "$input_domain" ] && DOMAIN="$input_domain"

  if [ -n "$DOMAIN" ]; then
    read -rp "Email for SSL notifications (Certbot): " input_email
    [ -n "$input_email" ] && EMAIL="$input_email"
  fi

  read -rp "Admin username [$ADMIN_USER]: " input_user
  [ -n "$input_user" ] && ADMIN_USER="$input_user"

  # Generate random password if blank
  RANDOM_PASS=$(openssl rand -base64 12 2>/dev/null || LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 12 || echo "tunecamp123")
  read -rp "Admin password [$RANDOM_PASS]: " input_pass
  if [ -n "$input_pass" ]; then
    ADMIN_PASS="$input_pass"
  else
    ADMIN_PASS="$RANDOM_PASS"
  fi

  read -rp "Music directory [$MUSIC_DIR]: " input_music
  [ -n "$input_music" ] && MUSIC_DIR="$input_music"
else
  # Non-interactive mode defaults
  if [ -z "$ADMIN_PASS" ]; then
    ADMIN_PASS=$(openssl rand -base64 12 2>/dev/null || LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 12 || echo "tunecamp123")
  fi
fi

# Detect package manager
PACKAGE_MANAGER=""
if command -v apt-get >/dev/null 2>&1; then
  PACKAGE_MANAGER="apt"
elif command -v dnf >/dev/null 2>&1; then
  PACKAGE_MANAGER="dnf"
elif command -v yum >/dev/null 2>&1; then
  PACKAGE_MANAGER="yum"
fi

echo "Installing prerequisites (git, curl)..."
if [ "$PACKAGE_MANAGER" = "apt" ]; then
  apt-get update -y
  apt-get install -y git curl gnupg
elif [ "$PACKAGE_MANAGER" = "dnf" ] || [ "$PACKAGE_MANAGER" = "yum" ]; then
  $PACKAGE_MANAGER install -y git curl
fi

# Check Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable --now docker
  fi
else
  echo "Docker is already installed."
fi

# Check Docker Compose
DOCKER_COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
elif docker-compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker-compose"
else
  echo "Installing Docker Compose..."
  if [ "$PACKAGE_MANAGER" = "apt" ]; then
    apt-get install -y docker-compose-plugin || true
  elif [ "$PACKAGE_MANAGER" = "dnf" ] || [ "$PACKAGE_MANAGER" = "yum" ]; then
    $PACKAGE_MANAGER install -y docker-compose-plugin || true
  fi
  
  if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
  else
    # Standalone installation fallback
    curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    DOCKER_COMPOSE_CMD="docker-compose"
  fi
fi
echo "Using Docker Compose command: $DOCKER_COMPOSE_CMD"

# Clone TuneCamp repo
echo "Setting up TuneCamp directory at $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
if [ ! -d "$INSTALL_DIR/.git" ]; then
  git clone https://github.com/scobru/tunecamp.git "$INSTALL_DIR"
else
  echo "Repository already exists, pulling latest..."
  cd "$INSTALL_DIR"
  git pull origin main || git pull origin dev || true
fi

# Setup env variables
JWT_SECRET=$(openssl rand -hex 16 2>/dev/null || LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom | head -c 32 || echo "7a54e951bf4181a94372e617bb36c310")

echo "Creating .env configuration..."
cat <<EOF > "$INSTALL_DIR/.env"
TUNECAMP_RPC_URL=https://mainnet.base.org
TUNECAMP_CURRENCY_CONTRACT=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
TUNECAMP_PUBLIC_URL=${DOMAIN:+https://$DOMAIN}
TUNECAMP_ADMIN_USER=$ADMIN_USER
TUNECAMP_ADMIN_PASS=$ADMIN_PASS
TUNECAMP_JWT_SECRET=$JWT_SECRET
TUNECAMP_DOWNLOAD_DIR=/data/downloads
EOF

echo "Setting music directory mount in docker-compose.yml..."
mkdir -p "$MUSIC_DIR"
sed -i "s|- /path/to/your/music:|- $MUSIC_DIR:|g" "$INSTALL_DIR/docker-compose.yml"

# Setup Nginx
echo "Installing Nginx..."
if [ "$PACKAGE_MANAGER" = "apt" ]; then
  apt-get install -y nginx
elif [ "$PACKAGE_MANAGER" = "dnf" ] || [ "$PACKAGE_MANAGER" = "yum" ]; then
  $PACKAGE_MANAGER install -y nginx
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now nginx
fi

echo "Configuring Nginx reverse proxy..."
NGINX_CONF=""
if [ -d "/etc/nginx/sites-available" ]; then
  NGINX_CONF="/etc/nginx/sites-available/tunecamp"
elif [ -d "/etc/nginx/conf.d" ]; then
  NGINX_CONF="/etc/nginx/conf.d/tunecamp.conf"
fi

if [ -n "$NGINX_CONF" ]; then
  SERVER_NAME_FIELD="${DOMAIN:-_}"
  
  cat <<EOF > "$NGINX_CONF"
server {
    listen 80;
    server_name $SERVER_NAME_FIELD;
    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:1970;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
EOF

  if [ -d "/etc/nginx/sites-enabled" ]; then
    ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/tunecamp"
    rm -f "/etc/nginx/sites-enabled/default"
  fi

  nginx -t && systemctl reload nginx || echo "Warning: Nginx config test failed."
fi

# Request Let's Encrypt SSL if domain is provided
if [ -n "$DOMAIN" ]; then
  echo "Installing Certbot..."
  if [ "$PACKAGE_MANAGER" = "apt" ]; then
    apt-get install -y certbot python3-certbot-nginx
  elif [ "$PACKAGE_MANAGER" = "dnf" ] || [ "$PACKAGE_MANAGER" = "yum" ]; then
    $PACKAGE_MANAGER install -y certbot python3-certbot-nginx || true
  fi

  echo "Requesting SSL Certificate via Certbot..."
  CERTBOT_EMAIL_ARG="--register-unsafely-without-email"
  if [ -n "$EMAIL" ]; then
    CERTBOT_EMAIL_ARG="-m $EMAIL"
  fi
  
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos $CERTBOT_EMAIL_ARG; then
    echo "SSL Certificate successfully configured!"
    # Ensure env variable is updated with HTTPS
    sed -i "s|TUNECAMP_PUBLIC_URL=.*|TUNECAMP_PUBLIC_URL=https://$DOMAIN|g" "$INSTALL_DIR/.env"
  else
    echo "Warning: Certbot SSL setup failed. Running on HTTP only."
  fi
fi

# Start Docker Compose
echo "Starting TuneCamp..."
cd "$INSTALL_DIR"
$DOCKER_COMPOSE_CMD up -d --build

echo "========================================="
echo "       TuneCamp Setup Complete!          "
echo "========================================="
if [ -n "$DOMAIN" ]; then
  echo "Access URL:     https://$DOMAIN"
else
  VPS_IP=$(curl -s https://ifconfig.me || curl -s https://api.ipify.org || echo "your-vps-ip")
  echo "Access URL:     http://$VPS_IP"
fi
echo "Admin User:     $ADMIN_USER"
echo "Admin Pass:     $ADMIN_PASS"
echo "Music Folder:   $MUSIC_DIR"
echo "========================================="
