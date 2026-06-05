import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor konfigürasyonu — Android APK/AAB ve iOS IPA üretimi için.
 *
 * Lovable sandbox APK/IPA derleyemez (Android Studio + JDK / Xcode + CocoaPods gerekir).
 * Üretim adımları için MOBILE_BUILD.md dosyasına bakın.
 */
const config: CapacitorConfig = {
  appId: "com.tasitsan.app",
  appName: "Taşıtsan",
  // dist/client → `bun run build:capacitor` tarafından üretilen statik SPA
  // bundle'ı. .output/public içinde index.html olmadığı için doğrudan SSR
  // çıktısına bağlanamıyoruz. Detay: scripts/build-capacitor.mjs
  webDir: "dist/client",
  backgroundColor: "#0a0907",

  // Deep link & Universal Link / App Link doğrulaması:
  //  - Android: https://tasitsan.com.tr/.well-known/assetlinks.json
  //  - iOS:     https://tasitsan.com.tr/.well-known/apple-app-site-association
  // server.url'i prod'da BOŞ bırak — uygulama paketlenmiş web bundle'ı kullanır.
  // Hot-reload geliştirme için yerelde server.url = "http://<lan-ip>:8080" yapabilirsin.
  server: {
    androidScheme: "https",
    iosScheme: "https",
    hostname: "tasitsan.com.tr",
  },

  ios: {
    contentInset: "automatic",
    backgroundColor: "#0a0907",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: "#0a0907",
    allowMixedContent: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0a0907",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0907",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    Camera: {
      // izin metinleri Info.plist / AndroidManifest'e yazılır
      androidImagePickerCompressionQuality: 85,
      iosImagePickerCompressionQuality: 85,
    },
    App: {
      // tasitsan://... custom scheme + https universal links
      launchUrl: "https://tasitsan.com.tr",
    },
  },
};

export default config;
