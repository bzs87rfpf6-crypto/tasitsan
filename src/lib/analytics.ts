// Lightweight first-party analytics + GA4 forwarder.
// Tüm olaylar Supabase'deki `analytics_events` tablosuna yazılır.
import { supabase } from "@/integrations/supabase/client";
import { getCachedGeo, initGeolocation } from "./geolocation";
import { getFingerprint, markVisitAndCheckUnique, engagementOf } from "./fingerprint";

const SESSION_KEY = "ts_session_id";
const VISITOR_KEY = "ts_visitor_id";


type Geo = { city: string | null; country: string | null };

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function uid() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = uid();
      sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch {
    return "anon";
  }
}

/** Kalıcı ziyaretçi kimliği — oturumlar arası benzersiz ziyaretçi sayımı için. */
export function getVisitorId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let v = localStorage.getItem(VISITOR_KEY);
    if (!v) {
      v = uid() + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(VISITOR_KEY, v);
    }
    return v;
  } catch {
    return getSessionId();
  }
}

// AI search → product view bridge. Assistant writes ts_last_ai_search on click.
export function getAiSearchBridge(partId?: string | null): { log_id: string; part_id: string; query: string; ts: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("ts_last_ai_search");
    if (!raw) return null;
    const b = JSON.parse(raw) as { log_id: string; part_id: string; query: string; ts: number };
    if (Date.now() - b.ts > 30 * 60 * 1000) return null;
    if (partId && b.part_id !== partId) return null;
    return b;
  } catch { return null; }
}

function detectDevice(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Tablet|iPad/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "mobile";
  return "desktop";
}

// Yalnızca editör/önizleme/geliştirme host'ları — yayındaki *.lovable.app alanı gerçek trafiktir.
const INTERNAL_HOST_RE = /preview--|^id-preview|-dev\.lovable\.app$|(^|\.)lovable\.dev$|(^|\.)lovableproject\.com$|^localhost$|^127\.0\.0\.1$|^\[::1\]$/i;

const STAFF_FLAG_KEY = "ts_staff_session";

/** Yönetici/geliştirici oturumu işareti (sunucu tarafı doğrulaması ayrıca yapılır). */
export function setStaffSession(isStaff: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (isStaff) sessionStorage.setItem(STAFF_FLAG_KEY, "1");
    else sessionStorage.removeItem(STAFF_FLAG_KEY);
  } catch { /* yok sayılır */ }
}

/**
 * Lovable editörü / önizleme / geliştirme ortamı ya da yönetici oturumu tespiti.
 * Bu oturumlar gerçek ziyaretçi sayılmaz; "Admin / Geliştirici" olarak işaretlenir.
 */
export function isInternalSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    try {
      if (sessionStorage.getItem(STAFF_FLAG_KEY) === "1") return true;
    } catch { /* yok sayılır */ }
    const host = window.location.hostname;
    if (INTERNAL_HOST_RE.test(host)) return true;

    // Editör/preview iframe içinde çalışıyor mu?
    if (window.self !== window.top) {
      const ancestors = (location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
      if (!ancestors || ancestors.length === 0) return true;
      for (let i = 0; i < ancestors.length; i++) {
        if (/lovable\.(app|dev)|lovableproject\.com|localhost/i.test(ancestors[i])) return true;
      }
      return true; // bilinmeyen iframe gömmesi de gerçek ziyaretçi sayılmaz
    }
    if (/lovable\.(app|dev)|lovableproject\.com/i.test(document.referrer || "")) return true;
    if (import.meta.env.DEV) return true;
  } catch {
    /* yok sayılır */
  }
  return false;
}


// Fallback regex used until the DB-managed rules load (and if the fetch fails).
const FALLBACK_BOT_UA_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|semrush|ahrefs|mj12|dotbot|petalbot|yandex|baidu|duckduckbot|applebot|googlebot|bingbot|embedly|vercelbot|chrome-lighthouse|phantom|puppeteer|selenium/i;

const BOT_RULES_KEY = "ts_bot_rules_v1";
const BOT_RULES_TTL_MS = 10 * 60 * 1000; // refresh every 10 min
let botRuleRegex: RegExp | null = null;
let botRulesLoadedAt = 0;
let botRulesInflight: Promise<RegExp> | null = null;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePatterns(patterns: string[]): RegExp {
  const cleaned = patterns.map((p) => p.trim()).filter(Boolean).map(escapeRegex);
  if (!cleaned.length) return FALLBACK_BOT_UA_RE;
  return new RegExp(cleaned.join("|"), "i");
}

async function loadBotRules(): Promise<RegExp> {
  // Cached in-memory
  if (botRuleRegex && Date.now() - botRulesLoadedAt < BOT_RULES_TTL_MS) return botRuleRegex;
  if (botRulesInflight) return botRulesInflight;

  // Cached in sessionStorage
  try {
    const raw = sessionStorage.getItem(BOT_RULES_KEY);
    if (raw) {
      const { patterns, t } = JSON.parse(raw) as { patterns: string[]; t: number };
      if (Date.now() - t < BOT_RULES_TTL_MS) {
        botRuleRegex = compilePatterns(patterns);
        botRulesLoadedAt = t;
        return botRuleRegex;
      }
    }
  } catch { /* ignore */ }

  botRulesInflight = (async () => {
    try {
      const { data } = await supabase
        .from("bot_filter_rules")
        .select("pattern")
        .eq("enabled", true);
      const patterns = (data ?? []).map((r) => r.pattern).filter(Boolean);
      botRuleRegex = compilePatterns(patterns);
      botRulesLoadedAt = Date.now();
      try { sessionStorage.setItem(BOT_RULES_KEY, JSON.stringify({ patterns, t: botRulesLoadedAt })); } catch {}
      return botRuleRegex;
    } catch {
      botRuleRegex = FALLBACK_BOT_UA_RE;
      botRulesLoadedAt = Date.now();
      return botRuleRegex;
    } finally {
      botRulesInflight = null;
    }
  })();
  return botRulesInflight;
}

async function isLikelyBot(): Promise<boolean> {
  if (typeof navigator === "undefined") return true;
  if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return true;
  const ua = navigator.userAgent || "";
  // Use cached rules if already loaded; otherwise check fallback synchronously
  // and refresh async for next time.
  const re = botRuleRegex ?? FALLBACK_BOT_UA_RE;
  if (!botRuleRegex) { void loadBotRules(); }
  return re.test(ua);
}

async function loadGeo(): Promise<Geo> {
  if (typeof window === "undefined") return { city: null, country: null };
  // Paylaşılan geolocation modülü ilk çağrıda GPS izni ister ve sonucu (veya IP fallback'i) cache'ler.
  const cached = getCachedGeo();
  if (cached.source !== "unknown") return { city: cached.city, country: cached.country };
  try {
    const geo = await initGeolocation();
    return { city: geo.city, country: geo.country };
  } catch {
    return { city: null, country: null };
  }
}

export async function trackEvent(
  eventType: string,
  metadata: Record<string, unknown> = {},
  opts: { durationMs?: number; engagement?: string } = {},
) {
  if (typeof window === "undefined") return;
  const bot = await isLikelyBot();
  const internal = isInternalSession();
  try {
    const geo = bot || internal ? { city: null, country: null } : await loadGeo();
    const { data: userData } = await supabase.auth.getSession();
    const userId = userData.session?.user?.id ?? null;
    const fingerprint = bot ? null : getFingerprint();
    const firstVisit24h = !bot && !internal && eventType === "page_view" ? markVisitAndCheckUnique() : false;

    // IP tabanlı anonim ziyaretçi anahtarı — presence heartbeat'i tarafından yazılır.
    let visitorKey: string | null = null;
    try { visitorKey = sessionStorage.getItem("ts_visitor_key"); } catch { /* yok sayılır */ }

    await supabase.from("analytics_events").insert({
      event_type: eventType,
      session_id: getSessionId(),
      visitor_id: bot ? null : getVisitorId(),
      visitor_key: visitorKey,
      fingerprint,
      is_bot: bot,
      is_internal: internal,
      duration_ms: opts.durationMs ?? null,
      engagement: opts.engagement ?? null,
      user_id: userId,
      path: window.location.pathname + window.location.search,
      referrer: document.referrer || null,
      city: geo.city,
      country: geo.country,
      device: detectDevice(),
      user_agent: navigator.userAgent,
      metadata: {
        ...metadata,
        ...(opts.durationMs ? { duration_ms: opts.durationMs } : {}),
        ...(opts.engagement ? { engagement: opts.engagement } : {}),
        ...(firstVisit24h ? { first_visit_24h: true } : {}),
        ...(internal ? { internal_env: true } : {}),
      } as never,
    });

    if (!bot && !internal && typeof window.gtag === "function") {
      window.gtag("event", eventType, {
        ...metadata,
        page_path: window.location.pathname,
        city: geo.city,
        device: detectDevice(),
      });
    }
  } catch (err) {
    console.warn("[analytics] track failed", err);
  }

}

/** Sayfada geçirilen süreyi ilgi seviyesiyle birlikte kaydeder. */
export async function trackPageDuration(
  durationMs: number,
  metadata: Record<string, unknown> = {},
) {
  if (durationMs < 1000) return;
  await trackEvent("page_exit", metadata, {
    durationMs: Math.round(durationMs),
    engagement: engagementOf(durationMs),
  });
}


let ga4Loaded = false;
export function loadGa4(measurementId: string) {
  if (typeof window === "undefined" || ga4Loaded || !measurementId) return;
  ga4Loaded = true;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false });
}

export function gaPageView(measurementId: string | null, path: string) {
  if (typeof window === "undefined" || !window.gtag || !measurementId) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}
