import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor konfigürasyonu — native (Android APK / iOS IPA) paketleme için.
 *
 * Lovable sandbox'ında APK/IPA üretemez. Yerelde:
 *   1) Projeyi GitHub'a aktar, klonla
 *   2) bun install
 *   3) bun run build
 *   4) npx cap add android   (ve/veya)  npx cap add ios
 *   5) npx cap sync
 *   6) npx cap open android  → Android Studio → Build APK
 *      npx cap open ios      → Xcode → Archive
 *
 * Hot-reload geliştirme için `server.url` alanını lokal IP'ye çevirebilirsin.
 */
const config: CapacitorConfig = {
  appId: "com.tasitsan.app",
  appName: "Taşıtsan",
  webDir: ".output/public",
  backgroundColor: "#0a0907",
  ios: {
    contentInset: "automatic",
    backgroundColor: "#0a0907",
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
  },
};

export default config;
