# Taşıtsan Parça Borsası

Ağır vasıta ve ticari araç yedek parça borsası. Alıcıları satıcılarla buluşturan, OEM kodu / marka-model / fotoğraf ile arama yapılabilen, canlı destek ve parça talep sistemi entegre bir pazar yeri.

Canlı: <https://www.tasitsan.com.tr>

## Teknoloji

- **Framework:** TanStack Start v1 (React 19 + Vite 7, SSR)
- **Stil:** Tailwind CSS v4 + shadcn/ui
- **Backend:** Lovable Cloud (Supabase — Postgres, Auth, Storage, Realtime)
- **Sunucu mantığı:** `createServerFn` (TanStack server functions), `src/lib/**/*.functions.ts`
- **Deploy hedefi:** Cloudflare Workers (nitro cloudflare preset)
- **Mobil kabuk:** Capacitor (Android/iOS)

## Geliştirme

```bash
bun install
bun run dev        # http://localhost:8080
bun run build      # production build (Workers)
```

`.env` için `.env.example` dosyasını kopyalayın ve Lovable Cloud değerleri ile doldurun.

## Klasör Yapısı

```
src/
  routes/              # TanStack file-based routing (index.tsx = /)
  components/          # UI ve admin panel bileşenleri
  lib/                 # *.functions.ts (server RPC), yardımcı modüller
  integrations/supabase # Otomatik üretilen client + types (elle düzenleme)
  hooks/               # React hooks
supabase/
  migrations/          # Tüm SQL migration'ları (RLS, RPC, trigger, index)
  config.toml
public/                # Statik dosyalar, service-worker, manifest
```

## Öne Çıkan Özellikler

- OEM / fotoğraf / araç bilgisi ile parça arama
- Satıcı doğrulama, güvenilir satıcı rozeti
- Parça talebi (RFQ) akışı ve teklif bildirimleri
- Admin paneli: moderasyon, canlı destek, SEO, stok analizi, XML besleme
- Realtime canlı destek + push bildirim
- Ürün onay akışı, "Bugünün Fırsatları" editör vitrini
- SEO: sitemap, OEM/marka/kategori landing sayfaları, JSON-LD

## Deploy

Proje Lovable üzerinden tek tıkla Cloudflare Workers'a deploy edilir. Vercel/Netlify TanStack Start'ın Workers hedefi ile doğrudan uyumlu değildir; kendi altyapınıza taşırken `vite.config.ts` içindeki nitro preset'i uygun hedefe çevirin.

## Lisans

Özel — tüm hakları saklıdır.
