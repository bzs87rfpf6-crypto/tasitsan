# Teşhis: Supabase Bağlantısı ve Runtime Environment Değişkenleri

Bu bir teşhis raporudur; herhangi bir kod değişikliği önerilmez veya yapılmaz.

## 1. Bağlı Supabase (Lovable Cloud) Projesi

Doğrulandı (canlı proje bilgisi + repo dosyaları birebir örtüşüyor):

- **Project ref / ID:** `akasqaswpanbumrtdaak`
- **URL:** `https://akasqaswpanbumrtdaak.supabase.co`
- **Publishable (anon) key:** `sb_publishable_Lh-vADqAIcrpVhIdQ-4osg_-buGFwzb` (yeni format, JWT değil)
- **Yönetim:** Lovable Cloud tarafından yönetiliyor (`Managed by Lovable: true`), bölge eu-west-3, durum aktif (paused değil)
- Repodaki kanıtlar: `.env`, `supabase/config.toml` (`project_id`), `src/integrations/supabase/*` (otomatik üretilmiş)
- **Not:** Service role key ve DB şifresi Lovable Cloud'da kullanıcıya açılmaz; `.env` dosyasında `SUPABASE_SERVICE_ROLE_KEY` yok (sadece `.env.example`'da boş placeholder var).

## 2. Runtime'da Beklenen Env Değişkenleri (kullanım sayılarıyla)

### Supabase çekirdek (zorunlu)
| Değişken | Kullanım | Nerede |
|---|---|---|
| `SUPABASE_URL` | 15 | Server fonksiyonları, `client.server.ts`, `auth-middleware.ts`, SSR fallback |
| `SUPABASE_PUBLISHABLE_KEY` | 16 | Aynı şekilde server tarafı |
| `VITE_SUPABASE_URL` | 2 (+1 process.env fallback) | `client.ts` (tarayıcı), build-time |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 2 (+1 fallback) | `client.ts` (tarayıcı) |
| `VITE_SUPABASE_PROJECT_ID` | `.env`'de tanımlı | Lovable entegrasyonu |
| `SUPABASE_SERVICE_ROLE_KEY` | 1 | Yalnızca `src/integrations/supabase/client.server.ts` (admin client, RLS bypass) |
| `SUPABASE_ANON_KEY` | 2 | Fallback olarak (`oem-image-jobs.functions.ts`, `api/public/hooks/image-resolver.ts`) — publishable key'in eski adı |

### Diğer server-only (opsiyonel özellik bayrakları)
- `LOVABLE_API_KEY` (19 kullanım) — Lovable AI Gateway (AI özet, embedding, görsel arama vb.)
- `FIRECRAWL_API_KEY` (6), `SERPAPI_API_KEY`, `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX`, `BRAVE_SEARCH_API_KEY`, `BING_SEARCH_API_KEY` — OEM görsel/web araştırma fallback zinciri
- `SMART_OEM_RESEARCH_ENABLED` — `.env`'de `true`; OEM araştırma feature flag
- `GOOGLE_SEARCH_CONSOLE_API_KEY` (3) — GSC entegrasyonu
- `RECAPTCHA_SECRET_KEY` — form koruması (varsa)
- `PUBLIC_SITE_URL` (2) / `SITE_URL` (1) — kanonik URL, sitemap, IndexNow (`https://tasitsan.com.tr` / www)
- `AI_PROVIDER`, `DATABASE_URL`, `STRIPE_SECRET_KEY`, `X` — tek/örnek kullanım veya yorum satırı (`config.server.ts` içindeki örnekler dahil)

### Build-time (Vite define)
- `VITE_SELFHOST` — `vite.selfhost.config.ts` içinde `"true"` olarak define edilir; CDN yerine lokal asset yolları seçilir
- `PORT` / `HOST` — self-host Node sunucusu (Dockerfile / compose: 3000 / 0.0.0.0)

## 3. Mimari Gözlemler

- Üç ayrı client deseni var: tarayıcı (`client.ts`, VITE_* + persistSession), kullanıcı-yetkili server (`auth-middleware.ts`, bearer + publishable key), admin (`client.server.ts`, service role — Proxy ile lazy init, env handler içinde okunuyor; doğru desen).
- Yeni `sb_publishable_...` formatı JWT değil; bazı fonksiyonlar (örn. `cross-sell`, `oem-card`) `Authorization: Bearer <key>` header'ını silip sadece `apikey` gönderiyor — self-host'ta eski JWT anon key kullanılırsa bu kod yolu sorunsuz çalışır çünkü `key.startsWith("sb_")` kontrolü var.
- `SUPABASE_SERVICE_ROLE_KEY` hiçbir VITE_ değişkenine kopyalanmamış; sızıntı yok.

## 4. Self-Host (VPS/Docker) İçin Gerekli Minimum Değişken Seti

`deploy/.env.selfhost` için:

**Zorunlu:**
```
SUPABASE_URL=https://akasqaswpanbumrtdaak.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_Lh-vADqAIcrpVhIdQ-4osg_-buGFwzb
SUPABASE_SERVICE_ROLE_KEY=<service role key — Lovable Cloud'da kullanıcıya verilmiyor; self-host Supabase'e geçişte kendi projenizden alınır>
VITE_SUPABASE_URL=<aynı URL>          # build arg (docker-compose.app.yml zaten geçiriyor)
VITE_SUPABASE_PUBLISHABLE_KEY=<aynı>  # build arg
VITE_SUPABASE_PROJECT_ID=akasqaswpanbumrtdaak
SITE_URL=https://tasitsan.com.tr
PUBLIC_SITE_URL=https://www.tasitsan.com.tr
PORT=3000
HOST=0.0.0.0
```

**Özellik bazlı opsiyonel:**
- `LOVABLE_API_KEY` — AI özellikleri (embedding, canlı destek özeti, AI arama) için; yoksa bu özellikler devre dışı kalır
- `FIRECRAWL_API_KEY` (+ `SMART_OEM_RESEARCH_ENABLED=true`) — OEM web araştırması
- `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_CX` veya `SERPAPI_API_KEY` — OEM görsel arama
- `GOOGLE_SEARCH_CONSOLE_API_KEY` — GSC paneli
- `RECAPTCHA_SECRET_KEY` — spam koruması (yapılandırıldıysa)

**Kritik uyarı:** Mevcut veritabanı Lovable Cloud'da kaldığı sürece `SUPABASE_SERVICE_ROLE_KEY` dışarıya verilmediği için, self-host senaryosu pratikte ya (a) Lovable Cloud DB'sine publishable key + RLS ile yetinmeyi (admin fonksiyonları çalışmaz) ya da (b) veritabanını kendi Supabase/Postgres'inize migrate edip kendi service role key'inizi kullanmayı gerektirir. `deploy/README.md` bu ayrımı dokümante ediyor.
