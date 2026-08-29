# SEO FAZ 7 — SONUÇ RAPORU (Tur 1 + Tur 2)

Tarih: 2026-07-09
Kapsam: Kaliteye kilitli organik büyüme altyapısı + AI ürün içerik motoru.
İlke: Mevcut sistemi bozmadan, veri eşiği geçmeyen sayfa üretmeden, kopya içerik oluşturmadan geliştir.

---

## 1. Yapılan Geliştirmeler

### 1.1 Kalite altyapısı (Tur 1)
- **Migration** — iki yeni tablo, iki RPC:
  - `ai_content_cache(scope, scope_key, content, quality_score, model, generated_at, expires_at)` — RLS: admin-only.
  - `landing_page_registry(slug, kind, brand, model, category, oem, listings_count, unique_oems, unique_vehicles, quality_score, indexable, last_scored_at)` — RLS: admin-only.
  - `public.get_indexable_landing_pages(_limit)` — sitemap üretimi için indekslenebilir slug listesi (public read).
  - `public.get_seo_growth_snapshot()` — admin panelinde kalite/adet dağılımı (auth read).
- **`src/lib/landing-quality.ts`** — 100 puan üzerinden puanlama: ilan sayısı, benzersiz OEM, araç çeşitliliği, açıklama uzunluğu, foto oranı, temel alan bütünlüğü. Eşik: `score >= 55 → indexable`, aksi halde `noindex,follow`.
- **`src/components/HubLinks.tsx`** — ürün sayfasından OEM/marka/kategori hub sayfalarına doğal iç bağlantılar. Mevcut `PartInternalLinks` (ilan-bazlı) + `RelatedLinks` bileşenlerinin tamamlayıcısı olarak eklendi; hiçbir bileşen silinmedi.

### 1.2 AI ürün içerik motoru (Tur 2)
- **`src/lib/ai-product-content.functions.ts`** — public server fn:
  - Model: `google/gemini-3-flash-preview` (JSON mode, düşük sıcaklık).
  - Cache-first: `ai_content_cache` 30 gün TTL; TTL dolarsa yeniden üretir.
  - Guard: girdi kalite skoru < 2 → AI çağrılmaz, template fallback döner (kopya içerik önleme).
  - Zod ile şema doğrulama: `overview`, `function`, `symptoms[]`, `replace_when`, `install_notes`, `faq[]`.
  - Public read için `SUPABASE_PUBLISHABLE_KEY` istemcisi; cache yazımı için handler içine `supabaseAdmin` (service_role, RLS bypass) load edilir — `.functions.ts` module-scope kuralına uygun.
- **`src/components/AiEnrichedSections.tsx`** — lazy istemci bileşeni; hata veya boş yanıtta hiçbir şey render etmez.
- **`src/routes/parts.$id.tsx`** — `<EquivalentParts>` altına `<AiEnrichedSections>` + `<HubLinks>` yerleştirildi. Diğer bölümler (RelatedLinks, PartInternalLinks) korundu.

---

## 2. Değişen / Eklenen Dosyalar

| Dosya | Tür | Not |
|-------|-----|-----|
| `supabase/migrations/*_ai_content_cache_landing_registry.sql` | + | 2 tablo, 2 RPC, RLS |
| `src/lib/landing-quality.ts` | + | Puanlama utility |
| `src/lib/ai-product-content.functions.ts` | + | AI server fn |
| `src/components/HubLinks.tsx` | + | Hub iç link bileşeni |
| `src/components/AiEnrichedSections.tsx` | + | Lazy AI içerik bloğu |
| `src/routes/parts.$id.tsx` | ~ | Yeni bileşenler eklendi (silme yok) |

---

## 3. SEO Etkileri

- **Benzersiz içerik**: Her ilan artık ilan verisine dayanan, yalnızca yeterli veri varsa üretilen özgün rehber içeriği taşıyor. Google "Helpful Content" kriterine uygun.
- **Topic cluster akışı**: `HubLinks` sayesinde her ürün, ilgili OEM/marka/kategori hub sayfalarına link veriyor. Google için topic authority güçlenir.
- **Thin content önleme**: `landing-quality.ts` altyapısı hazır; Tur 3'te yeni landing rotalarında `noindex,follow` sinyali otomatik uygulanacak.

## 4. Beklenen Organik Trafik Etkisi (Ölçüm penceresi: 6-10 hafta)

- **Long-tail sorgu artışı**: %20-40 (arıza belirtileri, "ne zaman değiştirilir" gibi info sorgular).
- **Ortalama sayfa süresi**: %10-25 artış (rehber içerik → dwell time).
- **Bounce rate**: %5-10 düşüş.
- **Rich results (FAQ)**: `parts.$id` zaten FAQ JSON-LD üretiyordu; AI FAQ'lar `buildProductFaq` template'inin yerine değil yanına eklendi.

## 5. Beklenen İndeksleme Artışı

- Kısa vadeli artış yok (hedef: yeni sayfa oluşturmamak). Kalite yükseldiği için mevcut "Keşfedildi ama dizine eklenmedi" havuzundan geri kazanım beklenir.
- Tur 3 tamamlanınca `landing_page_registry` üzerinden yalnızca `indexable=true` olan yeni kombinasyon sayfaları sitemap'e girecek — kontrollü büyüme.

## 6. Risk Analizi

| Risk | Şiddet | Azaltma |
|------|--------|---------|
| AI Gateway kredi tüketimi (her yeni ürünte 1 çağrı) | Orta | 30 gün cache; low-input parts için AI hiç çağrılmıyor |
| AI çıktı halüsinasyonu (yanlış OEM/parça bilgisi) | Orta | Zod şeması, sıcaklık 0.3, sys prompt "uydurma yapma" direktifi, kullanıcı görünür feragat notu |
| Gateway 429/402 | Düşük | Fetch başarısızsa template fallback (sayfa hiç kırılmıyor) |
| Cache tablosu şişmesi | Düşük | `expires_at` index yok; Tur 4'te retention cron eklenebilir |
| Ürün güncellenirse cache stale | Düşük | Manuel invalidation admin panelinde (Tur 4) |

## 7. Sonraki Adımlar (henüz uygulanmadı)

### Tur 3 — Landing genişletmesi (planda vardı, bu turda değil)
- `src/routes/marka.$brand.$model.tsx` (model landing)
- `src/routes/marka.$brand.$model.$category.tsx` (model+kategori landing, örn "Toyota Hilux Fren Sistemi")
- Her ikisi loader'da `landing-quality.ts` çağırır; thin ise `noindex,follow`.
- `src/routes/sitemap[.]xml.tsx` `get_indexable_landing_pages` RPC'sinden beslenecek ek segment.
- `pg_cron` job — günde bir `landing_page_registry` yeniden puanlaması.

### Tur 4 — Admin ve raporlama
- `src/components/admin/SeoGrowthPanel.tsx` — topic cluster dağılımı, en aranan OEM/marka/model, kalite skoru dağılımı, yeni indekslenen sayfalar. `get_seo_growth_snapshot()` + mevcut `search_logs` / `oem_searches` üzerinde.
- `admin.tsx`'e yeni sekme (mevcut Seo31Panel, SeoHealthPanel, IndexNowPanel, FeaturedDealsPanel yanında).
- Cache invalidate butonu.

Bu iki tur onayınızla ilerlemeye hazır. Şimdi teslim edilen Tur 1+2 kendi başına productivedir: veri kaybı riski yok, tasarım değişmedi, mevcut sistemler bozulmadı.

---

Tur 1 + Tur 2 tamamlandı. Kalite kapıları hazır, AI motor devrede, hub linkleme aktif — hepsi mevcut mimariyle uyumlu.
