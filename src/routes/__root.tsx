import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { translateError } from "@/lib/error-messages";
import { organizationLd as organizationLdFromBuild } from "@/lib/eeat-content";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { CartProvider } from "@/lib/cart";
import { SiteFooter } from "@/components/SiteFooter";

const PwaLaunchDiagnostics = lazy(() => import("@/components/PwaLaunchDiagnostics").then((mod) => ({ default: mod.PwaLaunchDiagnostics })));
const DeepLinkHandler = lazy(() => import("@/components/DeepLinkHandler").then((mod) => ({ default: mod.DeepLinkHandler })));
const InstallPrompt = lazy(() => import("@/components/InstallPrompt").then((mod) => ({ default: mod.InstallPrompt })));
const SplashScreen = lazy(() => import("@/components/SplashScreen").then((mod) => ({ default: mod.SplashScreen })));
const SupportChat = lazy(() => import("@/components/support/SupportChat"));
const LocationConsentDialog = lazy(() => import("@/components/LocationConsentDialog"));

function isAndroidCapacitorLikeRuntime() {
  if (typeof window === "undefined") return false;
  const hasCapacitor = Boolean((window as unknown as { Capacitor?: unknown }).Capacitor);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return hasCapacitor || /; wv[)]|\bwv\b|Capacitor/i.test(ua);
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl text-gold">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Sayfa bulunamadı</h2>
        <p className="mt-2 text-sm text-muted-foreground">Aradığınız sayfa mevcut değil.</p>
        <Link to="/" className="mt-6 inline-flex rounded-md bg-gold-gradient px-5 py-2.5 text-sm font-semibold text-gold-foreground shadow-gold">
          Anasayfa
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error("[TanStack ErrorBoundary]", error?.name, error?.message, error?.stack);
  const router = useRouter();
  // Teknik detay ASLA sunucu HTML'ine yazılmaz: Google snippet'inde
  // "TypeError: Failed to fetch dynamically imported module" gibi metinler
  // görünmesin diye yalnızca ?debug=1 ile ve hidrasyondan sonra gösterilir.
  const [debug, setDebug] = useState<string | null>(null);
  useEffect(() => {
    reportLovableError(error, {
      boundary: "tanstack_root_error_component",
      errorName: error?.name,
      errorMessage: error?.message,
      errorStack: error?.stack,
      path: typeof window !== "undefined" ? window.location.pathname + window.location.search : "",
    });
    try {
      if (new URLSearchParams(window.location.search).get("debug") === "1") {
        setDebug(`${error?.name ?? "Error"}: ${error?.message ?? "Unknown"}\n${error?.stack ?? ""}`);
      }
    } catch { /* noop */ }
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-lg text-center">
        <h1 className="text-xl font-semibold">Bir şeyler ters gitti</h1>
        <p className="mt-2 text-sm text-muted-foreground">{translateError(error)}</p>
        {debug && (
          <pre className="mt-3 text-left text-xs bg-muted/30 rounded-md p-2 whitespace-pre-wrap break-words max-h-64 overflow-auto">
            {debug}
          </pre>
        )}
        <div className="mt-6 flex gap-2 justify-center">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-gold-gradient px-4 py-2 text-sm font-semibold text-gold-foreground"
          >
            Tekrar dene
          </button>
          <a href="/" className="rounded-md border border-border px-4 py-2 text-sm">Anasayfa</a>
        </div>
      </div>
    </div>
  );
}


export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async () => {
    try {
      const { getPublicSiteSeo } = await import("@/lib/seo.functions");
      return await getPublicSiteSeo();
    } catch {
      return { ga4: null, gsc: null };
    }
  },
  head: ({ loaderData }) => {
    const gsc = loaderData?.gsc ?? null;
    const meta: Array<Record<string, string>> = [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" },
      { name: "theme-color", content: "#f4f5f7" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Taşıtsan Parça Borsası" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      { title: "Taşıtsan Parça Borsası — Otomotiv Yedek Parça" },
      { name: "description", content: "Türkiye'nin yedek parça borsası. Tüm teklif ve iletişim süreçleri Taşıtsan üzerinden güvenle yönetilir." },
      { name: "robots", content: "index,follow,max-image-preview:large,max-snippet:-1" },
      { property: "og:title", content: "Taşıtsan Parça Borsası | Otomotiv Yedek Parça Pazaryeri" },
      { property: "og:description", content: "Toyota, Mitsubishi, Isuzu, Renault, Ford ve birçok marka için binlerce sıfır ve çıkma yedek parçayı güvenle bulun." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Taşıtsan Parça Borsası" },
      { property: "og:locale", content: "tr_TR" },
      { property: "og:url", content: "https://www.tasitsan.com.tr" },
      { property: "og:image", content: "https://www.tasitsan.com.tr/og-image.jpg" },
      { property: "og:image:secure_url", content: "https://www.tasitsan.com.tr/og-image.jpg" },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Taşıtsan Parça Borsası — Otomotiv Yedek Parça Pazaryeri" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@tasitsan" },
      { name: "twitter:title", content: "Taşıtsan Parça Borsası | Otomotiv Yedek Parça Pazaryeri" },
      { name: "twitter:description", content: "Toyota, Mitsubishi, Isuzu, Renault, Ford ve birçok marka için binlerce sıfır ve çıkma yedek parçayı güvenle bulun." },
      { name: "twitter:image", content: "https://www.tasitsan.com.tr/og-image.jpg" },
      { name: "twitter:image:alt", content: "Taşıtsan Parça Borsası — Otomotiv Yedek Parça Pazaryeri" },
    ];
    meta.push({ name: "google-site-verification", content: "5btdy3woANJj2uefmPtCejBLwHmcXm8Ljv" });
    return {
      meta,
      links: [
        { rel: "stylesheet", href: appCss },
        // Turkish-safe web fonts (latin-ext subset covers Ç Ğ İ ı Ö Ş Ü)
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Bebas+Neue&display=swap&subset=latin,latin-ext",
        },
        { rel: "manifest", href: "/manifest.json" },
        { rel: "icon", href: "/favicon.ico", sizes: "any" },
        { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
        { rel: "icon", type: "image/png", sizes: "192x192", href: "/android-chrome-192x192.png" },
        { rel: "icon", type: "image/png", sizes: "512x512", href: "/android-chrome-512x512.png" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
        { rel: "mask-icon", href: "/favicon.png", color: "#d4a017" },
        // Performance: preconnect / dns-prefetch to critical origins for LCP
        { rel: "preconnect", href: "https://akasqaswpanbumrtdaak.supabase.co", crossOrigin: "anonymous" },
        { rel: "dns-prefetch", href: "https://akasqaswpanbumrtdaak.supabase.co" },
        { rel: "dns-prefetch", href: "https://www.googletagmanager.com" },
        { rel: "dns-prefetch", href: "https://www.google-analytics.com" },
      ],
      scripts: [
        {
          children: `(function(){
  if (!Promise.allSettled) Promise.allSettled = function(promises) { return Promise.all(Array.prototype.map.call(promises, function(p) { return Promise.resolve(p).then(function(value) { return { status: 'fulfilled', value: value }; }, function(reason) { return { status: 'rejected', reason: reason }; }); })); };
  if (!Array.prototype.flat) Array.prototype.flat = function(depth) { var d = depth === undefined ? 1 : Number(depth) || 0; var out = []; (function flat(arr, level) { for (var i = 0; i < arr.length; i += 1) { if (!(i in arr)) continue; var v = arr[i]; if (Array.isArray(v) && level > 0) flat(v, level - 1); else out.push(v); } })(this, d); return out; };
  if (!Array.prototype.flatMap) Array.prototype.flatMap = function(callback, thisArg) { return Array.prototype.map.call(this, callback, thisArg).flat(); };
  if (!Object.hasOwn) Object.hasOwn = function(obj, key) { return Object.prototype.hasOwnProperty.call(Object(obj), key); };
  if (!String.prototype.replaceAll) String.prototype.replaceAll = function(search, replacement) { return this.split(search).join(replacement); };
})();`,
        },
        {
          children: `(function(){
  window.__tasitsanLaunchErrors = window.__tasitsanLaunchErrors || [];
  function record(type, payload) {
    var item = payload || {};
    item.type = type;
    item.at = Date.now();
    window.__tasitsanLaunchErrors.push(item);
    if (window.__tasitsanLaunchErrors.length > 20) window.__tasitsanLaunchErrors.shift();
    try { console.error('[Taşıtsan PWA] startup ' + type, item); } catch (_) {}
    try {
      if (window.__lovableEvents && window.__lovableEvents.captureException) {
        window.__lovableEvents.captureException(new Error(item.message || 'PWA startup error'), { source: 'pwa_early_boot', type: type, item: item }, { mechanism: type, handled: false, severity: 'error' });
      }
    } catch (_) {}
  }
  window.addEventListener('error', function(event) {
    record('onerror', { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno, stack: event.error && event.error.stack });
  });
  window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason || {};
    record('unhandledrejection', { message: reason.message || String(reason), stack: reason.stack });
  });
  setTimeout(function(){
    try {
      if (window.Capacitor) return;
      var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
      var nativeLike = standalone || /; wv[)]|\bwv\b|Capacitor/i.test(navigator.userAgent || '') || !!window.Capacitor;
      var hydrated = document.documentElement.getAttribute('data-pwa-hydrated') === 'true';
      var text = (document.body && document.body.innerText || '').trim();
      var hasApp = !!document.querySelector('main, header, nav, [data-pwa-ready="true"]');
      if (nativeLike && (!hydrated || (!hasApp && text.length < 20))) {
        record('blank_screen', { message: 'PWA standalone launch did not complete', path: location.href, userAgent: navigator.userAgent, hydrated: hydrated });
      }
    } catch (_) {}
  }, 8000);
})();`,
        },
        {
          children: `(function(){
  // Eski deploy sonrası tarayıcı, silinmiş bir /assets/index-*.js chunk'ını
  // yüklemeye çalıştığında dinamik import hatası fırlatır. Bu durumda
  // service worker + Cache Storage temizlenir ve tek sefer yenileme yapılır.
  var RELOAD_FLAG = '__ts_chunk_reload_at';
  function isChunkError(err) {
    if (!err) return false;
    var msg = (err && (err.message || err.toString())) || '';
    // Desenler parçalı yazılır: hata metni HTML kaynağında düz metin olarak geçmesin.
    var P = ['Failed to ' + 'fetch dynamically imported module', 'Importing a ' + 'module script failed', 'error loading ' + 'dynamically imported module', 'ChunkLoad' + 'Error', 'Loading chunk [\\\\d]+ failed'];
    return new RegExp(P.join('|'), 'i').test(msg);

  }
  function recover() {
    try {
      var last = Number(sessionStorage.getItem(RELOAD_FLAG) || '0');
      if (Date.now() - last < 15000) return; // reload loop guard
      sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
    } catch (_) {}
    var done = function(){ try { location.reload(); } catch(_) {} };
    try {
      var cleanups = [];
      if (window.caches && caches.keys) {
        cleanups.push(caches.keys().then(function(names){
          return Promise.all(names.map(function(n){ return caches.delete(n); }));
        }).catch(function(){}));
      }
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        cleanups.push(navigator.serviceWorker.getRegistrations().then(function(regs){
          return Promise.all(regs.map(function(r){ return r.unregister().catch(function(){}); }));
        }).catch(function(){}));
      }
      Promise.all(cleanups).then(done, done);
      setTimeout(done, 1500);
    } catch (_) { done(); }
  }
  window.addEventListener('error', function(e){
    if (isChunkError(e && (e.error || e))) recover();
  });
  window.addEventListener('unhandledrejection', function(e){
    if (isChunkError(e && e.reason)) recover();
  });
})();`,
        },
        {
          type: "application/ld+json",
          children: JSON.stringify(organizationLdFromBuild()),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Taşıtsan Parça Borsası",
            url: "https://www.tasitsan.com.tr",
            inLanguage: "tr-TR",
            potentialAction: {
              "@type": "SearchAction",
              target: "https://www.tasitsan.com.tr/parts?q={search_term_string}",
              "query-input": "required name=search_term_string",
            },
          }),
        },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const isCapacitorRuntime = isAndroidCapacitorLikeRuntime();
  const [enablePwaHelpers, setEnablePwaHelpers] = useState(false);
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    document.documentElement.setAttribute("data-pwa-hydrated", "true");
    if (!isCapacitorRuntime) {
      setEnablePwaHelpers(true);
    }
    // Yeni deployment tespiti: eski JS/CSS chunk ve eski service worker cache'i
    // otomatik geçersiz kılınır (kullanıcı verisi silinmez).
    let detachVersionWatch: (() => void) | null = null;
    if (!isCapacitorRuntime) {
      import("@/lib/build-version").then(({ startVersionWatcher }) => {
        detachVersionWatch = startVersionWatcher();
      }).catch(() => { /* sürüm izleyici opsiyoneldir */ });
    }

    // Ziyaretçi konum sistemi: OTOMATİK GPS istenmez. Sadece IP tabanlı yaklaşık
    // konum arka planda alınır; GPS izin akışı LocationConsentDialog üzerinden
    // kullanıcı butona tıkladığında çalışır.
    let detachAuthGeo: (() => void) | null = null;
    import("@/lib/geolocation").then(({ initGeolocation, attachAuthGeoSync }) => {
      void initGeolocation();
      detachAuthGeo = attachAuthGeoSync();
    }).catch(() => { /* konum başarısız olursa uygulama etkilenmez */ });

    let detachTimer: (() => void) | null = null;
    const timerPromise = import("@/lib/page-timer").then(({ attachPageTimer, startPageTimer }) => {
      detachTimer = attachPageTimer();
      startPageTimer();
      return startPageTimer;
    }).catch(() => null);

    // Canlı presence (heartbeat) — admin ekranında "şu an sitede" bilgisi için.
    let detachPresence: (() => void) | null = null;
    import("@/lib/presence").then(({ startPresence }) => {
      detachPresence = startPresence();
    }).catch(() => { /* presence opsiyoneldir */ });

    const analyticsPromise = import("@/lib/analytics").then(({ trackEvent, loadGa4, gaPageView }) => {
      let ga4Id: string | null = null;
      import("@/integrations/supabase/client").then(({ supabase }) => {
        supabase
          .rpc("get_public_site_settings")
          .maybeSingle()
          .then(({ data }) => {
            ga4Id = ((data as any)?.ga4_measurement_id as string | null) ?? null;
            if (ga4Id) loadGa4(ga4Id);
            trackEvent("page_view");
            gaPageView(ga4Id, window.location.pathname);
          });
      });

      const unsub = router.subscribe("onResolved", () => {
        void timerPromise.then((startPageTimer) => startPageTimer?.());
        trackEvent("page_view");
        gaPageView(ga4Id, window.location.pathname);
      });
      return unsub;
    }).catch((error) => {
      console.error("[Taşıtsan] analytics startup failed", error);
      return () => {};
    });

    return () => {
      void analyticsPromise.then((unsub) => unsub?.());
      detachTimer?.();
      detachPresence?.();
      detachAuthGeo?.();
      detachVersionWatch?.();
    };
  }, [router, isCapacitorRuntime]);


  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
        {enablePwaHelpers && (
          <Suspense fallback={null}>
            <PwaLaunchDiagnostics />
          </Suspense>
        )}
        <div data-pwa-ready="true">
          <Outlet />
          <SiteFooter />
        </div>
        {enablePwaHelpers && (
          <Suspense fallback={null}>
            <DeepLinkHandler />
            <InstallPrompt />
            <SplashScreen />
          </Suspense>
        )}
        <Toaster theme="dark" position="top-center" />
        <Suspense fallback={null}>
          <LocationConsentDialog />
        </Suspense>
        <Suspense fallback={null}>
          <SupportChat />
        </Suspense>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
