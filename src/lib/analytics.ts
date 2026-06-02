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

const BOT_UA_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|semrush|ahrefs|mj12|dotbot|petalbot|yandex|baidu|duckduckbot|applebot|googlebot|bingbot|embedly|vercelbot|chrome-lighthouse|phantom|puppeteer|selenium/i;

function isLikelyBot(): boolean {
  if (typeof navigator === "undefined") return true;
  // Headless browsers expose webdriver=true
  if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return true;
  return BOT_UA_RE.test(navigator.userAgent || "");
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
