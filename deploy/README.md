# Taşıtsan — Self-Host (Ubuntu + Docker) Kurulumu

Bu klasör, uygulamayı Lovable Cloud'dan bağımsız olarak kendi VPS'inizde çalıştırmak
içindir. Lovable Cloud tarafı etkilenmez: `vite.config.ts` ve mevcut scriptler aynen
durur; self-host yalnızca `vite.selfhost.config.ts` + `build:selfhost` yolunu kullanır.

> Bu faz (Faz A) yalnızca **build/çalıştırma yolunu** kurar. Supabase self-host,
> Google OAuth ve AI sağlayıcı geçişi sonraki fazlarda yapılacaktır — şu an uygulama
> mevcut Supabase (Lovable Cloud) örneğine bağlanmaya devam eder.

## 1. Sunucu hazırlığı (Ubuntu 22.04/24.04)

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl git ufw

# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker

# Güvenlik duvarı
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

## 2. Kaynak kodu

```bash
git clone <repo-url> /opt/tasitsan
cd /opt/tasitsan
```

## 3. Ortam değişkenleri

`.env.example` dosyasını temel alın:

```bash
cp .env.example deploy/.env.selfhost
chmod 600 deploy/.env.selfhost
```

`deploy/.env.selfhost` içinde en az şunlar dolu olmalı:

| Değişken | Açıklama |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | Client bundle'a gömülür (build arg olarak da geçer) |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` | Sunucu tarafı (SSR / server function) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yalnızca sunucu; RLS'i bypass eder — asla client'a verilmez |
| `LOVABLE_API_KEY` | AI Gateway (Faz C'de kendi sağlayıcımızla değişecek) |
| `SITE_URL` | `https://tasitsan.com.tr` |
| İsteğe bağlı | `FIRECRAWL_API_KEY`, VAPID push anahtarları, reCAPTCHA, IndexNow, GSC |

`VITE_*` değerleri **build zamanında** gömüldüğü için değiştiklerinde imaj yeniden
build edilmelidir.

## 4. Build ve çalıştırma

Docker ile (önerilen):

```bash
cd /opt/tasitsan
set -a; . deploy/.env.selfhost; set +a       # build arg'ları için
docker compose -f deploy/docker-compose.app.yml up -d --build
docker compose -f deploy/docker-compose.app.yml logs -f
```

Docker'sız (doğrudan Node) :

```bash
bun install
bun run build:selfhost
PORT=3000 HOST=0.0.0.0 bun run start:selfhost
```

Sağlık kontrolü:

```bash
curl -s http://127.0.0.1:3000/api/public/health
# {"status":"ok","time":"..."}
```

## 5. Reverse proxy (Caddy örneği)

`/etc/caddy/Caddyfile`:

```
# Apex host TEK ADIMDA kalıcı 301 ile www'ya taşınır (SEO: kanonik host www).
tasitsan.com.tr {
	redir https://www.tasitsan.com.tr{uri} permanent
}

www.tasitsan.com.tr {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

Nginx kullanıyorsanız apex sunucu bloğu `return 301 https://www.tasitsan.com.tr$request_uri;`
olmalıdır (302 değil). Proxy katmanı 301 yapmasa bile uygulama `src/server.ts`
içindeki `canonicalHostRedirect` ile apex/http isteklerini 301 ile www'ya taşır.

```bash
sudo systemctl reload caddy
```

Caddy Let's Encrypt sertifikasını otomatik alır. Nginx tercih ederseniz
`proxy_pass http://127.0.0.1:3000;` + certbot yeterlidir. Uygulama güvenlik
başlıklarını (`HSTS`, `X-Frame-Options`, `Referrer-Policy` …) kendisi eklediği için
proxy tarafında tekrar tanımlamayın.

## 6. Güncelleme

Elle:

```bash
cd /opt/tasitsan && bash deploy/deploy.sh
```

Otomatik (GitHub Actions): `.github/workflows/deploy-vps.yml` main'e her push'ta
sunucuya SSH ile bağlanıp `deploy/deploy.sh` çalıştırır. GitHub repo ayarlarında
şu secret'lar tanımlı olmalıdır: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`,
opsiyonel `VPS_PORT`.

Eski imajları temizlemek için: `docker image prune -f`


## 7. Notlar

- Nitro preset: `node-server` (Cloudflare Workers değil). Çıktı: `.output/server/index.mjs`.
- Uygulama 3000 portunu yalnız `127.0.0.1` üzerinde dinler; dış erişim proxy üzerinden.
- `/api/public/*` rotaları kimlik doğrulamasız erişilebilir — webhook/cron için
  imza doğrulaması handler içinde yapılır.
- Capacitor build'i etkilenmez; `bun run build` (Lovable yolu) mobil kabuk için
  kullanılmaya devam eder.
