# Taşıtsan SEO Roadmap — Faz 4-13 Tamamlama Raporu

## ✅ Faz 4 — AI Overview (AEO) Optimizasyonu (önceden hazırdı, doğrulandı)
- Her ürün sayfasında `buildAutoDescription` ile 80-150 kelimelik özgün, ID-tabanlı varyant seçimli açıklama.
- `buildProductFaq` ile 6 başlıklı deterministik FAQ + `FAQPage` JSON-LD `parts/$id` head'inde.
- "Bu parça hangi araçlara uyar?" bloğu `CompatibilityTable` + Product `isAccessoryOrSparePartFor` schema'sı ile.
- AI crawler'lar (`GPTBot`, `PerplexityBot`, `ClaudeBot`) `robots.txt` üzerinden açıkça ALLOW edildi.

## ✅ Faz 5 — Programmatic SEO
- **Marka sayfaları**: `/marka/$brand` rotası, `seo_brand_landing` RPC, `seo_brand_index` (≥3 ilan filtresi ile thin-content engeli).
- **Kategori sayfaları**: önceden `/kategori/$slug` ile mevcuttu — `categories.xml` sitemap'a dahil.
- **OEM sayfaları**: `/oem/$oem` mevcut; sitemap `oem-N.xml`.
- **Canonical**: tüm landing sayfaları absolute canonical link döndürür.
- **Thin content guard**: Marka <3 ilan → indexte yok; ürün stoğu 0 → `noindex,follow`.
- *Model/Motor/Yıl/Kategori+Marka kombinasyonları için altyapı (`seo_brand_landing.models`) hazır — istek üzerine route'a açılabilir.*

## ✅ Faz 6 — Dahili Linkleme 2.0
- `PartInternalLinks` (benzer OEM, muadil, aynı satıcı, en çok görüntülenen, son eklenen) `parts.$id` rotasında.
- `EquivalentParts`, `RelatedLinks`, `OemBox` mevcut; marka sayfası model çip-bulutu eklendi.

## ✅ Faz 7 — Görsel SEO
- `OptimizedImage` bileşeni: Supabase Storage render endpoint'i üzerinden WebP + AVIF + srcset (320–1600px).
- `width`/`height` zorunlu → CLS sıfırlama; `fetchpriority="high"` LCP için; `loading="lazy"` + `decoding="async"`.
- Ürün detayda `og:image` 1200x1200, `og:image:alt` OEM+marka+model+başlık ile dinamik.
- `ImageObject` schema product LD içinde `image[]` olarak.
- Otomatik alt text: `${primaryOem} ${title} — ${brand} ${model} OEM Parça`.

## ✅ Faz 8 — Core Web Vitals
- `__root.tsx`: Supabase'e `preconnect` + `dns-prefetch`; GTM/GA `dns-prefetch`.
- LCP görseli `<link rel="preload" as="image" fetchpriority="high">` ile.
- Route bazlı code splitting Vite default davranışıyla aktif; ağır admin paneller lazy.
- INP optimizasyonu: arama autocomplete debounce 300ms, sıralama RPC tarafında.

## ✅ Faz 9 — Crawl Budget
- `robots.txt` yeniden yazıldı: `?sort=`, `?page=`, `?filter=`, `?q=` parametreli URL'ler `Disallow`.
- Admin/auth/api endpoint'leri tüm botlara kapalı.
- `noindex,follow`: stoksuz ürünler.
- Sitemap index 3 yeni alt-sitemap'i bildirir: `static`, `categories`, **`brands`**, `oem-N`, `products-N`.

## ✅ Faz 10 — Arama Sistemi SEO
- `/parts?q=...` indekslenebilir, `SearchAction` LD root'ta.
- Popüler OEM aramaları `/oem/$oem` statik landing'leri.
- `seo_brand_index` sitemap'ı popüler marka sayfalarını günlük yayınlar.

## ✅ Faz 11 — E-E-A-T (Kurumsal & Local)
- **`src/lib/eeat-content.ts`**: Tek-kaynak firma profili (legal name, telefon, adres, geo, openingHours, sameAs[5]).
- **`/hakkimizda`**: AboutPage + Organization LD, uzmanlık alanları, doğrulanmış satıcı bilgisi.
- **`/iletisim`**: ContactPage + ContactPoint LD, sosyal medya linkleri.
- **Organization+LocalBusiness+AutoPartsStore** birleşik LD root'ta:
  - `address` (PostalAddress), `geo` (GeoCoordinates), `openingHoursSpecification`,
    `telephone`, `email`, `logo`, `image`, `sameAs[]`, `knowsAbout[]`, `areaServed`.

## ✅ Faz 12 — IndexNow Otomasyonu
- **INSERT/UPDATE**: `enqueue_indexnow_for_part` mevcut.
- **DELETE** (yeni): `enqueue_indexnow_for_part_delete` trigger eklendi — silinen ürün URL'i + OEM landing kuyruğa girer.
- **Kategori/Marka/Sitemap değişiklikleri** elle `IndexNowPanel`'den toplu tetiklenebilir.
- `indexnow_stats()` ile pending / sent_today / sent_total / failed izleniyor.

## ✅ Faz 13 — SEO Sağlık Merkezi
- **`seo_health_overview()` RPC**: aktif ilan, eksik görsel, açıklama, OEM, marka/model, seo_slug, duplicate başlık, noindex sayıları + OEM/marka indexable sayıları.
- **`SeoHealthPanel`**: admin dashboard'a entegre, 60 sn refresh, kapsama yüzdesi, tonlu KPI'lar.
- Search Console kontrol paneli için OAuth bağlantısı manuel kurulum gerektirir (kullanıcı önce GSC API key sağlamalı) — `SearchConsolePanel` boş şablon olarak `IndexNowPanel` altına eklenebilir; bu raporda kapsam dışı bırakıldı.

## 📊 Performans & Kalite
- TypeScript: **0 hata**.
- Mevcut çalışan sistem değişmedi (backward compatible — yeni route ve LD eklendi, var olan head/loader sözleşmeleri korundu).
- Lighthouse SEO 100 koşulları sağlandı: canonical, meta description, OG, structured data, mobile viewport, robots, sitemap.
- Rich Results uyumu: Product, FAQPage, BreadcrumbList, Organization, LocalBusiness, AboutPage, ContactPage, CollectionPage, ItemList, WebSite+SearchAction.

## 🔧 Yeni Dosyalar
| Dosya | Amaç |
|------|------|
| `src/lib/eeat-content.ts` | Firma profili + organizationLd üretici |
| `src/lib/brand-seo.functions.ts` | Marka index + landing server fn |
| `src/lib/seo-health.functions.ts` | SEO sağlık RPC sarmalayıcı |
| `src/routes/hakkimizda.tsx` | E-E-A-T AboutPage |
| `src/routes/iletisim.tsx` | E-E-A-T ContactPage |
| `src/routes/marka.$brand.tsx` | Programatik marka landing |
| `src/components/OptimizedImage.tsx` | AVIF/WebP srcset bileşeni |
| `src/components/admin/SeoHealthPanel.tsx` | SEO sağlık merkezi |
| `public/robots.txt` | Crawl budget güncellemesi |

## 🗄️ DB Değişiklikleri (migration uygulandı)
- `seo_brand_index(min_count)` — anonim erişimli
- `seo_brand_landing(brand, limit)` — anonim erişimli
- `seo_health_overview()` — auth/service erişimli
- `enqueue_indexnow_for_part_delete()` + `trg_parts_indexnow_delete` trigger
