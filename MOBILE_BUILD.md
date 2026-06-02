# Taşıtsan — Mobil Paketleme

## PWA (Önerilen)

Hiçbir ek araç gerekmez. Yayınladıktan sonra:

- **Android Chrome** → menü → "Ana ekrana ekle"
- **iOS Safari** → paylaş ikonu → "Ana Ekrana Ekle"

Uygulama tam ekran (standalone) açılır, splash screen ve Taşıtsan ikonu gösterilir.

## Android APK / iOS IPA (Capacitor)

Lovable sandbox native build yapamaz. Aşağıdaki adımları **kendi bilgisayarında** uygula.

### Tek seferlik kurulum

```bash
git clone <senin-github-repon>
cd tasitsan
bun install
bun add -d @capacitor/cli @capacitor/core @capacitor/android @capacitor/ios @capacitor/splash-screen @capacitor/push-notifications
bun run build

# Native platformları ekle
npx cap add android
npx cap add ios   # macOS gerekir
```

### Her değişiklikten sonra

```bash
bun run build
npx cap sync
```

### APK üretmek (Android)

```bash
npx cap open android
# Android Studio açılır → Build → Build Bundle(s)/APK(s) → Build APK(s)
```

Çıktı: `android/app/build/outputs/apk/debug/app-debug.apk`

### IPA üretmek (iOS)

```bash
npx cap open ios
# Xcode açılır → Product → Archive → Distribute App
```

Apple Developer hesabı ($99/yıl) gerekir.

## İkon ve splash

Resmi Taşıtsan logosu `/public/icon-192.png` ve `/public/icon-512.png` olarak hazır.
Native ikonları yenilemek için (opsiyonel):

```bash
bunx @capacitor/assets generate --iconBackgroundColor "#0a0907" --splashBackgroundColor "#0a0907"
```

## Push bildirim

DB tarafı hazır (`push_subscriptions` tablosu). Sağlayıcı seçildiğinde:

- **Web Push (VAPID)**: server function ile abone token'larına gönder
- **FCM**: `@capacitor/push-notifications` plugin'i ile native token al
