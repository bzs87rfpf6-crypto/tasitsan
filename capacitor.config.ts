import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor konfigürasyonu — Android APK/AAB ve iOS IPA üretimi için.
 *
 * Lovable sandbox APK/IPA derleyemez (Android Studio + JDK / Xcode + CocoaPods gerekir).
 * Üretim adımları için MOBILE_BUILD.md dosyasına bakın.
 *
 * NEDEN server.url = https://tasitsan.com.tr?
 *   Bu proje TanStack Start (SSR) üzerinde çalışıyor. Üretim HTML'i ve tüm
 *   server function çağrıları (/_serverFn/...) Cloudflare Worker SSR
 *   tarafından her istekte üretiliyor. Capacitor'a yalnız `dist/client` SPA
 *   shell'i paketleyip `server.hostname` ile sunarsak server fn istekleri
 *   local bundle'da aranır ve 404 döner → ilk render server fn'e bağlı
 *   olduğu için uygulama tamamen siyah/boş kalır.
 *
 *   Çözüm: WebView'i doğrudan canlı domain'e bağla. Böylece üretim
 *   sunucusundaki SSR + auth + server fn'ler aynen mobile içinde çalışır.
 *   Bu, Capacitor için "remote first" + offline fallback paterni.
 */
const config: CapacitorConfig = {
  appId: "com.tasitsan.app",
  appName: "Taşıtsan",
  // Offline fallback ve cap sync için statik shell hâlâ gerekli; ancak
  // server.url verildiği için aktif olarak canlı URL yüklenir.
  webDir: "dist/client",
  backgroundColor: "#121212",

  // Deep link & Universal Link / App Link doğrulaması:
  //  - Android: https://tasitsan.com.tr/.well-known/assetlinks.json
  //  - iOS:     https://tasitsan.com.tr/.well-known/apple-app-site-association
  server: {
    androidScheme: "https",
    iosScheme: "https",
    // Android siyah ekran teşhisi için geçici olarak paket içi dist/client/index.html yüklenir.
    // Canlı siteye dönmek için test bitince url: "https://tasitsan.com.tr" tekrar eklenebilir.
    // HTTPS olduğu için cleartext gerekmez, ama hata ayıklamada engellemesin.
    cleartext: false,
    // Tüm tasitsan.com.tr alt domainlerinde Capacitor köprüsü aktif kalsın.
    allowNavigation: [
      "tasitsan.com.tr",
      "*.tasitsan.com.tr",
      "*.lovable.app",
      "*.supabase.co",
    ],
  },

  ios: {
    contentInset: "automatic",
    backgroundColor: "#121212",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: "#121212",
    allowMixedContent: false,
    // WebView debug aç — Chrome DevTools üzerinden chrome://inspect ile
    // kara ekran tespitinde gerçek konsol/network görülebilsin.
    webContentsDebuggingEnabled: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#121212",
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
      backgroundColor: "#121212",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    Camera: {
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
