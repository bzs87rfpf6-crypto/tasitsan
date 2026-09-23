#!/usr/bin/env bash
set -euo pipefail

APP_LINK="${APP_LINK:-/opt/tasitsan/tasitsan}"
RELEASES_DIR="${RELEASES_DIR:-/opt/tasitsan/releases}"
BACKUP_DIR="${BACKUP_DIR:-/opt/tasitsan/backups}"
SERVICE="${SERVICE:-tasitsan.service}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/public/health}"

PREVIOUS_RELEASE="$(readlink -f "$APP_LINK")"
SOURCE_DIR="${SOURCE_DIR:-$PREVIOUS_RELEASE}"
STAMP="$(date +%Y%m%d-%H%M%S)"
NEW_RELEASE="$RELEASES_DIR/$STAMP"

echo "========================================"
echo " TASITSAN SAFE RELEASE DEPLOY"
echo "========================================"
echo "Mevcut : $PREVIOUS_RELEASE"
echo "Yeni   : $NEW_RELEASE"

mkdir -p "$RELEASES_DIR" "$BACKUP_DIR"

if [ ! -f "$SOURCE_DIR/.env" ]; then
  echo "HATA: $SOURCE_DIR/.env bulunamadi." >&2
  exit 1
fi

echo
echo "==> 1/7 Yeni release hazırlanıyor"

mkdir -p "$NEW_RELEASE"

tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.output' \
  --exclude='dist' \
  -C "$SOURCE_DIR" -cf - . \
  | tar -C "$NEW_RELEASE" -xf -

cp "$SOURCE_DIR/.env" "$NEW_RELEASE/.env"

echo
echo "==> 2/7 Bağımlılıklar kuruluyor"

cd "$NEW_RELEASE"

if command -v bun >/dev/null 2>&1; then
  bun install --frozen-lockfile || bun install
  BUILD_CMD=(bun run build:selfhost)
else
  npm ci || npm install
  BUILD_CMD=(npm run build:selfhost)
fi

echo
echo "==> 3/7 Production build"

set -a
. ./.env
set +a

export VITE_SELFHOST=true
export NODE_ENV=production

"${BUILD_CMD[@]}"

echo
echo "==> 4/7 Build doğrulanıyor"

test -f .output/server/index.mjs || {
  echo "HATA: .output/server/index.mjs yok." >&2
  rm -rf "$NEW_RELEASE"
  exit 1
}

test -d .output/public/assets || {
  echo "HATA: .output/public/assets yok." >&2
  rm -rf "$NEW_RELEASE"
  exit 1
}

ASSET_COUNT="$(find .output/public/assets -type f | wc -l)"

if [ "$ASSET_COUNT" -lt 10 ]; then
  echo "HATA: Asset sayısı şüpheli: $ASSET_COUNT" >&2
  rm -rf "$NEW_RELEASE"
  exit 1
fi

echo "✓ Build doğrulandı ($ASSET_COUNT asset)"

echo
echo "==> 5/7 Symlink atomik değiştiriliyor"

ln -sfn "$NEW_RELEASE" "${APP_LINK}.new"
mv -Tf "${APP_LINK}.new" "$APP_LINK"

echo "Current -> $(readlink -f "$APP_LINK")"

echo
echo "==> 6/7 Servis başlatılıyor"

if ! systemctl restart "$SERVICE"; then
  echo "HATA: Servis restart başarısız. Rollback yapılıyor." >&2

  ln -sfn "$PREVIOUS_RELEASE" "${APP_LINK}.rollback"
  mv -Tf "${APP_LINK}.rollback" "$APP_LINK"

  systemctl restart "$SERVICE" || true
  exit 1
fi

echo
echo "==> 7/7 Health check"

OK=0

for _ in $(seq 1 30); do
  if curl -sf --max-time 3 "$HEALTH_URL" >/dev/null; then
    OK=1
    break
  fi
  sleep 1
done

if [ "$OK" -eq 1 ]; then
  echo
  echo "========================================"
  echo " DEPLOY BASARILI"
  echo "========================================"
  echo "Current : $(readlink -f "$APP_LINK")"
  echo "Previous: $PREVIOUS_RELEASE"
  curl -s "$HEALTH_URL" || true
  echo
  exit 0
fi

echo
echo "HATA: Yeni release health check geçemedi." >&2
echo "==> ROLLBACK: $PREVIOUS_RELEASE" >&2

ln -sfn "$PREVIOUS_RELEASE" "${APP_LINK}.rollback"
mv -Tf "${APP_LINK}.rollback" "$APP_LINK"

systemctl restart "$SERVICE"

echo "==> Eski release yeniden aktif:"
echo "$(readlink -f "$APP_LINK")"

journalctl -u "$SERVICE" -n 80 --no-pager >&2

exit 1
