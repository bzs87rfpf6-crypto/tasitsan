// Sayfada geçirilen süre takibi.
// Sayaç sayfa açıldığında başlar; sekme gizlendiğinde duraklar, tekrar
// görünür olunca devam eder. Sayfa değiştiğinde / sekme kapandığında
// toplam aktif süre `page_exit` olayı olarak kaydedilir.
import { trackPageDuration } from "./analytics";

type PageCtx = { path: string; partId?: string | null; title?: string | null };

let current: PageCtx | null = null;
let accumulated = 0;
let startedAt = 0;

function readCtx(): PageCtx {
  const path = window.location.pathname + window.location.search;
  const el = document.querySelector<HTMLElement>("[data-part-id]");
  return {
    path,
    partId: el?.dataset.partId ?? null,
    title: document.title || null,
  };
}

function activeMs(): number {
  return accumulated + (startedAt ? Date.now() - startedAt : 0);
}

function flush(ctx: PageCtx | null, ms: number) {
  if (!ctx || ms < 1000) return;
  void trackPageDuration(ms, {
    path: ctx.path,
    ...(ctx.partId ? { part_id: ctx.partId } : {}),
    ...(ctx.title ? { title: ctx.title } : {}),
    page_type: ctx.path.startsWith("/parts/")
      ? "product"
      : ctx.path.startsWith("/u/")
        ? "seller"
        : "page",
  });
}

/** Yeni sayfaya geçildi — öncekini kaydet, sayacı sıfırla. */
export function startPageTimer() {
  if (typeof window === "undefined") return;
  const prev = current;
  const ms = activeMs();
  if (prev && prev.path !== (window.location.pathname + window.location.search)) {
    flush(prev, ms);
  } else if (prev) {
    // aynı sayfa (yenileme benzeri) — süreyi taşımıyoruz
    flush(prev, ms);
  }
  // Ürün başlığı/id'si DOM'a biraz sonra basılabilir; kısa gecikmeyle okuyoruz.
  current = readCtx();
  setTimeout(() => {
    if (current) current = { ...readCtx(), path: current.path };
  }, 1200);
  accumulated = 0;
  startedAt = Date.now();
}

/** Sekme değişimi / sayfa kapanışı dinleyicilerini kurar. */
export function attachPageTimer(): () => void {
  if (typeof window === "undefined") return () => {};

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      const ms = activeMs();
      startedAt = 0;
      accumulated = 0;
      flush(current, ms);
    } else if (!startedAt) {
      startedAt = Date.now();
    }
  };
  const onHide = () => {
    const ms = activeMs();
    startedAt = 0;
    accumulated = 0;
    flush(current, ms);
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onHide);
  return () => {
    onHide();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onHide);
  };
}
