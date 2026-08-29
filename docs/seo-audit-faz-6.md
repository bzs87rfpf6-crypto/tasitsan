# SEO AUDIT — Faz 6 (Enterprise)

> **Durum:** Aşama 1 tamamlandı. Kod değişikliği yapılmadı. Aşama 2 için onayın bekleniyor.
> **Tarih:** 2026-07-09
> **Domain:** https://tasitsan.com.tr
> **Kapsam:** TanStack Start + Supabase (Lovable Cloud) tabanlı çok-vitrinli parça borsası.

---

## 1. Yönetici Özeti

Site, çok güçlü bir SEO temeline sahip: kapsamlı sitemap index (statik + kategori + marka + OEM + ürün chunk'ları), Product/Breadcrumb/ItemList/FAQ JSON-LD, 301 slug tarihi (`parts_slug_history`), IndexNow entegrasyonu, GSC ping bağlantısı ve zengin OEM/marka/kategori landing sayfaları. Ölçülen mevcut sağlık puanı: **~78 / 100**.

**En kritik 5 sorun (P0):**
| # | Sorun | Etki |
|---|---|---|
| 1 | `og:image` **root**'ta tanımlı → her leaf route'un share preview'ini eziyor (kural ihlali: `og:image` sadece leaf'te) | Ürün / OEM / marka paylaşımlarında genel görsel çıkıyor |
| 2 | Root'ta `og:type: website` + `og:url: https://tasitsan.com.tr` → leaf `og:type` üzerine yazılamıyor (meta dedup ile aynı `property` düşüyor ama üründe `product` istiyoruz) | Ürün paylaşımlarında yanlış Open Graph tipi |
| 3 | `robots.txt` içinde `Disallow: /*?sort=`, `/*?page=`, `/*?filter=`, `/*?q=` var — ancak canonical zaten set edilmiş / no faceted URL üretilmiyor. Güvenli ama **fazladan crawl-budget engeli**. | GSC "Robots.txt tarafından engellendi" kaydı üretebilir |
| 4 | `/llms.txt` yok | AI arama motorları (ChatGPT/Perplexity/Claude) tam parse edemiyor |
| 5 | Ana sayfada `<h1>` var (index.tsx içinde 1 adet) ancak agent-scan `heading structure` uyarısı raporluyor; sell + account sayfalarında H1 yok | Erişilebilirlik + SEO |

---

## 2. GSC Durum Matrisi (kod tarafında çözülebilenler)

| Durum | Muhtemel Sebep (kod-bazlı) | Etki | Önerilen Çözüm | Otomatik-Düzeltme |
|---|---|---|---|---|
| **Tarandı fakat dizine eklenmedi** | Ürün sayfalarında `og:type=website` (root cascade) + zayıf içerik farkı; parts listing için canonical yok | Google "duplicate" olarak değerlendirebilir | Ürün leaf'inde `og:type=product` set et + head'de `robots: max-snippet:-1` zaten var. `/parts` (index) sayfasına canonical ekle | Leaf head'lere override + `parts.index.tsx`'e canonical |
| **Keşfedildi fakat dizine eklenmedi** | Çok sayıda OEM sayfası (~5000/chunk, 20+ chunk), Google öncelik veremiyor | Uzun kuyruk indexleme yavaş | (a) OEM sayfası içeriğinin `total < 3` olanlarını `noindex,follow` yap (marka için zaten var, OEM için yok) (b) İç link yoğunluğunu arttır | `oem.$oem.tsx` head'e count-based noindex |
| **Robots.txt tarafından engellendi** | `robots.txt` `/*?sort=` vb. desenleri engelliyor; site sort URL üretmese bile GSC bunu rapor eder | Küçük | Deseni `Disallow: /*?sort=*`, `Disallow: /*&sort=*` sadeleştir veya kaldır — canonical zaten var | `public/robots.txt` düzenleme |
| **Noindex** | `parts.$id.tsx` `!loaderData` fallback'inde `robots: index,follow` var (iyi). `marka.$brand` `total<3` → noindex (doğru). Diğer sayfalarda beklenmeyen noindex yok | — | Değişiklik gerekmez | — |
| **404** | Slug değişince `parts_slug_history` üzerinden 301 çalışıyor, sağlam | Yok | — | — |
| **Canonical (Google başka canonical seçti)** | Ürün head'inde canonical URL `buildPartParam(loaderData)` ile üretiliyor — `params.id != canonical` ise loader zaten 301 atıyor. Sağlam. Ancak `og:url` da aynı canonical'ı işaret etmeli — bazı leaflarda ediyor, root'ta `og:url` sabit ana sayfayı işaret ediyor ve meta dedup ile leaf'i eziyor mu? → **HAYIR**, `property` bazlı dedup çalışıyor; leaf `og:url` root'u eziyor. OK | Yok | — | — |
| **Redirect** | 301 zinciri kısa (1 hop), OK | — | — | — |

---

## 3. Route-Bazlı Head Denetimi

| Route | title | description | canonical (self-ref) | og:image (leaf) | og:type doğru | JSON-LD |
|---|---|---|---|---|---|---|
| `/` (index.tsx) | ✅ | ✅ | ✅ | ⚠️ root'tan miras | ✅ website | ✅ (root'ta Organization + WebSite) |
| `/parts/$id` | ✅ dinamik | ✅ dinamik | ✅ | ⚠️ **leaf'te set edilmiyor**, root cascade | ❌ `website` kalıyor (product olmalı) | ✅ Product + Breadcrumb + FAQ |
| `/oem/$oem` | ✅ | ✅ | ✅ | ⚠️ yok | ✅ website | ✅ ItemList + Breadcrumb + FAQ |
| `/marka/$brand` | ✅ | ✅ | ✅ | ⚠️ yok | ✅ website | ✅ CollectionPage + Breadcrumb |
| `/kategori/$slug` | ✅ | ✅ | ✅ | ⚠️ yok | ✅ website | ✅ CollectionPage + Breadcrumb + FAQ |
| `/parts` (parts.index) | 🔎 kontrol edilecek | — | — | — | — | — |
| `/stok/$id` | 🔎 kontrol edilecek | — | — | — | — | — |
| `/requests/$id` | 🔎 kontrol edilecek | — | — | — | — | — |

Not: **`og:image`** kural (`head-meta` bilgi kartı): sadece leaf'te. Root'taki mevcut `og:image` sitewide fallback olarak kullanılıyor — bu, LLM/social-preview algoritmalarında **her leaf'i genel görselle** paylaşılabilir gösteriyor. Ürün için o ürünün ilk fotoğrafı, OEM/marka için placeholder yerine `imagegen` üretimi tercih edilir.

---

## 4. Structured Data Kapsamı

| Schema | Konum | Durum |
|---|---|---|
| `Organization` | `__root.tsx` (eeat-content) | ✅ |
| `WebSite` + `SearchAction` | `__root.tsx` | ✅ |
| `Product` + `Offer` + `MerchantReturnPolicy` + `OfferShippingDetails` | `parts.$id.tsx` | ✅ (kapsamlı) |
| `BreadcrumbList` | parts / oem / marka / kategori | ✅ |
| `ItemList` | oem, marka (mainEntity), kategori | ✅ |
| `FAQPage` | parts, oem, kategori | ✅ |
| `CollectionPage` | marka, kategori | ✅ |
| `ImageObject` (OEM görselleri) | `oem-image-seo.ts` builder mevcut | ⚠️ Ürün sayfası image içine caption olarak giriyor, ayrı script yayınlanmıyor |

**Eksik:** Ana sayfada `ItemList` (öne çıkan fırsatlar) yok — opsiyonel.

---

## 5. Sitemap & Robots

**Sitemap index (`/sitemap.xml`):**
- `sitemaps/static.xml`, `categories.xml`, `brands.xml`, `requests.xml`, `stok.xml`, `products-N.xml` (5000/chunk), `oem-N.xml` (5000/chunk)
- Cache: 30 dk — makul
- ✅ Tüm chunking otomatik, sayaç doğru

**Eksik:**
- `sitemaps/oem.xml` yok — sadece chunk'lar var (yeterli, sitemapindex kapsıyor)
- `static.xml` içinde `/hakkimizda`, `/iletisim`, `/agir-vasita-parcalari` gibi statik SEO sayfaları ✅ var (agir dahil)

**robots.txt sorunları:**
- `Disallow: /*?sort=` — site sort query üretmiyorsa gereksiz; GSC "engellendi" raporlayabilir
- `Disallow: /*?q=` — bu arama sonuç sayfasını engelliyor; canonical + noindex tercih edilir (`/parts?q=...`)
- `Disallow: /api/` — doğru
- Sitemap referansı ✅

---

## 6. Performans (statik analiz — build ölçümü Aşama 2'de yapılacak)

- **Root:** GA4 dinamik yükleniyor (iyi), preconnect Supabase (iyi), polyfill script inline (kabul)
- **Root lazy:** PwaLaunchDiagnostics, DeepLinkHandler, InstallPrompt, SplashScreen, GuestWelcomeDialog, SupportChat — tümü lazy ✅
- **LCP preload:** LCP görseli yok (ana sayfa arama kutusu), preload gerekmiyor
- **Bundle:** Admin sayfası ~45+ panel import ediyor — admin route açılışı ağır (ancak public değil, SEO'yu etkilemez)
- **Öneri (P2):** admin panelleri route-level lazy import ile parçala (opsiyonel)

---

## 7. Güvenlik & RLS (özet)

- `parts` tablosunda 8 policy, RLS aktif
- `user_roles` ayrı tablo, `has_role` SECURITY DEFINER ✅
- `getSeoReport`, `getSeoHealth`, `getPublicSiteSeo` **auth'suz** — sayısal SEO metriklerini herkese açıyor. Kritik değil ama admin-only'ya taşımak temiz olur (P2).

---

## 8. Kod Sağlığı — Duplikeler / Ölü Kod

| Konu | Bulgu | Öneri |
|---|---|---|
| `getSitemapParts` (seo.functions.ts:158) | "Backward compat" olarak duruyor, hiçbir yerden çağrılmıyor | **Sil** (P2) |
| Admin SEO panelleri | `SeoSitemapPanel`, `SeoReportPanel`, `OemSeoAuditPanel`, `Seo31Panel`, `IndexNowPanel`, `SeoHealthPanel` — hepsi ayrı tab | **Wrapper**: `AdminSeoCenterPanel` — tek "SEO Merkezi" sekmesi altında iç-tab ile grupla (mevcut panelleri **korur**, sadece groupings) |
| `runOemSeoAudit` server fn | `OemSeoAuditPanel` içinde kullanılıyor | OK |
| Head cascade | Root'ta `og:image`, `og:type`, `og:url` var; leaf'lerde `og:type` **override edilmiyor** ürün için | Leaf'lerde eksik override'ları ekle (P0) |
| `<a href="/oem/…">` | `kategori.$slug.tsx:132` — TanStack Link olmalı | Değiştir (P1) |
| Hardcoded SITE URL | 4-5 dosyada `"https://tasitsan.com.tr"` sabiti tekrar ediyor | `SITE_URL` sabitini `seo.functions.ts` yerine `lib/site.ts`'ye taşı ve reuse et (P2) |

---

## 9. `seo_chat--list_findings` sonuçları

Aktif failing bulgular:
1. **agent_content:content** — H1 eksik (sell, account); interactive controls'a `aria-label` eksik
2. **agent_metadata:metadata_quality** — Meta description dup (sell, auth, account root'a düşüyor)
3. **agent_metadata:social_preview** — og:type product olmalı (parts.$id)
4. **agent_metadata:structured_data** — WebSite/Organization LD zaten var → bu bulgu bayat, `fixed` işaretlenebilir
5. **gsc:gsc** — Search Console tam bağlı değil (published domain için)
6. **http:sitemap** — `/sitemap.xml` 404 → bayat: mevcut server route çalışıyor; büyük ihtimalle preview URL taraması. `fixed` işaretlenebilir
7. **http:llms_txt** — `/llms.txt` yok → **gerçek**

---

## 10. Öncelikli Aksiyon Listesi (Aşama 2 için)

### P0 (yüksek etki, düşük risk)
- [ ] **P0-1** `parts.$id.tsx` head: `og:type=product`, `og:image` = ürünün ilk fotoğrafı (mevcut `image` değişkenini kullan), `og:url` self-ref (zaten var)
- [ ] **P0-2** `oem.$oem`, `marka.$brand`, `kategori.$slug` head'lerine ürün count'una bağlı `og:image` (varsa) veya kaldır — root'a bırakma
- [ ] **P0-3** `oem.$oem`: `parts.length < 3 && equivalents.length < 3` ise `robots: noindex,follow` (marka'da olan pattern)
- [ ] **P0-4** `parts.index.tsx` + `/sell`, `/account` head'lerine unique title/desc + canonical
- [ ] **P0-5** `/llms.txt` oluştur (`public/llms.txt`)
- [ ] **P0-6** Bayat SEO findings'i `update_findings` ile `fixed` işaretle (structured_data, sitemap)

### P1 (orta etki)
- [ ] **P1-1** `robots.txt` fazlalık `Disallow: /*?sort=|page=|filter=|q=` desenlerini kaldır — canonical zaten koruyor
- [ ] **P1-2** Ana sayfa: H1 varlığını doğrula ve `<h1 className="sr-only">Türkiye'nin Yedek Parça Borsası</h1>` gibi görünmeyen semantik H1 ekle
- [ ] **P1-3** `kategori.$slug.tsx` içindeki `<a href="/oem/…">` → `<Link to="/oem/$oem" params={{oem}}>` (client routing)
- [ ] **P1-4** Sell / Account / Auth route head'lerine unique title/desc
- [ ] **P1-5** Admin: `AdminSeoCenterPanel` wrapper — mevcut 6 paneli tek "SEO Merkezi" sekmesi altında grupla (yeni tablo/server fn yok)

### P2 (düşük etki, opsiyonel)
- [ ] **P2-1** `getSitemapParts` (ölü kod) sil
- [ ] **P2-2** `getSeoHealth` / `getSeoReport` server fn'lerine `requireSupabaseAuth` + admin role check
- [ ] **P2-3** SITE URL sabitini tek yerden export et
- [ ] **P2-4** GSC bağlantısı: kullanıcı `parca-borsasi.lovable.app` yerine `tasitsan.com.tr` için Search Console verification'ı bu turnda yapılabilir

---

## 11. Beklenen Kazanımlar (Aşama 2 sonrası)

| Metrik | Şimdi | Hedef |
|---|---|---|
| SEO Sağlık Puanı | ~78 | 90+ |
| Social preview kalitesi | Jenerik | Sayfa-spesifik |
| GSC "Keşfedildi ama dizinlenmedi" | Yüksek | Yavaş azalış (haftalar) |
| AI-search discoverability | Yok (llms.txt) | Aktif |
| Admin SEO iş akışı | 6 dağınık sekme | Tek merkez |

---

## 12. Riskler

- **Düşük** — Tüm P0/P1 değişiklikleri sadece head metadata + `robots.txt` + yeni bir dosya. Kritik path'te DB/RLS/server fn dokunulmuyor.
- **P1-1 (robots.txt)** — Google `/parts?q=...` sayfalarını crawl'a başlar; canonical `/parts` çalıştığı için duplicate risk yok, ancak crawl budget birazcık artar.
- **P1-5 (admin wrapper)** — Sadece UI grubu, business logic aynı.

---

## 13. Aşama 2 Onay Soruları

1. **P0'ları toplu uygulayayım mı?** (6 madde, ~4-5 dosya değişikliği, ~30 sn build)
2. **P1'lerden hangilerini?** Hepsi mi, robots.txt hariç mi?
3. **P2'ler** için ayrı bir turnda konuşmayı tercih eder misin?
4. **AdminSeoCenterPanel wrapper**'ı istiyor musun, yoksa mevcut ayrı sekmeler kalsın mı?

Onayını bekliyorum. Aşama 2 için `docs/seo-faz-6-sonuc.md` üretilecek (öncesi/sonrası).
