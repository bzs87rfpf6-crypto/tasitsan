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
      { name: "theme-color", content: "#f4f5f7" },
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
    meta.push({ name: "google-site-verification", content: "5btdy3woANJj2uefmPtCejBLwHmcXm8Ljv" });
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
      var nativeLike = standalone || /; wv\)|\bwv\b|Capacitor/i.test(navigator.userAgent || '') || !!window.Capacitor;
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
  const [enablePwaHelpers, setEnablePwaHelpers] = useState(false);
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    document.documentElement.setAttribute("data-pwa-hydrated", "true");
    if (!isCapacitorRuntime) {
      setEnablePwaHelpers(true);
    }
    import("@/lib/analytics").then(({ trackEvent, loadGa4, gaPageView }) => {
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
        trackEvent("page_view");
        gaPageView(ga4Id, window.location.pathname);
      });
      return () => unsub();
    }).catch((error) => {
      console.error("[Taşıtsan] analytics startup failed", error);
    });
  }, [router, isCapacitorRuntime]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {enablePwaHelpers && (
          <Suspense fallback={null}>
            <PwaLaunchDiagnostics />
          </Suspense>
        )}
        <div data-pwa-ready="true">
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
