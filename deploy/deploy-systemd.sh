#!/usr/bin/env bash
# Taşıtsan — systemd (Docker'sız) VPS deploy scripti.
# Sunucuda /opt/tasitsan/tasitsan altına açılmış exact kaynak için kullanılır.
# Mevcut .env DOKUNULMAZ; SUPABASE_* değerleri korunur.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/tasitsan/tasitsan}"
SERVICE="${SERVICE:-tasitsan.service}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/public/health}"
BACKUP_DIR="${BACKUP_DIR:-/opt/tasitsan/backups}"

cd "$APP_DIR"

echo "==> Yedek alınıyor"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
tar -czf "$BACKUP_DIR/tasitsan-$STAMP.tar.gz" \
  --exclude=node_modules --exclude=.git --exclude=.output --exclude=dist . || true
echo "    -> $BACKUP_DIR/tasitsan-$STAMP.tar.gz"

if [ ! -f .env ]; then
  echo "HATA: $APP_DIR/.env yok. SUPABASE_* değerleri olmadan build/çalıştırma yapılmaz." >&2
  exit 1
fi

echo "==> Bağımlılıklar"
if command -v bun >/dev/null 2>&1; then
  bun install --frozen-lockfile || bun install
  BUILD="bun run build:selfhost"
else
  npm ci || npm install
  BUILD="npm run build:selfhost"
fi

echo "==> Production build (self-host)"
set -a; . ./.env; set +a
export VITE_SELFHOST=true NODE_ENV=production
eval "$BUILD"

echo "==> Servis yeniden başlatılıyor: $SERVICE"
sudo systemctl restart "$SERVICE"

echo "==> Sağlık kontrolü"
for _ in $(seq 1 60); do
  if curl -sf "$HEALTH_URL" >/dev/null; then
    echo "✓ Uygulama ayakta: $(curl -s "$HEALTH_URL")"
    exit 0
  fi
  sleep 2
done

echo "HATA: Sağlık kontrolü başarısız. Son loglar:" >&2
sudo journalctl -u "$SERVICE" -n 80 --no-pager >&2
exit 1
