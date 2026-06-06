## Mevcut Durum

Projede zaten kapsamlı bir talep altyapısı var:
- `part_requests` tablosu (marka, model, yıl, OEM, açıklama, fotoğraf, durum)
- `request_quotes` (satıcı teklifleri: fiyat, teslim süresi, not, durum)
- `/requests` (Talep Havuzu — satıcı görünümü, teklif ver)
- `/my-requests` (alıcı görünümü, takip + kapatma)
- `/urgent/new` + `/urgent` (acil talep akışı)
- `PartRequestDialog` (hızlı talep oluşturma)
- Admin'e push + bildirim sistemi
- AI Parça Uzmanı (yeni eklenen)

Bu plan **yeniden inşa etmek yerine eksik parçaları ekler.**

## Eklenecekler

### 1. Veritabanı (migration)
- `part_requests` tablosuna `urgency text` kolonu (`normal` / `urgent` / `very_urgent`), default `normal`. Mevcut `is_urgent=true` satırlar `urgent` olarak doldurulur.
- CHECK constraint + index.
- `status` için yeni view/RPC: dışa `open` / `quoted` / `fulfilled` / `cancelled` etiketleri (DB'de mevcut `new` / `in_progress` / `resolved` / `closed` kalır, UI mapping ile gösterilir).
- `request_center_stats()` RPC: `{ active, fulfilled, avg_first_quote_minutes, avg_fulfillment_hours }` döner.

### 2. Aciliyet UI'ı
- `PartRequestDialog` ve `/urgent/new` formuna aciliyet seçici (Normal / Acil / Çok Acil) eklenir; `is_urgent`, `very_urgent` veya `urgent` seçiminde otomatik `true` set edilir.
- `/requests` kartlarında renkli aciliyet rozeti (sarı/turuncu/kırmızı).

### 3. Talep Merkezi sayfası (`/requests` yeniden düzenlenir)
- Başlık: "📢 Parça Talep Merkezi"
- Üstte 4'lü istatistik kartı (RPC'den): Aktif talepler, Karşılanan, Ort. ilk teklif süresi, Ort. karşılanma süresi.
- Filtre çubuğu genişletilir: Marka, Model, OEM, **Aciliyet**, **Tarih aralığı** (son 24sa / 7gün / 30gün / tümü), kategori (mevcut), şehir (mevcut).
- BottomNav etiketi "Talepler" → "Talep Merkezi".

### 4. Boş arama CTA (ana sayfa)
- `/` (index.tsx) ürün sonucu 0 olduğunda var olan listelemenin yerine bir "Aradığınız parça bulunamadı" kartı.
- Büyük "🚀 Parça Talebi Oluştur" butonu → `PartRequestDialog`'u arama metni + marka/model/yıl/OEM ile **önceden doldurarak** açar.
- AI Parça Uzmanı sonucundaki "stok bulunamadı" durumunda da aynı CTA gösterilir (interpretation verilerini PartRequestDialog'a iletir).

### 5. Satıcı bildirimleri (e-posta)
- Yeni `part_requests` satırı oluştuğunda mevcut admin bildirim tetikleyicisine ek olarak ilgili kategorideki aktif satıcılara e-posta gönderen bir TanStack server route + pg_net trigger:
  - DB trigger → `/api/public/hooks/notify-sellers` (anon key ile)
  - Server route Resend bağlayıcısı üstünden e-posta yollar (Resend connector bağlanmamışsa kullanıcıdan bağlanması istenir; bağlanana kadar trigger no-op kalır).
- Push bildirim altyapısı zaten mevcut; WhatsApp için bugün bir şey eklenmiyor — sadece e-posta + push kullanılıyor, WhatsApp ileride aynı route'a eklenebilir.

### 6. Durum etiketleri
- DB durumları → kullanıcıya gösterilen etiketler:
  - `new` → "Açık"
  - `in_progress` (en az 1 teklif gelmişse) → "Teklif Geldi"
  - `resolved` → "Karşılandı"
  - `closed` → "İptal Edildi"
- "Teklif Geldi" durumu, ilk teklif geldiğinde otomatik güncellenir (yeni trigger).

## Teknik Notlar

- Aciliyet kolonu eski `is_urgent` ile birlikte yaşar; eski kod kırılmaz.
- Stats RPC SECURITY DEFINER + auth.uid() kontrolü; herkesin görmesi sakıncasız agregat metrikler.
- Resend bağlayıcı yoksa server route 503 döner, trigger sessiz geçer (üretimde uyarı log'u).
- "Çok Acil" seçimi mevcut `urgent.new` push akışını da tetikler (kritik öncelik bildirim).

## Onaylanması Gerekenler

1. Bu kapsam doğru mu, yoksa `/requests` sayfasını tamamen sıfırdan mı yazayım?
2. E-posta için Resend bağlayıcısını şimdi mi bağlayalım, yoksa bu adımı atlayıp sadece push + admin bildirimi mi kullanalım?
3. Mevcut `/my-requests` (alıcı görünümü) ayrı kalsın mı, yoksa Talep Merkezi'nin altına sekme olarak mı taşıyayım?
