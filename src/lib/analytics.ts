// Lightweight first-party analytics + GA4 forwarder.
// Tüm olaylar Supabase'deki `analytics_events` tablosuna yazılır.
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "ts_session_id";
const GEO_KEY = "ts_geo_v1";

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

function detectDevice(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Tablet|iPad/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "mobile";
  return "desktop";
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
  try {
    const cached = sessionStorage.getItem(GEO_KEY);
    if (cached) return JSON.parse(cached) as Geo;
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    if (!res.ok) throw new Error("geo failed");
    const j = (await res.json()) as { city?: string; country_name?: string };
    const geo: Geo = {
      city: j.city ?? null,
      country: j.country_name ?? null,
    };
    try { sessionStorage.setItem(GEO_KEY, JSON.stringify(geo)); } catch {}
    return geo;
  } catch {
    const geo: Geo = { city: null, country: null };
    try { sessionStorage.setItem(GEO_KEY, JSON.stringify(geo)); } catch {}
    return geo;
  }
}

export async function trackEvent(
  eventType: string,
  metadata: Record<string, unknown> = {},
) {
  if (typeof window === "undefined") return;
  if (isLikelyBot()) return;
  try {
    const geo = await loadGeo();
    const { data: userData } = await supabase.auth.getSession();
    const userId = userData.session?.user?.id ?? null;

    await supabase.from("analytics_events").insert({
      event_type: eventType,
      session_id: getSessionId(),
      user_id: userId,
      path: window.location.pathname + window.location.search,
      referrer: document.referrer || null,
      city: geo.city,
      country: geo.country,
      device: detectDevice(),
      user_agent: navigator.userAgent,
      metadata: metadata as never,
    });

    if (typeof window.gtag === "function") {
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
