#!/usr/bin/env bash
# Taşıtsan — VPS güncelleme scripti.
# Normal kullanımda main'i senkronize eder; paketli GitHub Actions deployunda
# SKIP_GIT_SYNC=1 ile gelen exact source'u olduğu gibi build eder.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/tasitsan}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.app.yml}"
ENV_FILE="${ENV_FILE:-deploy/.env.selfhost}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/public/health}"

cd "$APP_DIR"

if [ "${SKIP_GIT_SYNC:-0}" != "1" ]; then
  echo "==> Son kod çekiliyor (main)"
  git fetch --all --prune
  git reset --hard origin/main
else
  echo "==> GitHub Actions exact build kullanılıyor; VPS git remote senkronizasyonu atlandı"
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "HATA: $ENV_FILE yok. deploy/README.md adım 3'e bakın." >&2
  exit 1
fi

echo "==> Ortam değişkenleri yükleniyor"
set -a; . "$ENV_FILE"; set +a

echo "==> Docker imajı build ediliyor ve servis yeniden başlatılıyor"
docker compose -f "$COMPOSE_FILE" up -d --build

echo "==> Sağlık kontrolü"
for i in $(seq 1 60); do
  if curl -sf "$HEALTH_URL" >/dev/null; then
    echo "✓ Uygulama ayakta: $(curl -s "$HEALTH_URL")"
    docker image prune -f >/dev/null || true
    exit 0
  fi
  sleep 2
done

echo "HATA: Sağlık kontrolü başarısız. Loglar:" >&2
docker compose -f "$COMPOSE_FILE" logs --tail 80 >&2
exit 1
