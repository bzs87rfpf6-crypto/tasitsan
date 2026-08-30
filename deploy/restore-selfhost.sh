#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/tasitsan/tasitsan"
NGINX_FILE="/etc/nginx/sites-available/tasitsan"
ENV_BACKUP="/tmp/tasitsan.env.restore.$$.bak"
LOG_FILE="/var/log/tasitsan-selfhost.log"

cd "$APP_DIR"

[ "$(id -u)" -eq 0 ] || { echo "HATA: root olarak çalıştırın."; exit 1; }

# Yerel üretim sırlarını koru; kaynak kodu GitHub main ile tamamen eşitle.
if [ -f .env ]; then cp -a .env "$ENV_BACKUP"; fi

git fetch origin main
git reset --hard origin/main

if [ -f "$ENV_BACKUP" ]; then cp -a "$ENV_BACKUP" .env; rm -f "$ENV_BACKUP"; fi

# Eski/uyumsuz client çıktısını temizle.
rm -rf .output dist/client

# Bağımlılıkları mevcut package.json/package-lock durumuna göre yenile.
npm install --no-audit --no-fund

# VPS için doğru Nitro Node build'i: .output/server + .output/public.
npm run build:selfhost

# Build doğrulaması.
test -f .output/server/index.mjs
test -d .output/public/assets
find .output/public/assets -maxdepth 1 -type f -name '*.js' | grep -q .
find .output/public/assets -maxdepth 1 -type f -name '*.css' | grep -q .
test -f .output/public/brand/tasitsan-corporate-logo-v2.png

# Nginx statik dist/client yerine çalışan Nitro SSR sunucusuna proxy yapar.
cp -a "$NGINX_FILE" "${NGINX_FILE}.backup-$(date +%Y%m%d-%H%M%S)"
cat > "$NGINX_FILE" <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name tasitsan.com.tr www.tasitsan.com.tr;
    return 301 https://tasitsan.com.tr$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name tasitsan.com.tr;

    ssl_certificate /etc/letsencrypt/live/tasitsan.com.tr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tasitsan.com.tr/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
NGINX

nginx -t
systemctl reload nginx

# Eski selfhost Node sürecini kapat ve yeni build'i başlat.
pkill -f 'node scripts/start-selfhost.mjs' 2>/dev/null || true
sleep 1
nohup npm run start:selfhost >"$LOG_FILE" 2>&1 < /dev/null &

# Servisin hazır olmasını bekle.
for i in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:3000/ >/tmp/tasitsan-home.html 2>/dev/null; then break; fi
    sleep 1
done

curl -fsS http://127.0.0.1:3000/ >/tmp/tasitsan-home.html
ASSET=$(grep -oE '/assets/[^" ]+\.js' /tmp/tasitsan-home.html | head -1)
[ -n "$ASSET" ]
curl -fsS -o /dev/null "http://127.0.0.1:3000$ASSET"

curl -kfsS -o /dev/null https://tasitsan.com.tr/

printf '\n===== TAŞITSAN SELFHOST RESTORE TAMAM =====\n'
printf 'Commit: '; git rev-parse --short HEAD
printf 'HTML:   '; curl -k -sS -o /dev/null -w '%{http_code}\n' https://tasitsan.com.tr/
printf 'Asset:  '; curl -k -sS -o /dev/null -w '%{http_code}\n' "https://tasitsan.com.tr$ASSET"
printf 'Node:   '; curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
printf 'Log:    %s\n' "$LOG_FILE"
