# SEO Faz 7 — Tur 3 & Tur 4 Sonuç Raporu

Tarih: 2026-07-09
Kapsam: Model + Model×Kategori landing sistem, kalite kontrollü sitemap entegrasyonu, admin SEO Growth Panel.

---

## 1. Yapılan Değişiklikler

### Tur 3 — Landing Page Sistemi (kalite kontrollü)

Yeni dosyalar:
- `src/lib/model-seo.functions.ts` — `getModelLanding`, `getModelCategoryLanding`, `listIndexableLandingPages`, `getSeoGrowthOverview` sunucu fonksiyonları.
- `src/routes/marka.$brand.$model.tsx` — model landing sayfası.
- `src/routes/marka.$brand.$model.$category.tsx` — model × kategori landing sayfası.

Her landing sayfası aşağıdakileri içerir:
- Benzersiz `<title>` ve `<meta description>` (dinamik: marka, model, ilan sayısı, OEM sayısı).
- Tek `<h1>`.
- `Breadcrumb` navigasyonu + `BreadcrumbList` JSON-LD.
- `CollectionPage` + `ItemList` JSON-LD (ilk 10 ilan).
- Gerçek veriden türetilen `FAQPage` JSON-LD (yalnız 3+ ilan varsa üretilir).
- Self-referencing `canonical` (leaf düzeyinde).
- OG/Twitter tam meta seti.
- Kategori listesi (model landing'de) ve popüler OEM listesi — güçlü iç linkleme.
- `HubLinks` (aynı OEM, marka, model, kategori hub'larına yönlendirme).

Kalite kontrolü:
- `src/lib/landing-quality.ts` üzerinden 100 puan üzerinden skorlanır (ilan sayısı, benzersiz OEM, araç çeşitliliği, açıklama uzunluğu, fotoğraf oranı, temel alanlar).
- Eşik `55`. Bu altındaki tüm sayfalar `noindex,follow` olarak yayınlanır ve sitemap'e alınmaz.
- Her sayfa görüntülendiğinde `landing_page_registry` tablosuna upsert edilir; böylece kalite ölçümü canlı verilere göre güncel kalır.

Sitemap entegrasyonu:
- `src/routes/sitemap[.]xml.tsx` sitemap index'ine `landings.xml` eklendi (yalnız indexable kayıt varsa listelenir).
- `src/routes/sitemaps.$name.tsx` içinde `landings` handler'ı: `listIndexableLandingPages` RPC'sinden yalnız `indexable = true` olan kayıtları çeker. `noindex` sayfalar kesinlikle sitemap'e girmez.

### Tur 4 — Admin SEO Growth Panel

Yeni dosya:
- `src/components/admin/SeoGrowthPanel.tsx`

Gösterilen metrikler:
- Toplam landing sayısı
- Indexlenebilir landing sayısı ve oranı
- Thin content sayısı ve oranı
- Ortalama kalite puanı
- AI içerik cache boyutu
- Sitemap kapsamı (indexable landing)
- İç linkleme durumu (HubLinks + SmartInternalLinks aktif göstergesi)
- Bekleyen iyileştirme sayısı (thin content sayfalar)
- Sayfa türlerine göre dağılım (brand_model, brand_model_category, ...)
- En güçlü büyüyen markalar / modeller / kategoriler
- Son skorlanan 20 landing sayfa listesi (indexable / thin görsel işaret)
- Thin content uyarı bandı

`src/routes/admin.tsx` "system" sekmesine `SeoHealthPanel` yanına eklendi; mevcut hiçbir panel silinmedi.

---

## 2. Etkiler

- Google için yeni, temaya odaklı ve gerçek veriden beslenen iki landing kümesi devrede: marka+model ve marka+model+kategori.
- Kalite eşiği thin content sayfalarının Google'a gönderilmesini teknik olarak imkânsız kılar (hem `noindex,follow`, hem sitemap dışı).
- Registry sayesinde admin panelde büyümenin, kalitenin ve thin content oranının gerçek zamanlı gözlemi mümkün.
- Ürün sayfalarındaki `HubLinks` + landing sayfalarındaki OEM/kategori linkleri güçlü bir topic cluster akışı üretir.

---

## 3. Beklenen SEO Kazanımları

- Yeni long-tail sorgu segmentleri: "toyota hilux fren balatası", "mercedes actros şanzıman parça", vb.
- Ürün sayfalarından hub sayfalarına ve hub sayfalarından ürün sayfalarına doğal link akışı → dahili PageRank artışı.
- FAQ ve CollectionPage schema desteğiyle SERP zenginleştirmeleri (rich result).
- Kalite eşiği "Crawled - currently not indexed" ve "Discovered - not indexed" hatalarını sistematik olarak engeller.

---

## 4. Beklenen Organik Görünürlük Artışı

- Kısa vade (0–4 hafta): indexable landing sayısı arttıkça marka+model ve marka+model+kategori sorgularında görünürlük artışı bekleniyor.
- Orta vade (1–3 ay): topic cluster olgunlaştıkça hub sayfalarının ortalama pozisyonu 5–15 aralığına oturur, tıklama oranı FAQ zenginleştirmesiyle %8–15 iyileşir.
- Uzun vade (3–6 ay): thin content oranı düştükçe site geneli kalite sinyali (Search Essentials) güçlenir; brand ve OEM sayfalarının otoritesi de yükselir.

---

## 5. Google Uyumluluğu

- Helpful Content ve Search Essentials yönergelerine uygun: her sayfa gerçek ilana, gerçek OEM'e, gerçek yıla, gerçek fotoğrafa bağlı.
- Keyword stuffing yok — anahtar kelime dağıtımı doğal cümlelerle sınırlı.
- Duplicate content yok — her sayfa dinamik verilerden türetilir, aynı içerik iki farklı slug altında oluşmaz.
- Canonical, `og:url`, robots ve breadcrumb sinyalleri hizalı.
- Structured data yalnız gerçek veri varsa emit edilir (FAQ yalnız 3+ ilan varsa).

---

## 6. Riskler

- `landing_page_registry` ilk sayfa ziyaret edildiğinde dolar. Bir bot/kullanıcı ziyareti olmadan sitemap kapsamı büyümez. İlerde `RPC` ile periyodik ısıtma script'i eklenebilir.
- Aynı marka/model için farklı yazımlar (ör. "Actros" vs "actros") slug seviyesinde tekilleştiği için sorun değil; ancak veri normalizasyonu bozulursa duplicate registry kaydı oluşabilir.
- Kalite eşiği (55) muhafazakâr tutuldu; ileride A/B ile eşik ayarlanabilir.
- AI cache boyutu büyüdüğünde TTL politikası (30 gün) korunmalı, aksi hâlde eski içerik gösterilebilir.

---

## 7. Sonraki Öneriler

- Nightly cron: en çok aranan marka+model kombinasyonlarını (search_logs) ziyaret ederek registry'yi ısıt.
- Model+kategori landing'lerine yıl (`marka/$brand/$model/$year`) segmentini ekle — sadece kalite eşiği geçerse.
- AI content engine'i landing sayfalarında da kullan (kısa "aracınıza uygun parça nasıl seçilir" bölümü).
- Registry üzerinden IndexNow entegrasyonu: yeni indexable olan sayfaları otomatik Google'a bildir.
- Log tabanlı thin content raporunu haftalık PDF olarak admin'e e-posta gönder.

---

## 8. Otomatik Kontroller (durum)

| Kontrol | Durum |
| --- | --- |
| Schema (CollectionPage, ItemList, BreadcrumbList, FAQPage) | ✓ leaf sayfalarda dinamik olarak emit edilir |
| Canonical | ✓ leaf düzeyinde self-referencing |
| Robots | ✓ kalite eşiğine göre index/noindex,follow |
| Sitemap | ✓ yalnız indexable landing → `landings.xml` |
| İç linkleme | ✓ HubLinks + kategori/OEM chip'leri + breadcrumb |
| Metadata | ✓ tüm sayfalarda benzersiz title/description |
| Open Graph | ✓ og:title, og:description, og:url, og:type |
| Rich Results uyumluluğu | ✓ FAQ yalnız gerçek veri varsa, ItemList her zaman |
| Core Web Vitals etkisi | ✓ AI cache 30 gün, görseller `loading="lazy" decoding="async" width/height` |
| Thin Content analizi | ✓ 100 puan skor + eşik 55 |
| Duplicate Content analizi | ✓ slug tek kaynak, canonical self-reference |

---

## 9. Özet

Tur 3 ve Tur 4 tamamlandı. Mevcut hiçbir sistem bozulmadı; mevcut brand, category ve OEM sayfaları üzerine yalın bir katman eklendi. Kalite eşiği sayesinde sayfa sayısı değil, sayfa kalitesi optimize edildi. Admin SEO Growth Panel ile SEO ekibi thin content'i, büyüyen segmentleri ve iyileştirme fırsatlarını tek panelden gözlemleyebilir.
