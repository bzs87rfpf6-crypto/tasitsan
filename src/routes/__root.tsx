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
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";

const PwaLaunchDiagnostics = lazy(() => import("@/components/PwaLaunchDiagnostics").then((mod) => ({ default: mod.PwaLaunchDiagnostics })));
const DeepLinkHandler = lazy(() => import("@/components/DeepLinkHandler").then((mod) => ({ default: mod.DeepLinkHandler })));
const InstallPrompt = lazy(() => import("@/components/InstallPrompt").then((mod) => ({ default: mod.InstallPrompt })));
const SplashScreen = lazy(() => import("@/components/SplashScreen").then((mod) => ({ default: mod.SplashScreen })));

declare global {
  interface Window {
    __tasitsanAndroidDebugLog?: (message: string, payload?: unknown) => void;
  }
}

function androidDebugLog(message: string, payload?: unknown) {
  if (typeof window === "undefined") return;
  console.log(`[Taşıtsan Android Debug] ${message}`, payload ?? "");
  window.__tasitsanAndroidDebugLog?.(message, payload);
}

function AndroidDebugMarker({ label }: { label: string }) {
  androidDebugLog(label);
  return null;
}

function AndroidCapacitorTestScreen() {
  androidDebugLog("Taşıtsan Android Test Ekranı render edildi");
  return (
    <main
      data-android-test-screen="true"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "72px 20px 24px",
        background: "#121212",
        color: "#f5f2eb",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        textAlign: "center",
      }}
    >
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 2147483647,
          padding: "12px 14px calc(12px + env(safe-area-inset-top))",
          background: "#d4a017",
          color: "#14110e",
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: 0,
          boxShadow: "0 8px 24px rgba(0,0,0,.35)",
        }}
      >
        ANDROID DEBUG BUILD · React render çalışıyor
      </div>
      <section>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.15 }}>Taşıtsan Android Test Ekranı</h1>
        <p style={{ margin: "14px auto 0", maxWidth: 320, color: "#d8d0c2", fontSize: 14, lineHeight: 1.5 }}>
          Bu ekran Capacitor Android ortamında RootComponent render olduğunda gösterilir.
        </p>
      </section>
    </main>
  );
}

function isAndroidCapacitorLikeRuntime() {
  if (typeof window === "undefined") return false;
  const hasCapacitor = Boolean((window as unknown as { Capacitor?: unknown }).Capacitor);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return hasCapacitor || /; wv\)|\bwv\b|Capacitor/i.test(ua);
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
  console.error(error);
  androidDebugLog("Global error boundary", { message: error.message, stack: error.stack });
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Bir şeyler ters gitti</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
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
      { name: "theme-color", content: "#121212" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Taşıtsan" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      { title: "Taşıtsan Parça Borsası — Otomotiv Yedek Parça" },
      { name: "description", content: "Türkiye'nin yedek parça borsası. Tüm teklif ve iletişim süreçleri Taşıtsan üzerinden güvenle yönetilir." },
      { name: "robots", content: "index,follow,max-image-preview:large,max-snippet:-1" },
      { property: "og:title", content: "Taşıtsan Parça Borsası — Otomotiv Yedek Parça" },
      { property: "og:description", content: "Türkiye'nin yedek parça borsası. Tüm teklif ve iletişim süreçleri Taşıtsan üzerinden güvenle yönetilir." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Taşıtsan Parça Borsası" },
      { property: "og:locale", content: "tr_TR" },
      { name: "twitter:title", content: "Taşıtsan Parça Borsası — Otomotiv Yedek Parça" },
      { name: "twitter:description", content: "Türkiye'nin yedek parça borsası. Tüm teklif ve iletişim süreçleri Taşıtsan üzerinden güvenle yönetilir." },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    if (gsc) meta.push({ name: "google-site-verification", content: gsc });
    return {
      meta,
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "manifest", href: "/manifest.json" },
        { rel: "icon", href: "/favicon.ico", sizes: "any" },
        { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
        { rel: "icon", type: "image/png", sizes: "192x192", href: "/android-chrome-192x192.png" },
        { rel: "icon", type: "image/png", sizes: "512x512", href: "/android-chrome-512x512.png" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
        { rel: "mask-icon", href: "/favicon.png", color: "#d4a017" },
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
  var isCapacitor = !!window.Capacitor || /; wv\)|\bwv\b|Capacitor/i.test(navigator.userAgent || '');
  function ensureAndroidDebugPanel() {
    if (!isCapacitor || !document.body) return null;
    var existing = document.getElementById('tasitsan-android-debug');
    if (existing) return existing;
    var panel = document.createElement('pre');
    panel.id = 'tasitsan-android-debug';
    panel.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;max-height:45vh;overflow:auto;margin:0;padding:10px;border:1px solid rgba(212,160,23,.55);border-radius:10px;background:rgba(18,18,18,.94);color:#f5f2eb;font:12px/1.35 monospace;white-space:pre-wrap;text-align:left;direction:ltr;';
    panel.textContent = '[Taşıtsan Android Debug] panel ready\\n';
    document.body.appendChild(panel);
    return panel;
  }
  function showAndroidDebug(message, payload) {
    try {
      var panel = ensureAndroidDebugPanel();
      if (!panel) return;
      var detail = payload ? ' ' + JSON.stringify(payload).slice(0, 900) : '';
      panel.textContent += '[' + new Date().toLocaleTimeString() + '] ' + message + detail + '\\n';
      panel.scrollTop = panel.scrollHeight;
    } catch (_) {}
  }
  window.__tasitsanAndroidDebugLog = showAndroidDebug;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ showAndroidDebug('DOMContentLoaded'); }, { once: true });
  } else {
    setTimeout(function(){ showAndroidDebug('document already ready'); }, 0);
  }
  function record(type, payload) {
    var item = payload || {};
    item.type = type;
    item.at = Date.now();
    window.__tasitsanLaunchErrors.push(item);
    if (window.__tasitsanLaunchErrors.length > 20) window.__tasitsanLaunchErrors.shift();
    try { console.error('[Taşıtsan PWA] startup ' + type, item); } catch (_) {}
    showAndroidDebug('ERROR ' + type, item);
    try {
      if (window.__lovableEvents && window.__lovableEvents.captureException) {
        window.__lovableEvents.captureException(new Error(item.message || 'PWA startup error'), { source: 'pwa_early_boot', type: type, item: item }, { mechanism: type, handled: false, severity: 'error' });
      }
    } catch (_) {}
  }
  function showRecoveryScreen() {
    if (document.getElementById('tasitsan-pwa-recovery')) return;
    var root = document.createElement('div');
    root.id = 'tasitsan-pwa-recovery';
    root.setAttribute('role', 'alert');
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:#14110e;color:#f5f2eb;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;text-align:center;';
    root.innerHTML = '<div style="max-width:340px"><img src="/icon-192.png" alt="" width="96" height="96" style="width:96px;height:96px;margin:0 auto 18px;filter:drop-shadow(0 0 24px rgba(212,160,23,.38))"/><h1 style="margin:0 0 8px;color:#d4a017;font-size:24px;letter-spacing:.04em">Taşıtsan</h1><p style="margin:0 0 18px;color:#d8d0c2;font-size:14px;line-height:1.45">Uygulama açılışı tamamlanamadı. Bağlantıyı yenileyerek güvenli şekilde tekrar deneyin.</p><button type="button" style="border:0;border-radius:12px;background:#d4a017;color:#14110e;font-weight:700;padding:12px 18px;font-size:14px">Tekrar Aç</button></div>';
    root.getElementsByTagName('button')[0].onclick = function(){ location.replace('/?pwa-retry=' + Date.now()); };
    document.body.appendChild(root);
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
      if (window.Capacitor) {
        try { console.log('[Taşıtsan Android Debug] PWA recovery watchdog skipped in Capacitor'); } catch (_) {}
        return;
      }
      var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
      var nativeLike = standalone || /; wv\)|\bwv\b|Capacitor/i.test(navigator.userAgent || '') || !!window.Capacitor;
      var hydrated = document.documentElement.getAttribute('data-pwa-hydrated') === 'true';
      var text = (document.body && document.body.innerText || '').trim();
      var hasApp = !!document.querySelector('main, header, nav, [data-pwa-ready="true"]');
      if (nativeLike && (!hydrated || (!hasApp && text.length < 20))) {
        record('blank_screen', { message: 'PWA standalone launch did not complete', path: location.href, userAgent: navigator.userAgent, hydrated: hydrated });
        showRecoveryScreen();
      }
    } catch (_) {}
  }, 8000);
})();`,
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Taşıtsan Parça Borsası",
            url: "https://tasitsan.com.tr",
            logo: "https://tasitsan.com.tr/icon-512.png",
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
  androidDebugLog("RootComponent render başladı", {
    isCapacitorRuntime,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "ssr",
  });
  const [enablePwaHelpers, setEnablePwaHelpers] = useState(false);
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    androidDebugLog("RootComponent useEffect başladı", { isCapacitorRuntime });
    document.documentElement.setAttribute("data-pwa-hydrated", "true");
    if (isCapacitorRuntime) {
      androidDebugLog("PWA-only helpers disabled in Capacitor");
    } else {
      setEnablePwaHelpers(true);
    }
    // Lazy import to avoid SSR issues
    import("@/lib/analytics").then(({ trackEvent, loadGa4, gaPageView }) => {
      let ga4Id: string | null = null;
      // Load GA4 id from site settings (public read).
      import("@/integrations/supabase/client").then(({ supabase }) => {
        supabase
          .rpc("get_public_site_settings")
          .maybeSingle()
          .then(({ data }) => {
            ga4Id = ((data as any)?.ga4_measurement_id as string | null) ?? null;
            if (ga4Id) loadGa4(ga4Id);
            // initial page view
            trackEvent("page_view");
            gaPageView(ga4Id, window.location.pathname);
          });
      });

      const unsub = router.subscribe("onResolved", () => {
        trackEvent("page_view");
        gaPageView(ga4Id, window.location.pathname);
      });
      return () => unsub();
    }).catch((error) => {
      console.error("[Taşıtsan Android Debug] analytics startup failed", error);
      androidDebugLog("analytics startup failed", { message: error instanceof Error ? error.message : String(error) });
    });
  }, [router]);

  // NOT: Eski Capacitor bypass ekranı kaldırıldı. WebView artık canlı SSR
  // (https://tasitsan.com.tr) yüklüyor, normal uygulama render olmalı.


  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AndroidDebugMarker label="AuthProvider render edildi" />
        {enablePwaHelpers && (
          <Suspense fallback={null}>
            <PwaLaunchDiagnostics />
          </Suspense>
        )}
        <div data-pwa-ready="true">
          <AndroidDebugMarker label="Outlet render edildi" />
          <Outlet />
        </div>
        {enablePwaHelpers && (
          <Suspense fallback={null}>
            <DeepLinkHandler />
            <InstallPrompt />
            <SplashScreen />
          </Suspense>
        )}
        <Toaster theme="dark" position="top-center" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
