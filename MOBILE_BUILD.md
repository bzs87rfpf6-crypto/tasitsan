# Taşıtsan — Native Mobil Paketleme (Android & iOS)

Lovable sandbox **APK/AAB/IPA derleyemez** — Android Studio + JDK ya da Xcode + CocoaPods gerekir. Bu repo Capacitor için **tam hazır**: yerel makinede aşağıdaki adımları izle.

---

## 0) Hazırlık (tek seferlik)

```bash
git clone <senin-github-repon>
cd tasitsan
bun install
```

Bu kurulum şunları getirir: `@capacitor/core`, `cli`, `android`, `ios`, `app`, `splash-screen`, `push-notifications`, `camera`, `status-bar`, `haptics`, `keyboard`, `assets`.

Gereksinimler:
- **Android**: JDK 17, Android Studio (Hedgehog+), Android SDK 34
- **iOS**: macOS, Xcode 15+, CocoaPods (`sudo gem install cocoapods`), Apple Developer hesabı ($99/yıl)

---

## 1) Native platformları ekle (tek seferlik)

```bash
bun run build
npx cap add android
npx cap add ios        # sadece macOS
npx cap sync
```

Bu `android/` ve `ios/` klasörlerini oluşturur. Bu klasörler git'e commit edilmeli.

---

## 2) İkon & Splash üret (logo değiştiğinde)

`/public/icon-512.png` resmi Taşıtsan logosudur. Tüm native ikon/splash varyantlarını tek komutla üret:

```bash
bunx @capacitor/assets generate \
  --iconBackgroundColor "#121212" \
  --iconBackgroundColorDark "#121212" \
  --splashBackgroundColor "#121212" \
  --splashBackgroundColorDark "#121212"
```

Veya yüksek kalite kaynak vermek için `resources/icon.png` (1024x1024) ve `resources/splash.png` (2732x2732) ekle, sonra yukarıdaki komutu çalıştır.

---

## 3) İzinler (otomatik eklenir, gözden geçir)

### Android — `android/app/src/main/AndroidManifest.xml`
Capacitor plugin'leri şunları ekler: `INTERNET`, `CAMERA`, `READ_MEDIA_IMAGES`, `POST_NOTIFICATIONS`, `VIBRATE`.

Deep link (App Link) için `<activity>` içine ekle:
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="tasitsan.com.tr" />
</intent-filter>
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="tasitsan" />
</intent-filter>
```

### iOS — `ios/App/App/Info.plist`
```xml
<key>NSCameraUsageDescription</key>
<string>Parça fotoğrafı çekmek için kamera kullanılır.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>İlan fotoğrafı seçmek için galeri kullanılır.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Çekilen fotoğraflar galeriye kaydedilir.</string>
```

Universal Link için Xcode → Target → Signing & Capabilities → **+ Capability → Associated Domains**:
```
applinks:tasitsan.com.tr
webcredentials:tasitsan.com.tr
```

Custom scheme için Info.plist → **URL Types**: `tasitsan`.

---

## 4) Deep Link doğrulama dosyaları

Yayında olması gereken dosyalar (zaten `public/.well-known/` içinde):

- `https://tasitsan.com.tr/.well-known/assetlinks.json` — Android App Link
- `https://tasitsan.com.tr/.well-known/apple-app-site-association` — iOS Universal Link

**Yapılacaklar (deploy öncesi):**
1. `assetlinks.json` içindeki `REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FINGERPRINT` yerine Google Play Console → Setup → App Signing → SHA-256 fingerprint'i yapıştır.
2. `apple-app-site-association` içindeki `REPLACE_TEAM_ID` yerine Apple Developer Team ID'ni yapıştır.

AASA dosyası `Content-Type: application/json` ile servis edilmeli (Lovable hosting otomatik halleder).

---

## 5) Push bildirim (FCM / APNs)

DB tarafı hazır (`push_subscriptions` tablosu) ve `@capacitor/push-notifications` plugin'i kurulu. Sağlayıcı yapılandırması:

### Android (FCM)
1. [Firebase Console](https://console.firebase.google.com) → yeni proje → Android uygulama ekle (`com.tasitsan.app`)
2. `google-services.json` indir → `android/app/google-services.json` koy
3. `android/build.gradle`'a: `classpath 'com.google.gms:google-services:4.4.2'`
4. `android/app/build.gradle` altına: `apply plugin: 'com.google.gms.google-services'`

### iOS (APNs)
1. [Apple Developer](https://developer.apple.com) → Certificates → Keys → APNs key oluştur
2. Xcode → Signing & Capabilities → **+ Capability → Push Notifications**
3. Background Modes → **Remote notifications** aç
4. APNs key'i Firebase'e yükle (FCM iOS için de proxy yapabilir) veya kendi backend'inle direkt APNs kullan

Token alma kodu native runtime'da otomatik çalışır; `PushNotificationToggle` UI'i token'ı DB'ye yazar.

---

## 6) Android APK (test) üret

```bash
bun run build && npx cap sync android
npx cap open android
# Android Studio açılır → Build → Build Bundle(s)/APK(s) → Build APK(s)
```

Çıktı: `android/app/build/outputs/apk/debug/app-debug.apk` — telefona kur, test et.

---

## 7) Android AAB (Google Play) üret

### a) Release keystore oluştur (tek seferlik)
```bash
keytool -genkey -v -keystore tasitsan-release.keystore \
  -alias tasitsan -keyalg RSA -keysize 2048 -validity 10000
```
**Şifreyi güvenli yerde sakla** — kaybolursa Play Store güncelleme yayınlayamazsın.

### b) `android/key.properties`
```properties
storePassword=***
keyPassword=***
keyAlias=tasitsan
storeFile=../../tasitsan-release.keystore
```

### c) `android/app/build.gradle` — `android {}` içine
```gradle
signingConfigs {
  release {
    def kp = new Properties()
    file('../key.properties').withInputStream { kp.load(it) }
    storeFile file(kp['storeFile'])
    storePassword kp['storePassword']
    keyAlias kp['keyAlias']
    keyPassword kp['keyPassword']
  }
}
buildTypes {
  release {
    signingConfig signingConfigs.release
    minifyEnabled true
    proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
  }
}
```

### d) AAB üret
```bash
cd android && ./gradlew bundleRelease
```
Çıktı: `android/app/build/outputs/bundle/release/app-release.aab` → Play Console'a yükle.

### Play Store yayın kontrol listesi
- [ ] Uygulama adı, kısa açıklama (80), uzun açıklama (4000)
- [ ] Ekran görüntüleri (telefon min 2, 16:9 veya 9:16, 320–3840 px)
- [ ] Feature graphic (1024×500 PNG/JPG)
- [ ] Yüksek çözünürlüklü ikon (512×512)
- [ ] Gizlilik politikası URL'i
- [ ] İçerik derecelendirmesi anketi
- [ ] Hedef kitle: 18+
- [ ] Data safety formu (kamera, konum yok, e-posta var)
- [ ] İç test → kapalı test → açık test → prod

---

## 8) iOS — Xcode & App Store

```bash
bun run build && npx cap sync ios
npx cap open ios
```

Xcode'da:
1. **Target → Signing & Capabilities** → Team seç, Bundle ID `com.tasitsan.app`
2. Capabilities ekle: **Push Notifications**, **Associated Domains** (`applinks:tasitsan.com.tr`), **Background Modes → Remote notifications**
3. **Product → Archive** → Organizer → **Distribute App → App Store Connect → Upload**

### App Store Connect yayın kontrol listesi
- [ ] App Information: name, subtitle, primary category (Shopping)
- [ ] Pricing: Free
- [ ] App Privacy: hangi veriler toplanıyor (e-posta, kullanım, fotoğraf)
- [ ] Screenshots: 6.7" iPhone (1290×2796) zorunlu, 5.5" iPhone (1242×2208) zorunlu
- [ ] App preview videosu (opsiyonel ama önerilen)
- [ ] Açıklama, anahtar kelimeler, destek URL'i, pazarlama URL'i
- [ ] Demo hesap (incelemeci için)
- [ ] Export Compliance: standart kripto kullanımı (HTTPS)
- [ ] **TestFlight** ile iç + dış test → **Submit for Review**

---

## 9) Her kod değişikliğinden sonra

```bash
bun run build
npx cap sync          # her iki platformu güncelle
# veya: npx cap sync android  /  npx cap sync ios
```

Web içerik değişiyorsa native rebuild gerekmez; sadece `cap sync` + Xcode/Studio'dan **Run** yeterli.

---

## 10) Hot-reload geliştirme (opsiyonel)

`capacitor.config.ts` içinde `server.url` alanını yerel IP'ye işaret ettir:
```ts
server: { url: "http://192.168.1.42:8080", cleartext: true }
```
`bun run dev` çalışırken telefon aynı Wi-Fi'da Vite dev sunucusuna bağlanır. **Prod build'den önce bu satırı sil.**
