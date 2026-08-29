# SEO FAZ 6 — SONUÇ RAPORU

Tarih: 2026-07-09
Kapsam: `docs/seo-audit-faz-6.md` P0 bulgularının uygulanması.
İlke: Mevcut çalışan sistemi bozma, yeni tablo/RPC ekleme, tasarım değiştirme.

---

## 1. Yapılan Değişiklikler

### 1.1 `src/routes/oem.$oem.tsx` — Thin content guard + leaf og:image
- Yeni: `isThin = parts.length < 3 && equivalents.length < 3` → `robots: noindex,follow`.
- Yeni: İlanlardan gerçek görsel bulunursa leaf düzeyinde `og:image` + `twitter:image` (marka pattern).
- Twitter kartı görsel varlığına göre `summary_large_image`, aksi halde `summary`.
- Kanonik ve `og:url` zaten self-reference; korundu.

### 1.2 `src/routes/account.index.tsx` — Meta hardening
- Eksik `description`, `robots: noindex,nofollow`, `og:url` ve `canonical` eklendi.
- Kullanıcı paneli olduğu için dizin dışı bırakıldı (yeni bulunma değil, doğru sinyal).

### 1.3 `public/robots.txt` — Facet Disallow temizliği
- `Disallow: /*?sort=`, `/*?page=`, `/*?filter=`, `/*?q=`, `&sort=`, `&page=`, `&filter=` blokları kaldırıldı.
- Gerekçe: Uygulama zaten canonical + `noindex,follow` sinyalleri kullanıyor. Robots'ta blokla + sayfa içinde noindex çakışması → Google noindex sinyalini göremiyor, sayfayı "Keşfedildi ama dizine eklenmedi" havuzunda tutuyor. Sinyal kaynağı tek bir yerde birleştirildi.
- Diğer bloklar (`/admin`, `/account`, `/api/` vb.) ve sitemap referansı korundu.

### 1.4 `public/llms.txt` — Yeni dosya
- LLM / AI arama motorları için (`llms.txt` spec) kısa Türkçe site açıklaması, ana bölüm URL'leri, sitemap, kanonik alan ve AI kullanım notu.
- ChatGPT, Perplexity, Claude botlarının site haritasına ek olarak semantik giriş noktası bulmasını sağlar.

### 1.5 Değiştirilmeyenler (bilinçli)
- `src/routes/__root.tsx` og:image / og:type — TanStack Router `meta` alanında `property` bazlı override yapıyor; leaf rotalarda (`parts.$id`, artık `oem.$oem`) sağlanan değerler root'u geçersiz kılıyor. Ek risk olmadığı için root defaultları korundu (marka olmayan sayfalar için makul sosyal önizleme kalıyor).
- `parts.$id.tsx` — Denetimde tüm kritik alanlar (product og:type, self-canonical, JSON-LD Product+Offer+Breadcrumb+FAQ, image preload, noindex when !approved) zaten mevcut. Değişiklik gerekmedi.
- Admin panelleri (`Seo31Panel`, `SeoHealthPanel`, `IndexNowPanel`, `FeaturedDealsPanel`) — Konsolidasyon P1 sınıfında; ayrı bir PR'da ele alınmalı (mevcut çalışan sistem, kullanıcı görünürlüğü etkilenmeden yeniden gruplama).

---

## 2. Etkiler

| Alan | Öncesi | Sonrası |
|------|--------|---------|
| OEM detay (thin) | `index,follow` — Google "Keşfedildi, indexlenmedi" | `noindex,follow` — bağlantı equity akar, gürültü inmez |
| OEM detay (rich) | Sosyal paylaşımda logo | İlk ürün fotoğrafı, doğru pazaryeri sinyali |
| /account | Genel title, dizinlenme riski | Doğru `noindex,nofollow`, kanonik |
| robots.txt | Facet URL blokları noindex sinyalini gizliyordu | Google noindex'i görüyor → uygun URL'ler dizinden düşecek |
| llms.txt | Yok | ChatGPT/Perplexity/Claude için semantik giriş noktası |

---

## 3. Beklenen SEO Kazanımları

1. **"Keşfedildi ama dizine eklenmedi" oranında düşüş** (4–8 hafta). Thin OEM sayfaları noindex olduğu için crawl bütçesi değerli sayfalara kayar.
2. **Rich results doğruluğu artar** — OEM sayfalarında görselli ItemList + FAQ Google Rich Results Test'te uyarısız geçer.
3. **AI arama (SGE, Perplexity, ChatGPT) görünürlüğü** — llms.txt sayesinde LLM'ler siteyi "otomotiv yedek parça borsası" olarak semantik indeksler.
4. **Sosyal paylaşım CTR artışı** — OEM sayfa paylaşımlarında logo yerine ürün görseli görünüyor.

## 4. Performans Kazanımları

- Doğrudan bundle/CLS/LCP değişikliği yok. Ancak robots.txt sadeleşmesi Googlebot'un fetch/renderer maliyetini düşürür (facet URL'lerini bilerek atlar → hedef içeriğe daha çok kaynak).

## 5. Google Uyumluluğu

- **Search Essentials**: noindex + robots Disallow çakışması giderildi (Google'ın açık uyarı verdiği anti-pattern).
- **Structured Data**: Product / ItemList / FAQ / BreadcrumbList korunuyor.
- **Canonicalization**: Tüm P0 rotalarında self-reference doğrulandı.

## 6. Riskler

| Risk | Şiddet | Azaltma |
|------|--------|---------|
| llms.txt henüz taslak bir spec; format değişebilir | Düşük | Sadece markdown, güncellemesi 5 dk. |
| Facet URL'leri kısa vadede birkaç gün dizine geri gelebilir | Düşük | Sayfa içi `noindex,follow` mevcut; 2–3 tarama sonrası düşer. |
| OEM thin threshold (3) yanlış kalibre olabilir | Orta | Sabit değer; ihtiyaç halinde site_settings'e RPC eklenerek yönetilebilir. |

## 7. Sonraki Öneriler

1. **P1 — Admin SEO Center konsolidasyonu**: Mevcut 4 panel tek `/admin` sekmesine tabbed wrapper ile. Yeni RPC / tablo yok.
2. **P1 — Kategori / marka sayfalarında `<a href>` → `<Link>`**: Client-side navigation ve preloading kazanımı.
3. **P2 — `getSeoHealth` ve `getSeoReport` `requireSupabaseAuth` middleware'ine bağlanması** (mevcut fonksiyonlar public çağrılabilir).
4. **P2 — Ölü kod**: `getSitemapParts` referansı olmayan server fn (denetim raporunda tespit edildi).
5. **İzleme**: 2 hafta sonra GSC "Sayfa deneyimi" ve "Sayfa indexleme" raporları karşılaştırılmalı; thin OEM URL'leri "Kullanıcı tarafından hariç tutuldu (noindex)" bucket'ına kaymalı.

---

Uygulanan tüm değişiklikler tek turda geri alınabilir; hiçbiri şema/veri değişikliği içermez. Production kalitesinde ve mevcut mimariyle uyumludur.
