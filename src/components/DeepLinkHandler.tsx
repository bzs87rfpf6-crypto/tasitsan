import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * Capacitor App plugin'den deep link olaylarını dinler ve TanStack Router
 * üzerinden in-app navigasyona çevirir.
 *
 * Desteklenenler:
 *  - https://tasitsan.com.tr/...  (Universal Link / App Link)
 *  - tasitsan://...                (custom scheme)
 */
export function DeepLinkHandler() {
  console.log("[Taşıtsan Android Debug] DeepLinkHandler render");
  const router = useRouter();

  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isCapacitorLike = Boolean((window as unknown as { Capacitor?: unknown }).Capacitor) || /; wv\)|\bwv\b|Capacitor/i.test(ua);
    if (isCapacitorLike) {
      console.log("[Taşıtsan Android Debug] DeepLinkHandler skipped in Capacitor");
      return;
    }
    console.log("[Taşıtsan Android Debug] DeepLinkHandler useEffect start");
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      // Sadece native (Capacitor) runtime'da çalışsın
      const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
      if (!w.Capacitor?.isNativePlatform?.()) return;

      try {
        const { App } = await import("@capacitor/app");
        if (cancelled) return;

        const handle = await App.addListener("appUrlOpen", (event) => {
          try {
            const url = new URL(event.url);
            const path = url.pathname + url.search + url.hash;
            if (path && path !== "/") {
              router.navigate({ to: path, replace: false });
            }
          } catch {
            // ignore malformed urls
          }
        });

        cleanup = () => handle.remove();
      } catch {
        // App plugin yoksa sessiz geç
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [router]);

  return null;
}
