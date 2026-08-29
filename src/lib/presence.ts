// İstemci tarafı presence (heartbeat) yöneticisi.
// - Sekme görünürken düzenli heartbeat gönderir.
// - Sekme gizlenince/kapanınca "ayrıldı" sinyali gönderir.
// - Her sekmenin ayrı tab_id'si vardır; sunucu tarafında aynı ziyaretçi
//   anahtarına sahip sekmeler tek ziyaretçi olarak birleşir.
import { presenceHeartbeat } from "@/lib/presence.functions";
import { getSessionId, getVisitorId, isInternalSession } from "@/lib/analytics";
import { getFingerprint } from "@/lib/fingerprint";
import { getCachedGeo } from "@/lib/geolocation";

const TAB_KEY = "ts_tab_id";
const VISITOR_KEY_CACHE = "ts_visitor_key";
const HEARTBEAT_MS = 20_000;

let timer: ReturnType<typeof setInterval> | null = null;
let started = false;

function tabId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let t = sessionStorage.getItem(TAB_KEY);
    if (!t) {
      t = "tab_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(TAB_KEY, t);
    }
    return t;
  } catch {
    return "tab_" + Math.random().toString(36).slice(2, 12);
  }
}

/** Sunucudan dönen anonim ziyaretçi anahtarı (analytics olaylarına eklenir). */
export function getCachedVisitorKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(VISITOR_KEY_CACHE);
  } catch {
    return null;
  }
}

function device(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Tablet|iPad/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "mobile";
  return "desktop";
}

async function beat(leaving = false) {
  if (typeof window === "undefined") return;
  const geo = getCachedGeo();
  try {
    const res = await presenceHeartbeat({
      data: {
        tabId: tabId(),
        fallbackId: getFingerprint() || getVisitorId(),
        sessionId: getSessionId(),
        path: window.location.pathname + window.location.search,
        city: geo.city ?? null,
        country: geo.country ?? null,
        device: device(),
        isBot: false,
        isInternal: isInternalSession(),
        leaving,
      },
    });
    if (res?.visitorKey) {
      try { sessionStorage.setItem(VISITOR_KEY_CACHE, res.visitorKey); } catch { /* yok sayılır */ }
    }
  } catch {
    /* heartbeat başarısız olursa uygulama etkilenmez */
  }
}

/** Presence takibini başlatır; temizleyici fonksiyon döner. */
export function startPresence(): () => void {
  if (typeof window === "undefined" || started) return () => {};
  started = true;

  const tick = () => { if (document.visibilityState === "visible") void beat(false); };
  void beat(false);
  timer = setInterval(tick, HEARTBEAT_MS);

  const onVisibility = () => {
    if (document.visibilityState === "hidden") void beat(true);
    else void beat(false);
  };
  const onHide = () => { void beat(true); };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onHide);
  window.addEventListener("beforeunload", onHide);

  return () => {
    started = false;
    if (timer) clearInterval(timer);
    timer = null;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("beforeunload", onHide);
    void beat(true);
  };
}
