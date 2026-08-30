# OnlineParça OEM Arama Zinciri — Kök Düzeltme Planı

## Amaç
Yalnızca OnlineParça OEM arama, ayrıştırma ve teknik teşhis zincirini düzeltmek. Fiyatlandırma, harici tedarikçi, sepet, sipariş, RLS ve görsel sistemlerine dokunulmayacak.

## Uygulama
1. **Arama durumlarını ayrıştırma**
   - Search sonucunun bulunmasını detail/fiyat/stok başarısından bağımsız tut.
   - `NOT_FOUND` yalnızca çalışan `/product/search` yanıtının gerçekten ürün içermediği doğrulandığında üretilecek.
   - Network/timeout, login/session, parser, detail, fiyat ve stok sorunları ayrı hata kodları ve kullanıcı mesajlarıyla dönecek.

2. **Genel OEM eşleştirme ve endpoint düzeltmesi**
   - Arama için trim + uppercase + noktalama/boşluk temizliği uygulanacak; veritabanındaki ham OEM değişmeyecek.
   - `5193124050`, `51931-24050`, `51931 24050`, `51931/24050`, `TY5193124050` gibi biçimler genel eşleştirme kurallarıyla doğrulanacak.
   - Güncel `/product/search` ana ve belirleyici yol olacak; eski `/search?q=…` 404 fallback’i kaldırılacak.
   - Satır eşleşmesi kurulamazsa tüm response içindeki güçlü OEM kanıtı ile ilk geçerli ürün korunacak; detail başarısızlığı ürünü düşürmeyecek.

3. **Güvenilir istek ve teşhis verisi**
   - Search/detail isteklerine timeout eklenecek ve aynı login session/cookie kullanılacak.
   - Debug çıktısına normalize OEM, response uzunluğu/önizlemesi, ürün sayısı, product/detail durumları, fiyat/stok parser durumları ve kesin failure code eklenecek.
   - Login yönlendirmeleri ve yetki cevapları `SESSION_EXPIRED` / `LOGIN_REQUIRED` olarak sınıflandırılacak.

4. **Admin OEM Arama Teşhisi ve regresyon tablosu**
   - Tekli test ekranı istenen SEARCH → PRODUCT → DETAIL → STOCK/PRICE zincirini açıkça gösterecek.
   - Son başarısız taramalardan en az 10 OEM ile referans OEM’leri çalıştıran çoklu test eklenecek.
   - Tablo: `OEM | Search | Product | Detail | Stock | Price | Final Result`; sonuçlar A–G hata sınıflarına ayrılacak.

5. **Doğrulama**
   - Referans iki OEM ve beş farklı 5193124050 formatı test edilecek.
   - Geçmişte `NOT_FOUND` olan en az 10 OEM gerçek OnlineParça isteğiyle test edilip sınıflandırılacak.
   - Sonuç raporunda kök nedenler, hata sınıfları, tüm test OEM’leri, sonuçları ve değişen dosyalar verilecek.

## Değişmesi beklenen dosyalar
- `src/lib/supplier-scan.server.ts`
- `src/lib/supplier-scan.functions.ts`
- `src/components/admin/SupplierScanPanel.tsx`

## Teknik sınırlar
- Server function dosyası ince RPC wrapper olarak kalacak; runtime yardımcıları server modülünde tutulacak.
- Şifre, cookie veya oturum belirteci debug çıktısına/loglara yazılmayacak.
- Referans OEM’lere özel hard-code kullanılmayacak.
