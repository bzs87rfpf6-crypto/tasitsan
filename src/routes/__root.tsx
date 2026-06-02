import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";

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
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0a0907" },
      { title: "Taşıtsan Parça Borsası — Otomotiv Yedek Parça" },
      { name: "description", content: "Türkiye'nin yedek parça borsası. Tüm teklif ve iletişim süreçleri Taşıtsan üzerinden güvenle yönetilir." },
      { property: "og:title", content: "Taşıtsan Parça Borsası — Otomotiv Yedek Parça" },
      { property: "og:description", content: "Türkiye'nin yedek parça borsası. Tüm teklif ve iletişim süreçleri Taşıtsan üzerinden güvenle yönetilir." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Taşıtsan Parça Borsası — Otomotiv Yedek Parça" },
      { name: "twitter:description", content: "Türkiye'nin yedek parça borsası. Tüm teklif ve iletişim süreçleri Taşıtsan üzerinden güvenle yönetilir." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/44ed9bac-18cd-4f59-96f0-2ce039764958/id-preview-2e3dda71--d82a33fa-37e5-48d9-b071-c90c30694bf1.lovable.app-1780327626703.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/44ed9bac-18cd-4f59-96f0-2ce039764958/id-preview-2e3dda71--d82a33fa-37e5-48d9-b071-c90c30694bf1.lovable.app-1780327626703.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { rel: "icon", href: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
    ],
  }),
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
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    // Lazy import to avoid SSR issues
    import("@/lib/analytics").then(({ trackEvent, loadGa4, gaPageView }) => {
      let ga4Id: string | null = null;
      // Load GA4 id from site settings (public read).
      import("@/integrations/supabase/client").then(({ supabase }) => {
        supabase
          .from("site_settings")
          .select("ga4_measurement_id")
          .maybeSingle()
          .then(({ data }) => {
            ga4Id = (data?.ga4_measurement_id as string | null) ?? null;
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
    });
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster theme="dark" position="top-center" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
